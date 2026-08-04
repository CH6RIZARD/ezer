// =============================================================================
// EZER — card editor store
//
// Zustand + Immer patches. `produceWithPatches` hands back
// [next, patches, inversePatches], which IS a command/undo substrate: push the
// inverse onto a stack, `applyPatches` to undo. No bespoke history engine.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE
//
//  1. ONE UNDO ENTRY PER COMPLETED GESTURE. A drag emits ~60 updates a second;
//     recording each would make Undo useless — you would tap it forty times to
//     reverse one drag. Live transforms go through `previewTransform` (no
//     history, no document write). Only `commitTransform` on gesture end
//     records anything.
//  2. SELECTION IS SESSION STATE, NOT DOCUMENT STATE. It sits outside the
//     patch-recorded slice entirely, so tapping around never pollutes history.
//  3. EVERY DOCUMENT MUTATION GOES THROUGH `mutate`. Uniform history, uniform
//     autosave, uniform validation — no path that quietly skips one.
// =============================================================================

import { create } from 'zustand';
import { enablePatches, produceWithPatches, applyPatches, type Patch } from 'immer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createDocument,
  migrateDocument,
  validateDocument,
  blockingIssues,
  indexBetween,
  topIndex,
  visibleElements,
  tierById,
  KEEP_OUT_ZONES,
  boundsOf,
  rectsOverlap,
  type CardDocument,
  type CardElement,
  type ValidationIssue,
} from '../utils/cardDocument';

// Immer ships patch support opt-in.
enablePatches();

const DRAFT_KEY = '@ezer_card_draft';
const AUTOSAVE_DEBOUNCE_MS = 500;
/** Bounded so a long session cannot grow the stack without limit. */
const MAX_HISTORY = 60;

/** Where a design sits in the moderation lifecycle. */
export type DesignStatus = 'draft' | 'pendingReview' | 'approved' | 'rejected' | 'ordered';

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

/** Live, un-committed transform for the element being manipulated. */
export interface LiveTransform {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface CardEditorState {
  doc: CardDocument;

  // --- session state: never recorded in history ------------------------------
  selectedId: string | null;
  live: LiveTransform | null;
  status: DesignStatus;
  rejectionReason: string | null;
  hydrated: boolean;

  past: HistoryEntry[];
  future: HistoryEntry[];

  // --- derived ---------------------------------------------------------------
  issues: () => ValidationIssue[];
  canSubmit: () => boolean;
  /** Zones this element currently intrudes on — drives the live warning. */
  intrusions: (elementId: string) => string[];

  // --- document commands -----------------------------------------------------
  setTier: (tierId: string) => void;
  addElement: (el: Omit<CardElement, 'z' | 'version' | 'updated' | 'typeName' | 'isDeleted'>) => void;
  updateElement: (id: string, patch: Partial<CardElement>, label?: string) => void;
  deleteElement: (id: string) => void;
  bringToFront: (id: string) => void;
  clearAll: () => void;

  // --- gesture lifecycle -----------------------------------------------------
  select: (id: string | null) => void;
  previewTransform: (t: LiveTransform) => void;
  commitTransform: () => void;
  cancelTransform: () => void;

  // --- history ---------------------------------------------------------------
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // --- persistence & lifecycle ----------------------------------------------
  hydrate: () => Promise<void>;
  save: () => Promise<void>;
  submitForReview: () => void;
  markApproved: () => void;
  markRejected: (reason: string) => void;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useCardEditor = create<CardEditorState>((set, get) => {
  /**
   * The single write path. Produces the next document, records the inverse
   * patch, clears redo, and schedules an autosave.
   *
   * `record: false` is for changes that must never be undoable — currently only
   * tier substrate sync, which rides along with a change that IS recorded.
   */
  const mutate = (label: string, recipe: (d: CardDocument) => void, record = true) => {
    const { doc, past } = get();

    const [next, patches, inverse] = produceWithPatches(doc, draft => {
      recipe(draft);
      draft.updatedAt = new Date().toISOString();
    });

    if (patches.length === 0) return; // No-op: never record an empty entry.

    set({
      doc: next,
      past: record ? [...past, { label, patches, inverse }].slice(-MAX_HISTORY) : past,
      // Any new edit invalidates the redo branch — standard linear history.
      future: record ? [] : get().future,
    });

    scheduleSave();
  };

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().save(), AUTOSAVE_DEBOUNCE_MS);
  };

  return {
    doc: createDocument(),
    selectedId: null,
    live: null,
    status: 'draft',
    rejectionReason: null,
    hydrated: false,
    past: [],
    future: [],

    issues: () => validateDocument(get().doc),
    canSubmit: () => blockingIssues(validateDocument(get().doc)).length === 0,

    intrusions: elementId => {
      const { doc, live } = get();
      const el = doc.elements.find(e => e.id === elementId);
      if (!el || el.isDeleted) return [];

      // Test the LIVE position while dragging, so the warning tracks the finger
      // rather than lagging until release.
      const probe =
        live && live.id === elementId
          ? { ...el, x: live.x, y: live.y, w: el.w * live.scale, h: el.h * live.scale }
          : el;

      const b = boundsOf(probe as CardElement);
      return KEEP_OUT_ZONES.filter(z => rectsOverlap(b, z)).map(z => z.id);
    },

    // --- document commands ---------------------------------------------------

    setTier: tierId =>
      mutate('Change card', d => {
        d.tierId = tierId;
        // The substrate is the tier's, unless the user painted their own
        // background — then theirs wins and we leave it alone.
        const previous = tierById(d.tierId);
        if (d.background.color === previous.substrate) {
          d.background.color = tierById(tierId).substrate;
        }
      }),

    addElement: el =>
      mutate('Add', d => {
        d.elements.push({
          ...(el as CardElement),
          typeName: 'element',
          z: topIndex(d),
          isDeleted: false,
          version: 1,
          updated: Date.now(),
        });
      }),

    updateElement: (id, patch, label = 'Edit') =>
      mutate(label, d => {
        const el = d.elements.find(e => e.id === id);
        if (!el || el.locked) return;
        Object.assign(el, patch, { version: el.version + 1, updated: Date.now() });
      }),

    deleteElement: id => {
      mutate('Delete', d => {
        const el = d.elements.find(e => e.id === id);
        if (!el) return;
        // Soft delete: undo restores THIS element, with its id and z-order
        // intact, rather than resurrecting a lookalike.
        el.isDeleted = true;
        el.updated = Date.now();
      });
      if (get().selectedId === id) set({ selectedId: null });
    },

    bringToFront: id =>
      mutate('Bring to front', d => {
        const el = d.elements.find(e => e.id === id);
        if (!el) return;
        const live = visibleElements(d).filter(e => e.id !== id);
        el.z = live.length ? indexBetween(live[live.length - 1].z, null) : el.z;
        el.updated = Date.now();
      }),

    clearAll: () =>
      mutate('Clear card', d => {
        for (const el of d.elements) el.isDeleted = true;
      }),

    // --- gesture lifecycle ---------------------------------------------------

    select: id => set({ selectedId: id }),

    /**
     * Called on EVERY move frame. Deliberately writes only session state: no
     * document write, no patch, no history entry, no autosave.
     */
    previewTransform: t => set({ live: t }),

    /** Gesture end — the one place a manipulation becomes an undo entry. */
    commitTransform: () => {
      const { live, doc } = get();
      if (!live) return;

      const el = doc.elements.find(e => e.id === live.id);
      if (!el) {
        set({ live: null });
        return;
      }

      mutate('Move', d => {
        const target = d.elements.find(e => e.id === live.id);
        if (!target) return;
        target.x = live.x;
        target.y = live.y;
        target.w = el.w * live.scale;
        target.h = el.h * live.scale;
        target.rotation = live.rotation;
        target.version += 1;
        target.updated = Date.now();
      });

      set({ live: null });
    },

    /** Abandon an in-flight gesture without writing anything. */
    cancelTransform: () => set({ live: null }),

    // --- history -------------------------------------------------------------

    undo: () => {
      const { past, future, doc } = get();
      if (!past.length) return;
      const entry = past[past.length - 1];
      set({
        doc: applyPatches(doc, entry.inverse),
        past: past.slice(0, -1),
        future: [entry, ...future],
        // A restored element may no longer exist under the cursor.
        selectedId: null,
        live: null,
      });
      scheduleSave();
    },

    redo: () => {
      const { past, future, doc } = get();
      if (!future.length) return;
      const [entry, ...rest] = future;
      set({
        doc: applyPatches(doc, entry.patches),
        past: [...past, entry],
        future: rest,
        selectedId: null,
        live: null,
      });
      scheduleSave();
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    // --- persistence ---------------------------------------------------------

    hydrate: async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Old drafts are migrated, not discarded. A saved card that stops
          // opening after an update is a support ticket, not a cosmetic bug.
          const doc = migrateDocument(parsed.doc ?? parsed);
          if (doc) {
            set({
              doc,
              status: parsed.status ?? 'draft',
              rejectionReason: parsed.rejectionReason ?? null,
            });
          }
        }
      } catch {
        // A corrupt draft must not brick the editor — fall back to a new one.
      } finally {
        set({ hydrated: true });
      }
    },

    save: async () => {
      const { doc, status, rejectionReason } = get();
      try {
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, status, rejectionReason }));
      } catch {
        // Autosave is best-effort; the in-memory document is still intact.
      }
    },

    // --- moderation lifecycle ------------------------------------------------

    submitForReview: () => {
      if (!get().canSubmit()) return; // Hard gate, mirroring the UI's.
      set({ status: 'pendingReview', rejectionReason: null });
      void get().save();
    },

    markApproved: () => {
      set({ status: 'approved' });
      void get().save();
    },

    /**
     * Rejection NEVER discards the draft — that is the failure mode the
     * research singles out. The design returns to `draft`, fully intact, so it
     * can be fixed and resubmitted in place.
     */
    markRejected: reason => {
      set({ status: 'draft', rejectionReason: reason });
      void get().save();
    },

    reset: () => {
      set({
        doc: createDocument(get().doc.tierId),
        selectedId: null,
        live: null,
        past: [],
        future: [],
        status: 'draft',
        rejectionReason: null,
      });
      void get().save();
    },
  };
});

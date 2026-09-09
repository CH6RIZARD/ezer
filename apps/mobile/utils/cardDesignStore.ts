// =============================================================================
// EZER — Physical card design store
//
// The card designer is the emotional peak of the physical-card flow, and it is
// reached BEFORE the user has necessarily signed in or has any connectivity.
// Losing someone's artwork to a flaky network would be unforgivable, so this
// module is local-first:
//
//   · AsyncStorage is written FIRST and is the source of truth for the UI.
//   · The API POST is best-effort. A failure never rejects, never loses data,
//     and never blocks navigation — the record is simply left unsynced and
//     retried on the next save or via syncPendingCardDesign().
//
// Only ONE design is kept. The product is "your card", not a gallery, so a new
// save replaces the previous one rather than accumulating.
// =============================================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

// -----------------------------------------------------------------------------
// Public contract (other modules code against exactly this)
// -----------------------------------------------------------------------------

export type CardStroke = { d: string; color: string; width: number };

export type CardDesign = {
  finish: string;
  strokes: CardStroke[];
  /** ISO timestamp of when the user last edited the artwork. */
  updatedAt: string;
};

/**
 * Result of going through PhysicalCardApproval.tsx once — the piece that
 * decides whether tapping "Get your physical card" reopens the raw designer
 * or shows the finished design (PhysicalCardReview.tsx). Mirrors that
 * screen's terminal phases, minus 'choice' and 'assessing', which are not
 * terminal and so never get persisted.
 */
export type CardAccessOutcome = {
  status: 'approved' | 'review' | 'waitlist';
  limitCents: number | null;
  joinedAt: string;
};

// -----------------------------------------------------------------------------
// Storage shape
// -----------------------------------------------------------------------------

const STORAGE_KEY = '@ezer_card_design';

type StoredRecord = {
  /** Server id once synced, otherwise a locally-generated `local_…` id. */
  id: string;
  design: CardDesign;
  /** False while the design still owes the server a POST. */
  synced: boolean;
  /** Set once the user has been through the approval flow to a terminal state. */
  access?: CardAccessOutcome;
};

/** Locally-minted id. Prefixed so unsynced ids are never mistaken for server ids. */
function localId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local_');
}

async function readRecord(): Promise<StoredRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredRecord>;
    const design = parsed.design;
    // Defensive: storage survives app upgrades, so a shape change from an older
    // build must degrade to "no saved design" rather than crashing the designer.
    if (
      !design ||
      typeof design.finish !== 'string' ||
      !Array.isArray(design.strokes) ||
      typeof design.updatedAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      return null;
    }

    const access = parsed.access;
    const validAccess: CardAccessOutcome | undefined =
      access &&
      (access.status === 'approved' || access.status === 'review' || access.status === 'waitlist') &&
      (access.limitCents === null || typeof access.limitCents === 'number') &&
      typeof access.joinedAt === 'string'
        ? { status: access.status, limitCents: access.limitCents, joinedAt: access.joinedAt }
        : undefined;

    return {
      id: parsed.id,
      design: {
        finish: design.finish,
        strokes: design.strokes as CardStroke[],
        updatedAt: design.updatedAt,
      },
      synced: parsed.synced === true,
      access: validAccess,
    };
  } catch {
    return null;
  }
}

async function writeRecord(record: StoredRecord): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/**
 * Best-effort upload. Resolves with the server id, or null on any failure —
 * network, auth, validation, malformed response. Callers must treat null as
 * "still queued", never as an error to surface.
 */
async function pushToApi(design: CardDesign): Promise<string | null> {
  try {
    const res = await api.post<{ data?: { id?: string }; id?: string }>('/cards/designs', {
      finish: design.finish,
      strokes: design.strokes,
      updatedAt: design.updatedAt,
    });
    // The API wraps payloads in { success, data }; the bare shape is tolerated
    // so a future unwrapped endpoint doesn't silently break sync.
    const id = res?.data?.id ?? res?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// API
// -----------------------------------------------------------------------------

/**
 * Persist the design. The local write is the one that must not fail; the
 * network call is opportunistic.
 *
 * Returns the id to use downstream — a server id when the POST succeeded, a
 * `local_…` id otherwise. Never throws on network failure.
 */
export async function saveCardDesign(design: CardDesign): Promise<{ id: string }> {
  // Redrawing the artwork does not change a bank-approval outcome the user
  // already has — carry it forward rather than dropping it on every save.
  const existing = await readRecord();
  const access = existing?.access;

  const pending = localId();

  // Write locally FIRST and unsynced, so a crash mid-request still leaves the
  // artwork on disk and correctly marked as owing the server a POST.
  await writeRecord({ id: pending, design, synced: false, access });

  const serverId = await pushToApi(design);
  if (!serverId) return { id: pending };

  try {
    await writeRecord({ id: serverId, design, synced: true, access });
  } catch {
    // The upload landed; only the local id/flag update failed. The next save
    // re-uploads, which is harmless — the server keeps the latest design.
  }
  return { id: serverId };
}

/** The saved design, or null if nothing has ever been saved. Never throws. */
export async function loadCardDesign(): Promise<CardDesign | null> {
  const record = await readRecord();
  return record ? record.design : null;
}

/**
 * Id of the saved design, or null. Approval needs this to tie an access-list
 * entry to the artwork; a `local_…` id means the server has not seen it yet.
 */
export async function getCardDesignId(): Promise<string | null> {
  const record = await readRecord();
  return record ? record.id : null;
}

/**
 * Retry a queued upload. Safe to call at any time — a no-op when there is
 * nothing saved or the saved design is already synced. Resolves with the server
 * id on success, otherwise null. Never throws.
 */
export async function syncPendingCardDesign(): Promise<string | null> {
  const record = await readRecord();
  if (!record) return null;
  if (record.synced && !isLocalId(record.id)) return record.id;

  const serverId = await pushToApi(record.design);
  if (!serverId) return null;

  try {
    await writeRecord({ id: serverId, design: record.design, synced: true, access: record.access });
  } catch {
    // See saveCardDesign — the upload is what matters.
  }
  return serverId;
}

/**
 * The saved approval outcome, or null if the user has never reached a
 * terminal state in PhysicalCardApproval.tsx (or there is no design at all).
 * Never throws.
 */
export async function getCardAccessOutcome(): Promise<CardAccessOutcome | null> {
  const record = await readRecord();
  return record?.access ?? null;
}

/**
 * Record a terminal approval outcome against the current design. Silently a
 * no-op if there is no saved design yet — approval is only reachable after
 * PhysicalCard.tsx has already saved one. Never throws.
 */
export async function saveCardAccessOutcome(access: CardAccessOutcome): Promise<void> {
  try {
    const record = await readRecord();
    if (!record) return;
    await writeRecord({ ...record, access });
  } catch {
    // The access-list POST already succeeded server-side by the time this is
    // called; losing the local mirror only means the next "Get your physical
    // card" tap reopens the designer instead of the review screen — annoying,
    // not data loss.
  }
}

/** Wipe the saved design. Used by "start over" and sign-out. Never throws. */
export async function clearCardDesign(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do — a stale local design is not worth an error state.
  }
}

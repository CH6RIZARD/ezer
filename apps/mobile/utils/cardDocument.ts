// =============================================================================
// EZER — card design document model
//
// A flat, id-keyed, immutable scene graph. The shape follows the tldraw /
// Excalidraw pattern the research called out, adapted to one card:
//
//   * COORDINATES ARE NORMALISED 0–1 against the card, never pixels. The same
//     document therefore renders correctly at preview size and at print DPI
//     with no rescaling logic — which is the whole reason the print export can
//     be trusted.
//   * Z-ORDER IS A FRACTIONAL INDEX STRING. Reordering one element inserts a
//     key between its neighbours instead of rewriting every element's index.
//   * SOFT DELETE (`isDeleted`) so undo restores an element rather than
//     recreating one with a new id and losing references to it.
//   * `schemaVersion` + migrations, so designs saved by an older build still
//     open after an app update. A saved card that stops loading is a support
//     ticket about someone's money card, not a cosmetic bug.
//
// SELECTION IS NOT IN THIS FILE, on purpose. Selection lives in session state
// (see stores/cardEditorStore). If it lived in the document, every tap would
// push an undo entry and Cmd-Z would walk backwards through selections.
// =============================================================================

export const CARD_SCHEMA_VERSION = 1;

// -----------------------------------------------------------------------------
// Physical card geometry — ID-1, the bank-card standard
// -----------------------------------------------------------------------------

/**
 * ISO/IEC 7810 ID-1. These are the real dimensions of every payment card.
 *
 * NOTE: bleed, safe area and the keep-out rectangles below are ILLUSTRATIVE
 * until the manufacturer supplies a dieline. They are close enough to design
 * against and to validate against, but they must be reconciled with the
 * printer's actual spec before anything is sent to production.
 */
export const CARD_SPEC = {
  widthMM: 85.6,
  heightMM: 53.98,
  /** Print resolution for the export path. */
  dpi: 600,
  /** Trim safety — artwork must reach past the cut line by this much. */
  bleedMM: 2,
  /** Nothing meaningful should sit inside this margin. */
  safeAreaMM: 3,
} as const;

export const CARD_ASPECT = CARD_SPEC.widthMM / CARD_SPEC.heightMM;

/** Print pixel size for the offscreen export surface. */
export const printSize = () => ({
  width: Math.round((CARD_SPEC.widthMM / 25.4) * CARD_SPEC.dpi),
  height: Math.round((CARD_SPEC.heightMM / 25.4) * CARD_SPEC.dpi),
});

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeepOutZone extends Rect {
  id: string;
  type: 'emv_chip' | 'network_mark' | 'magstripe' | 'signature';
  label: string;
  /**
   * `hard` blocks submission. `soft` only warns.
   * The chip is hard: artwork under the contact plate is physically milled
   * away, so it does not exist on the finished card.
   */
  severity: 'hard' | 'soft';
}

/**
 * Keep-out zones in normalised card space, vertical orientation.
 *
 * The research is explicit that advisory-only guidance is an anti-pattern —
 * users submit invalid art and get rejected at the factory after the work is
 * done. These are enforced: warned during drag, blocked at submit.
 */
export const KEEP_OUT_ZONES: KeepOutZone[] = [
  {
    id: 'chip',
    type: 'emv_chip',
    label: 'EMV chip',
    // Chip sits upper-left on a vertical card.
    x: 0.12,
    y: 0.16,
    w: 0.26,
    h: 0.16,
    severity: 'hard',
  },
  {
    id: 'contactless',
    type: 'network_mark',
    label: 'Contactless antenna',
    x: 0.42,
    y: 0.17,
    w: 0.14,
    h: 0.13,
    severity: 'soft',
  },
  {
    id: 'network',
    type: 'network_mark',
    label: 'Network mark',
    x: 0.62,
    y: 0.83,
    w: 0.28,
    h: 0.12,
    severity: 'hard',
  },
];

// -----------------------------------------------------------------------------
// Tiers
// -----------------------------------------------------------------------------

export interface CardTier {
  id: string;
  name: string;
  blurb: string;
  priceCents: number;
  leadTimeDays: [number, number];
  /** Base substrate colour, shown behind artwork. */
  substrate: string;
  /** True if the substrate reads dark, so default art/text flips to light. */
  isDark: boolean;
  metal?: boolean;
}

export const CARD_TIERS: CardTier[] = [
  {
    id: 'standard_dark',
    name: 'Standard — Onyx',
    blurb: 'Matte recycled PVC. Free with your account.',
    priceCents: 0,
    leadTimeDays: [7, 10],
    substrate: '#141019',
    isDark: true,
  },
  {
    id: 'standard_light',
    name: 'Standard — Bone',
    blurb: 'Matte recycled PVC. Free with your account.',
    priceCents: 0,
    leadTimeDays: [7, 10],
    substrate: '#F2EDE2',
    isDark: false,
  },
  {
    id: 'premium_amethyst',
    name: 'Premium — Amethyst',
    blurb: 'Soft-touch finish with a pearl edge.',
    priceCents: 500,
    leadTimeDays: [7, 10],
    substrate: '#2A1259',
    isDark: true,
  },
  {
    id: 'metal_gold',
    name: 'Metal — Brushed Gold',
    blurb: 'Stainless core, brushed finish. Weighs like it costs.',
    priceCents: 5000,
    leadTimeDays: [10, 14],
    substrate: '#8C6A2B',
    isDark: true,
    metal: true,
  },
];

export const tierById = (id: string): CardTier =>
  CARD_TIERS.find(t => t.id === id) ?? CARD_TIERS[0];

// -----------------------------------------------------------------------------
// Elements
// -----------------------------------------------------------------------------

export type ElementType = 'stroke' | 'text' | 'sticker' | 'image';

interface ElementBase {
  id: string;
  typeName: 'element';
  type: ElementType;
  /** Centre point, normalised. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees. */
  rotation: number;
  /** Fractional index — see `indexBetween`. */
  z: string;
  opacity: number;
  locked: boolean;
  isDeleted: boolean;
  version: number;
  updated: number;
}

export interface StrokeElement extends ElementBase {
  type: 'stroke';
  props: {
    /** SVG path data in normalised card space. */
    d: string;
    color: string;
    /** Stroke width, normalised against card width. */
    size: number;
  };
}

export interface TextElement extends ElementBase {
  type: 'text';
  props: {
    text: string;
    fontFamily: string;
    /** Normalised against card height. */
    fontSize: number;
    color: string;
    align: 'left' | 'center' | 'right';
  };
}

export interface StickerElement extends ElementBase {
  type: 'sticker';
  props: { stickerId: string; color?: string };
}

export interface ImageElement extends ElementBase {
  type: 'image';
  props: { assetId: string; cropRect: [number, number, number, number] };
}

export type CardElement = StrokeElement | TextElement | StickerElement | ImageElement;

export interface CardAsset {
  uri: string;
  w: number;
  h: number;
  type: string;
}

export interface CardDocument {
  schemaVersion: number;
  id: string;
  tierId: string;
  background: { type: 'solid'; color: string };
  elements: CardElement[];
  assets: Record<string, CardAsset>;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Fractional indexing
// -----------------------------------------------------------------------------

const IDX_MIN = 'a0';

/**
 * A key that sorts strictly between `a` and `b`.
 *
 * Reordering one element must not rewrite every other element's index —
 * that would turn a z-order nudge into a whole-document diff, and therefore
 * into a whole-document undo entry.
 */
export function indexBetween(a: string | null, b: string | null): string {
  if (!a && !b) return IDX_MIN;
  if (!a) return String.fromCharCode(b!.charCodeAt(0) - 1) + '5';
  if (!b) return a + '5';

  // Character-wise midpoint; falls back to appending when they are adjacent.
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i) || 96;
    const cb = b.charCodeAt(i) || 123;
    if (cb - ca > 1) {
      return a.slice(0, i) + String.fromCharCode(Math.floor((ca + cb) / 2));
    }
  }
  return a + '5';
}

export const sortByZ = (els: CardElement[]): CardElement[] =>
  [...els].sort((p, q) => (p.z < q.z ? -1 : p.z > q.z ? 1 : 0));

export const visibleElements = (doc: CardDocument): CardElement[] =>
  sortByZ(doc.elements.filter(e => !e.isDeleted));

export function topIndex(doc: CardDocument): string {
  const live = visibleElements(doc);
  return live.length ? indexBetween(live[live.length - 1].z, null) : IDX_MIN;
}

// -----------------------------------------------------------------------------
// Geometry helpers
// -----------------------------------------------------------------------------

/** Axis-aligned bounds of an element, ignoring rotation. */
export function boundsOf(el: CardElement): Rect {
  return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** How far into the card the safe area sits, normalised per axis. */
export const safeInset = {
  x: CARD_SPEC.safeAreaMM / CARD_SPEC.widthMM,
  y: CARD_SPEC.safeAreaMM / CARD_SPEC.heightMM,
};

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

export interface ValidationIssue {
  id: string;
  elementId?: string;
  severity: 'error' | 'warning';
  code: 'KEEP_OUT' | 'OUT_OF_SAFE_AREA' | 'EMPTY' | 'OFF_CARD' | 'LOW_RES';
  message: string;
}

/**
 * Runs continuously while editing AND again at submit.
 *
 * Real-time is the point: the research's single loudest finding is that
 * Cash App rejects designs only AFTER the user has sunk an hour into them,
 * with a vague reason. Anything we can detect ourselves, we detect while there
 * is still a cheap fix.
 */
export function validateDocument(doc: CardDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const live = visibleElements(doc);

  if (live.length === 0) {
    issues.push({
      id: 'empty',
      severity: 'warning',
      code: 'EMPTY',
      message: 'Your card is blank — add something before you order it.',
    });
  }

  for (const el of live) {
    const b = boundsOf(el);

    for (const zone of KEEP_OUT_ZONES) {
      if (!rectsOverlap(b, zone)) continue;
      issues.push({
        id: `${el.id}:${zone.id}`,
        elementId: el.id,
        severity: zone.severity === 'hard' ? 'error' : 'warning',
        code: 'KEEP_OUT',
        message:
          zone.severity === 'hard'
            ? `Artwork is under the ${zone.label} and will not print there. Move it clear.`
            : `Artwork overlaps the ${zone.label}, which may be hard to read.`,
      });
    }

    // Fully off the card is an error; slightly into the trim margin is a warning.
    if (b.x + b.w < 0 || b.x > 1 || b.y + b.h < 0 || b.y > 1) {
      issues.push({
        id: `${el.id}:off`,
        elementId: el.id,
        severity: 'error',
        code: 'OFF_CARD',
        message: 'This is off the card entirely.',
      });
    } else if (
      b.x < safeInset.x ||
      b.y < safeInset.y ||
      b.x + b.w > 1 - safeInset.x ||
      b.y + b.h > 1 - safeInset.y
    ) {
      issues.push({
        id: `${el.id}:safe`,
        elementId: el.id,
        severity: 'warning',
        code: 'OUT_OF_SAFE_AREA',
        message: 'Close to the edge — the trim may cut into this.',
      });
    }

    // Imported art below print resolution.
    if (el.type === 'image') {
      const asset = doc.assets[(el as ImageElement).props.assetId];
      const print = printSize();
      if (asset && (asset.w < print.width * el.w || asset.h < print.height * el.h)) {
        issues.push({
          id: `${el.id}:res`,
          elementId: el.id,
          severity: 'warning',
          code: 'LOW_RES',
          message: 'This image will look soft at print size. Try a larger one.',
        });
      }
    }
  }

  return issues;
}

/** Hard gate for the submit button. */
export const blockingIssues = (issues: ValidationIssue[]) =>
  issues.filter(i => i.severity === 'error');

// -----------------------------------------------------------------------------
// Documents & migrations
// -----------------------------------------------------------------------------

export function createDocument(tierId = CARD_TIERS[0].id): CardDocument {
  const tier = tierById(tierId);
  return {
    schemaVersion: CARD_SCHEMA_VERSION,
    id: `design_${Date.now().toString(36)}`,
    tierId: tier.id,
    background: { type: 'solid', color: tier.substrate },
    elements: [],
    assets: {},
    updatedAt: new Date().toISOString(),
  };
}

type Migration = (doc: any) => any;

/**
 * Ordered by the version they upgrade FROM. Add, never edit — a released
 * migration has already run on real devices.
 */
const MIGRATIONS: Record<number, Migration> = {
  // 0 -> 1: the pre-scene-graph format was `{ finish, strokes: [{d,color,width}] }`.
  0: (doc: any) => ({
    schemaVersion: 1,
    id: `design_${Date.now().toString(36)}`,
    tierId: CARD_TIERS[0].id,
    background: { type: 'solid', color: CARD_TIERS[0].substrate },
    elements: (doc?.strokes ?? []).map((s: any, i: number) => ({
      id: `el_migrated_${i}`,
      typeName: 'element',
      type: 'stroke',
      // The old format stored card-pixel paths and no bounds. Full-card bounds
      // keep them selectable; the path itself still renders correctly.
      x: 0.5,
      y: 0.5,
      w: 1,
      h: 1,
      rotation: 0,
      z: `a${i}`,
      opacity: 1,
      locked: false,
      isDeleted: false,
      version: 1,
      updated: Date.now(),
      props: { d: s.d, color: s.color, size: s.width / 308 },
    })),
    assets: {},
    updatedAt: new Date().toISOString(),
  }),
};

/** Bring any stored document up to the current schema. Never throws. */
export function migrateDocument(raw: unknown): CardDocument | null {
  if (!raw || typeof raw !== 'object') return null;

  let doc: any = raw;
  let version: number = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;

  while (version < CARD_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return null; // Unknown gap — refuse rather than corrupt.
    doc = migrate(doc);
    version = doc.schemaVersion ?? version + 1;
  }

  if (!Array.isArray(doc.elements)) return null;
  return doc as CardDocument;
}

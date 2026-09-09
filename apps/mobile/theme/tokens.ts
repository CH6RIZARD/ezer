// =============================================================================
// EZER Design Tokens — Full Light + Dark Patch
//
// Source of truth: "Handoff: Ezer Redesign — Full Light + Dark Patch"
// (BNPL app card design updates/design_handoff_ezer_redesign/README.md).
// Hex values are final per the handoff — do not eyeball-adjust them.
//
// Consumed through utils/ThemeContext.tsx. The context also re-exports a set of
// legacy aliases (background/text/danger/…) so screens written against the old
// palette keep working while they are migrated screen by screen.
// =============================================================================

/** Palette that flips with the active theme. */
export interface ThemeTokens {
  /** Screen background. */
  bg: string;
  /** Inset / secondary surface. */
  bg2: string;
  /** Card surface. */
  card: string;
  /** Card border. */
  line: string;
  /** Strong border. */
  line2: string;
  /** Primary text. */
  ink: string;
  /** Primary text at 50% — dividers, disabled glyphs. */
  inkDim: string;
  /** Secondary text. */
  mut: string;
  /** Tertiary text. */
  mut2: string;
  /** Legal / fine print. */
  mut3: string;
  /** Primary purple, for filled buttons and active pills. */
  accent: string;
  /** Accent as TEXT. Differs from `accent` in dark, where #4C1D95 is unreadable. */
  accInk: string;
  /** Accent chip background. */
  accSoft: string;
  /** Gold as text. */
  gold: string;
  /** Gold as a filled button background. */
  goldBg: string;
  /** Gold border. */
  goldLine: string;
  /** Gold chip background. */
  goldSoft: string;
  /** Charges / danger. */
  red: string;
  /** Calendar day cell. */
  cellBg: string;
  /** Calendar day cell that has charges. */
  cellHl: string;
  /** Tab bar (rendered under a blur). */
  tabBg: string;
  /** Spending-power tile gradient. */
  goldTile: readonly [string, string];
  /** Success text/icon. */
  success: string;
  /** Success banner background. */
  successBg: string;
  /** Scrim behind popovers and pickers. */
  scrim: string;
}

export const lightTokens: ThemeTokens = {
  bg: '#F7F3EA',
  bg2: '#F7F3EA',
  card: '#FFFFFF',
  line: '#EEE7D6',
  line2: '#D6CCB4',
  ink: '#241A38',
  inkDim: 'rgba(36,26,56,.5)',
  mut: '#8A7F6B',
  mut2: '#B0A68F',
  mut3: '#A99E86',
  accent: '#4C1D95',
  accInk: '#4C1D95',
  accSoft: '#EDE6F9',
  gold: '#A87D2F',
  goldBg: '#A87D2F',
  goldLine: '#E2C892',
  goldSoft: '#F6EBD3',
  red: '#B3402A',
  cellBg: '#FAF7F0',
  cellHl: '#FBF6EA',
  tabBg: 'rgba(255,255,255,.88)',
  goldTile: ['#FFFDF7', '#FBF3E2'],
  success: '#348F66',
  successBg: 'rgba(52,143,102,.14)',
  scrim: 'rgba(20,10,46,.42)',
};

export const darkTokens: ThemeTokens = {
  bg: '#151021',
  bg2: '#251C3D',
  card: '#1F1834',
  line: '#2C2347',
  line2: '#3B2F5A',
  ink: '#F1EAF9',
  inkDim: 'rgba(241,234,249,.5)',
  mut: '#A79BC2',
  mut2: '#6F6390',
  mut3: '#7C7096',
  accent: '#4C1D95',
  accInk: '#C4A9F7',
  accSoft: 'rgba(139,92,246,.2)',
  gold: '#D6B36F',
  goldBg: '#8F6B29',
  goldLine: '#6E572B',
  goldSoft: 'rgba(214,179,111,.15)',
  red: '#E0705A',
  cellBg: '#211A38',
  cellHl: '#2C2148',
  tabBg: 'rgba(30,23,50,.9)',
  goldTile: ['#2B2245', '#332850'],
  success: '#348F66',
  successBg: 'rgba(52,143,102,.14)',
  scrim: 'rgba(20,10,46,.42)',
};

// =============================================================================
// Theme-independent gradients and finishes.
// These do NOT flip with light/dark — the virtual card and chart card keep the
// same finish in both themes.
// =============================================================================

export const gradients = {
  /** Virtual card front, "Amethyst" finish. */
  cardFront: ['#5B21B6', '#31136E', '#150A33'] as const,
  cardFrontLocations: [0, 0.55, 1] as const,
  /** Virtual card back. */
  cardBack: ['#3B1580', '#1E0B45', '#0E0724'] as const,
  /** Gold metal edge, visible edge-on mid-spin. */
  metalEdge: ['#E7C77E', '#A87D2F', '#E7C77E'] as const,
  metalEdgeLocations: [0, 0.55, 1] as const,
  /** Purple chart card ("How you're getting charged"). */
  chartCard: ['#31136E', '#1D0B45'] as const,
  /** Primary CTA (Pay in 4 join). */
  ctaPrimary: ['#4C1D95', '#A87D2F'] as const,
  /** Wallet bank cards. */
  bankSapphire: ['#2C4A8F', '#141F3E'] as const,
  bankGold: ['#E9D9B8', '#C4A15A', '#9A7838'] as const,
  /** The gold card's middle stop sits at 65%, not the midpoint. */
  bankGoldLocations: [0, 0.65, 1] as const,
} as const;

/**
 * Card finishes. Amethyst is the default.
 *
 * Rose replaces Midnight, per the locked Card Studio layout: Midnight's blue
 * sat too close to the Wallet's bankSapphire, so a virtual card and a linked
 * bank card read as the same object at a glance.
 *
 * Bone is the one light finish, which is why anything drawn over it has to
 * pick its ink from the finish rather than assuming white-on-dark.
 */
export const cardFinishes = {
  amethyst: ['#5B21B6', '#31136E', '#150A33'] as const,
  onyx: ['#33303B', '#17151D', '#0B0A10'] as const,
  rose: ['#F06BB0', '#C2185B', '#7A1041'] as const,
  bone: ['#F7F0E1', '#E9DCC2', '#D8C7A6'] as const,
} as const;

/** Finishes that need light ink drawn on them. Bone is the only light one. */
export const isDarkFinish = (f: CardFinish): boolean => f !== 'bone';

export type CardFinish = keyof typeof cardFinishes;

/**
 * Card BACK finish, one shade darker/richer than the front per finish. The
 * Card Studio comp locks identifying details (name, number, CVV, expiry) to
 * this face — the front carries only the chip and contactless mark — so the
 * back needs its own gradient, not a reuse of `cardFinishes`.
 */
export const cardBackFinishes = {
  amethyst: ['#3B1580', '#1E0B45', '#0E0724'] as const,
  onyx: ['#33303B', '#17151D', '#0B0A10'] as const,
  rose: ['#D9317F', '#B0134F', '#6B0F3A'] as const,
  bone: ['#F1E8D4', '#DFD2B6', '#CDBC98'] as const,
} as const;

/** Chart card foreground colors (fixed across themes). */
export const chartColors = {
  line: '#E7C77E',
  subtext: '#C9BCE8',
  chipBg: 'rgba(231,199,126,.18)',
} as const;

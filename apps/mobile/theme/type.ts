// =============================================================================
// EZER Typography & Layout Scale — Redesign Patch
//
// Source of truth: "Handoff: Ezer Redesign — Full Light + Dark Patch".
//
// Two families:
//   * Space Grotesk      — all UI text (400/500/600/700)
//   * Instrument Serif   — italic display numerals and serif accents ONLY
//     (stat values, month labels, drained totals, popover totals)
//
// Font FAMILY names must match the keys loaded by useFonts() in app/_layout.tsx.
// =============================================================================

export const fontFamily = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  /** Display serif. Always rendered italic — the face itself is the italic cut. */
  serif: 'InstrumentSerif_400Regular_Italic',
} as const;

/**
 * Ready-made text styles from the handoff's type scale.
 * Sizes and letter-spacing are final; do not round them "for consistency".
 */
export const typeScale = {
  /** Screen title: 26–27px/700, -0.6 tracking. */
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    letterSpacing: -0.6,
  },
  /** Dashboard header title: 24px/700. */
  dashTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.4,
  },
  /** Section header: 16–17px/700. */
  sectionHeader: {
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
  },
  /** Card title: 14.5–15px/700. */
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  /** Card title, lighter weight variant. */
  cardTitleSemi: {
    fontFamily: fontFamily.semibold,
    fontSize: 14.5,
  },
  /** Body: 12–13px. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  /**
   * UPPERCASE caption/label. Measured off the prototype, not the README:
   * `font-size:11px; font-weight:600; letter-spacing:.5px`. The README's
   * "10–11px/700, 0.5–0.8" is a range — these are the actual values used.
   */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  labelSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  /** Header greeting: 13px, .4 tracking, `mut`. */
  greeting: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  /**
   * Stat tile value: 23px Instrument Serif Italic.
   *
   * The prototype sets font-weight:700 here, but Instrument Serif ships only a
   * 400 weight — the browser fakes the bold. React Native does not synthesise
   * weights for custom fonts, so this renders at 400 and reads lighter than the
   * HTML. Setting fontWeight would be a no-op on Android and an inconsistent
   * fake-bold on iOS, so it is deliberately omitted.
   */
  statValue: {
    fontFamily: fontFamily.serif,
    fontSize: 23,
  },
  /** Drained / lifetime totals: 36–38px Instrument Serif Italic, in `red`. */
  totalValue: {
    fontFamily: fontFamily.serif,
    fontSize: 38,
  },
  totalValueSm: {
    fontFamily: fontFamily.serif,
    fontSize: 36,
  },
  /** Serif italic month label / popover date title. */
  serifTitle: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
  },
  /** EZER wordmark: 15px/700, 2.5 tracking, gold. */
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    letterSpacing: 2.5,
  },
} as const;

/** Layout constants from the handoff. */
export const layout = {
  /** Screen horizontal padding. */
  screenX: 20,
  /** Content bottom padding — clears the floating tab bar. */
  contentBottom: 96,
  /** Minimum touch target. */
  hitTarget: 44,
  /** Calendar day cell minimum height. */
  calCellMinHeight: 58,
} as const;

/** Corner radii from the handoff. */
export const radius = {
  card: 18,
  cardLg: 20,
  hero: 22,
  button: 15,
  buttonSm: 14,
  buttonLg: 17,
  chip: 12,
  pill: 999,
  cell: 10,
  cellSm: 9,
  virtualCard: 20,
  tabBar: 24,
} as const;

/** Motion constants — the handoff calls the card feel a hard requirement. */
export const motion = {
  /** Screen transition: fade + rise. */
  screenIn: 350,
  /** Press feedback. */
  press: 150,
  pressScale: 0.96,
  pressScaleStrong: 0.93,
  /** Popover / picker spring-up. */
  popover: 280,
  /** Idle float loop on the virtual card. */
  cardFloat: 3600,
  cardFloatTravel: -7,
  /** Smoothing applied while dragging the card. */
  cardDragSmoothing: 120,
  /** Settle after release: 900ms cubic-bezier(.22,1,.36,1). */
  cardSettle: 900,
  cardSettleBezier: [0.22, 1, 0.36, 1] as const,
  /** Degrees of rotation per px dragged. */
  cardRotatePerPx: 0.55,
  /** Movement under this many px counts as a tap, not a drag. */
  cardTapSlop: 4,
  /** Gold pulse loop. */
  pulse: 2400,
} as const;

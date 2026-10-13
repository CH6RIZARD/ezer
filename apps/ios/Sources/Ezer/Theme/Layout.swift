// Port of apps/mobile/theme/type.ts (layout, radius, motion) — values verbatim from port map §2.3.

import CoreGraphics

/** Layout constants from the handoff. */
enum Layout {
    /** Screen horizontal padding. */
    static let screenX: CGFloat = 20
    /** Content bottom padding — clears the floating tab bar. */
    static let contentBottom: CGFloat = 96
    /** A tab's bottom padding (plus insets.bottom): the bar's clearance and then room to breathe, so a
     *  scroll doesn't stop dead on the last row (owner, Oct 12 2026: "like hitting a wall at the end of
     *  scroll"). */
    static let tabBottom: CGFloat = 176
    /** Minimum touch target. */
    static let hitTarget: CGFloat = 44
    /** Calendar day cell minimum height. */
    static let calCellMinHeight: CGFloat = 58
}

/** Corner radii from the handoff. */
enum Radius {
    static let card: CGFloat = 18
    static let cardLg: CGFloat = 20
    static let hero: CGFloat = 22
    static let button: CGFloat = 15
    static let buttonSm: CGFloat = 14
    static let buttonLg: CGFloat = 17
    static let chip: CGFloat = 12
    static let pill: CGFloat = 999
    static let cell: CGFloat = 10
    static let cellSm: CGFloat = 9
    static let virtualCard: CGFloat = 20
    static let tabBar: CGFloat = 24
}

/** Motion constants — the handoff calls the card feel a hard requirement. Durations in ms. */
enum Motion {
    /** Screen transition: fade + rise. */
    static let screenIn: Double = 350   // ms
    /** Press feedback. */
    static let press: Double = 150   // ms
    static let pressScale: Double = 0.96
    static let pressScaleStrong: Double = 0.93
    /** Popover / picker spring-up. */
    static let popover: Double = 280   // ms
    /** Idle float loop on the virtual card. */
    static let cardFloat: Double = 3600   // ms
    static let cardFloatTravel: Double = -7
    /** Smoothing applied while dragging the card. */
    static let cardDragSmoothing: Double = 120   // ms
    /** Settle after release: 900ms cubic-bezier(.22,1,.36,1). */
    static let cardSettle: Double = 900   // ms
    static let cardSettleBezier: (Double, Double, Double, Double) = (0.22, 1, 0.36, 1)
    /** Degrees of rotation per px dragged. */
    static let cardRotatePerPx: Double = 0.55
    /** Movement under this many px counts as a tap, not a drag. */
    static let cardTapSlop: Double = 4
    /** Gold pulse loop. */
    static let pulse: Double = 2400   // ms
    /** Strong ease-out for UI that enters or responds to a press. Same as RNEasing.easeOut. */
    static let easeOut: (Double, Double, Double, Double) = (0.23, 1, 0.32, 1)
}

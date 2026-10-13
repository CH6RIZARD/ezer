// Port of apps/mobile/theme/type.ts (fontFamily, typeScale) — values verbatim from port map §2.3.
//
// Two families: Space Grotesk for all UI text (four static weights, each its own PostScript
// name, exactly like RN) and Instrument Serif Italic for display numerals only. Instrument Serif
// is ALWAYS the italic cut: never add .italic() or a weight to it.
//
// A Text whose RN style has NO fontFamily is the iOS SYSTEM font at its fontWeight —
// use Font.system(size:weight:) there (auth screens, account, help, notifications, Reallocate,
// the legacy Button, the error boundary). Never substitute Space Grotesk.

import SwiftUI
import UIKit

/// RN font KEY -> iOS PostScript name (the TTFs in Resources/Fonts register these names).
enum FontFamily {
    static let regular = "SpaceGrotesk-Regular"   // RN key "SpaceGrotesk_400Regular"
    static let medium = "SpaceGrotesk-Medium"   // RN key "SpaceGrotesk_500Medium"
    static let semibold = "SpaceGrotesk-SemiBold"   // RN key "SpaceGrotesk_600SemiBold"
    static let bold = "SpaceGrotesk-Bold"   // RN key "SpaceGrotesk_700Bold"
    static let serif = "InstrumentSerif-Italic"   // RN key "InstrumentSerif_400Regular_Italic"
    /// Any RN text style WITHOUT a fontFamily renders in the iOS system font (SF Pro).
}

struct TypeStyle: Hashable, Sendable {
    let family: String
    let size: CGFloat
    let tracking: CGFloat
    let uppercase: Bool

    /// Same style at another size (RN `[typeScale.x, { fontSize: n }]`).
    func size(_ s: CGFloat) -> TypeStyle { TypeStyle(family: family, size: s, tracking: tracking, uppercase: uppercase) }
}

enum TypeScale {
    /** Screen title: 26–27px/700, -0.6 tracking. */
    static let screenTitle = TypeStyle(family: FontFamily.bold, size: 26, tracking: -0.6, uppercase: false)
    /** Dashboard header title: 24px/700. */
    static let dashTitle = TypeStyle(family: FontFamily.bold, size: 24, tracking: -0.4, uppercase: false)
    /** Section header: 16–17px/700. */
    static let sectionHeader = TypeStyle(family: FontFamily.bold, size: 16.5, tracking: 0, uppercase: false)
    /** Card title: 14.5–15px/700. */
    static let cardTitle = TypeStyle(family: FontFamily.bold, size: 15, tracking: 0, uppercase: false)
    /** Card title, lighter weight variant. */
    static let cardTitleSemi = TypeStyle(family: FontFamily.semibold, size: 14.5, tracking: 0, uppercase: false)
    /** Body: 12–13px. */
    static let body = TypeStyle(family: FontFamily.regular, size: 13, tracking: 0, uppercase: false)
    static let bodySm = TypeStyle(family: FontFamily.regular, size: 12, tracking: 0, uppercase: false)
    /** UPPERCASE caption/label: 11px/600, .5 tracking (measured off the prototype). */
    static let label = TypeStyle(family: FontFamily.semibold, size: 11, tracking: 0.5, uppercase: true)
    static let labelSm = TypeStyle(family: FontFamily.semibold, size: 10, tracking: 0.5, uppercase: true)
    /** Header greeting: 13px, .4 tracking, `mut`. */
    static let greeting = TypeStyle(family: FontFamily.regular, size: 13, tracking: 0.4, uppercase: false)
    /** Stat tile value: 23px Instrument Serif Italic. Deliberately NO weight (the face ships 400 only). */
    static let statValue = TypeStyle(family: FontFamily.serif, size: 23, tracking: 0, uppercase: false)
    /** Drained / lifetime totals: 36–38px Instrument Serif Italic, in `red`. */
    static let totalValue = TypeStyle(family: FontFamily.serif, size: 38, tracking: 0, uppercase: false)
    static let totalValueSm = TypeStyle(family: FontFamily.serif, size: 36, tracking: 0, uppercase: false)
    /** Serif italic month label / popover date title. */
    static let serifTitle = TypeStyle(family: FontFamily.serif, size: 20, tracking: 0, uppercase: false)
    /** EZER wordmark: 15px/700, 2.5 tracking, gold. */
    static let wordmark = TypeStyle(family: FontFamily.bold, size: 15, tracking: 2.5, uppercase: false)
}

// MARK: - Helpers

extension Font {
    /// A bundled family at an RN fontSize. Follows the user's text size like RN's allowFontScaling (default true).
    static func ezer(_ family: String, _ size: CGFloat) -> Font { .custom(family, size: size) }
}

enum EzerUIFont {
    /// UIKit font for measuring (RollingNumber, line heights). `family == nil` -> system font.
    static func font(_ family: String?, _ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        if let family, let f = UIFont(name: family, size: size) { return f }
        return .systemFont(ofSize: size, weight: weight)
    }
}

extension View {
    /// Applies a typeScale entry: font, letterSpacing, textTransform.
    /// RN: `style={[typeScale.label, { color }]}` -> `.typeStyle(TypeScale.label).foregroundStyle(color)`
    func typeStyle(_ s: TypeStyle) -> some View {
        self.font(.custom(s.family, size: s.size))
            .tracking(s.tracking)
            .textCase(s.uppercase ? .uppercase : nil)
    }

    /// RN `lineHeight: L` for a Text: extra leading between lines plus half of it above and below,
    /// so the box is L tall per line like RN (which centres the glyphs in the line on iOS).
    /// `family == nil` measures the system font.
    func rnLineHeight(_ lineHeight: CGFloat, family: String?, size: CGFloat, weight: UIFont.Weight = .regular) -> some View {
        modifier(RNLineHeight(lineHeight: lineHeight, family: family, size: size, weight: weight))
    }

    /// Convenience for a TypeStyle.
    func rnLineHeight(_ lineHeight: CGFloat, _ s: TypeStyle) -> some View {
        rnLineHeight(lineHeight, family: s.family, size: s.size)
    }
}

/// RN scales `lineHeight` with the text size setting just as it scales fontSize. A bundled family
/// (`.custom(_:size:)`) follows Dynamic Type through the body text style, so both the line height
/// and the font's natural height are scaled the same way here; `.system(size:)` (family nil) does
/// not scale, so neither does its line height.
private struct RNLineHeight: ViewModifier {
    let lineHeight: CGFloat
    let family: String?
    let size: CGFloat
    let weight: UIFont.Weight
    @Environment(\.dynamicTypeSize) private var dynamicType

    func body(content: Content) -> some View {
        let base = EzerUIFont.font(family, size, weight: weight)
        var natural = base.lineHeight
        var target = lineHeight
        if family != nil {
            let traits = UITraitCollection(preferredContentSizeCategory: dynamicType.uiCategory)
            let metrics = UIFontMetrics(forTextStyle: .body)
            natural = metrics.scaledFont(for: base, compatibleWith: traits).lineHeight
            target = metrics.scaledValue(for: lineHeight, compatibleWith: traits)
        }
        let extra = target - natural
        return content.lineSpacing(max(0, extra)).padding(.vertical, extra / 2)
    }
}

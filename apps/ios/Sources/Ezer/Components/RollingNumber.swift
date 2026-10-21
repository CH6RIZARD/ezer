// Port of apps/mobile/components/redesign/RollingNumber.tsx
//
// Odometer-style number: each digit is a vertical 0-9 strip that rolls to its new value (650ms
// motion.easeOut) instead of the text swapping instantly. Non-digits ($ , . -) are static.
// Instrument Serif has PROPORTIONAL digits, so each column's width eases to the width of the digit
// it is rolling to, measured from the same font (UIKit metrics, scaled for Dynamic Type exactly as
// the Text is). Columns are clipped with PAD slack each side that a negative margin hands back.
// Reduce Motion: a plain Text.
//
//   RollingNumber(value: formatCents(drained), style: TypeScale.totalValue, color: colors.red)

import SwiftUI
import UIKit

private let DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
private let ROLL_MS: Double = 650
// Italic glyphs overhang their advance box; the column clips, so give it slack.
private let PAD: CGFloat = 4

private struct Metrics: Equatable {
    var h: CGFloat
    var w: [CGFloat]
}

struct RollingNumber: View {
    let value: String
    var style: TypeStyle
    var color: Color
    /** Count up from zero on mount, not only on later changes. */
    var rollIn = false

    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.dynamicTypeSize) private var dynamicType

    init(value: String, style: TypeStyle, color: Color, rollIn: Bool = false) {
        self.value = value
        self.style = style
        self.color = color
        self.rollIn = rollIn
    }

    /// The one font used for both measuring and drawing, so the columns fit exactly.
    private var uiFont: UIFont {
        let base = EzerUIFont.font(style.family, style.size)
        return UIFontMetrics(forTextStyle: .body).scaledFont(for: base, compatibleWith: UITraitCollection(preferredContentSizeCategory: dynamicType.uiCategory))
    }

    private var metrics: Metrics {
        let f = uiFont
        let attrs: [NSAttributedString.Key: Any] = [.font: f, .kern: style.tracking]
        let w = DIGITS.map { ceil(($0 as NSString).size(withAttributes: attrs).width) }
        return Metrics(h: ceil(f.lineHeight), w: w)
    }

    var body: some View {
        let font = Font(uiFont)
        if reduce {
            Text(value).font(font).tracking(style.tracking).foregroundStyle(color)
        } else {
            let m = metrics
            let chars = Array(value)
            // Keyed from the RIGHT so the ones digit stays the ones digit when the number gains a
            // place ($9.99 -> $10.00) and only the new leading column mounts.
            let items: [RollItem] = chars.enumerated().map { i, c in
                let fromRight = chars.count - i
                let d = (c.isASCII ? c.wholeNumberValue : nil)
                return RollItem(id: d != nil ? "d\(fromRight)" : "\(c)\(fromRight)", c: c, digit: d)
            }
            HStack(alignment: .top, spacing: 0) {
                ForEach(items) { item in
                    if let d = item.digit {
                        DigitColumn(digit: d, m: m, font: font, tracking: style.tracking, color: color, rollIn: rollIn)
                    } else {
                        Text(String(item.c)).font(font).tracking(style.tracking).foregroundStyle(color)
                            .frame(height: m.h)
                    }
                }
            }
            .fixedSize()
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(value)
        }
    }
}

private struct RollItem: Identifiable {
    let id: String
    let c: Character
    let digit: Int?
}

private struct DigitColumn: View {
    let digit: Int
    let m: Metrics
    let font: Font
    let tracking: CGFloat
    let color: Color
    let rollIn: Bool

    @State private var y: CGFloat = 0
    @State private var w: CGFloat = 0
    @State private var mounted = false

    var body: some View {
        VStack(spacing: 0) {
            ForEach(DIGITS, id: \.self) { d in
                Text(d).font(font).tracking(tracking).foregroundStyle(color)
                    .multilineTextAlignment(.center)
                    .frame(height: m.h)
            }
        }
        // Its own width, centred and clipped by the column: offered the column's easing width,
        // the strip laid its ten Texts out again on every frame of the roll.
        .fixedSize()
        .offset(y: y)
        .frame(width: w + PAD * 2, height: m.h, alignment: .top)
        .clipped()
        .padding(.horizontal, -PAD)
        .onAppear {
            guard !mounted else { return }
            mounted = true
            // rollIn: start at 0 and count up to the digit when the column mounts.
            y = rollIn ? 0 : -CGFloat(digit) * m.h
            w = m.w[rollIn ? 0 : digit]
            if rollIn {
                onNextRunLoop {
                    withAnimation(.rn(.easeOut, ROLL_MS)) {
                        y = -CGFloat(digit) * m.h
                        w = m.w[digit]
                    }
                }
            }
        }
        .onChange(of: digit) { _, d in
            withAnimation(.rn(.easeOut, ROLL_MS)) {
                y = -CGFloat(d) * m.h
                w = m.w[d]
            }
        }
        .onChange(of: m) { _, nm in
            withAnimation(.rn(.easeOut, ROLL_MS)) {
                y = -CGFloat(digit) * nm.h
                w = nm.w[digit]
            }
        }
    }
}

extension DynamicTypeSize {
    var uiCategory: UIContentSizeCategory {
        switch self {
        case .xSmall: return .extraSmall
        case .small: return .small
        case .medium: return .medium
        case .large: return .large
        case .xLarge: return .extraLarge
        case .xxLarge: return .extraExtraLarge
        case .xxxLarge: return .extraExtraExtraLarge
        case .accessibility1: return .accessibilityMedium
        case .accessibility2: return .accessibilityLarge
        case .accessibility3: return .accessibilityExtraLarge
        case .accessibility4: return .accessibilityExtraExtraLarge
        case .accessibility5: return .accessibilityExtraExtraExtraLarge
        @unknown default: return .large
        }
    }
}

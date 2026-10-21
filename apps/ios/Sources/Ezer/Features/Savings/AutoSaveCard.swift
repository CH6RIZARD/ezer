// Port of apps/mobile/components/redesign/AutoSaveCard.tsx
//
// EZER Redesign — the AUTOMATIC SAVING card ("Goal 1a" handoff)
//
// ONE card for both places a goal's automatic saving is switched: GoalFormSheet (create / edit) and
// the goal screen (GoalDetailView), so the two can never drift. The whole card is the toggle: the
// purple gradient when on, bg2 when off, and the knob slides over 220 ms. `text` is the copy under
// "Save automatically" (each caller has its own). `footer`, when given, sits inside the card under
// a hairline: white at 16% on the purple, `line` when off.
//
// GoalFormSheet's keyboard-up chip ("Saves automatically · On") is not this card and stays there.

import SwiftUI

struct AutoSaveCard<Footer: View>: View {
    @Environment(ThemeStore.self) private var theme
    let on: Bool
    let text: String
    let onToggle: () -> Void
    let footer: Footer?

    var body: some View {
        let c = theme.colors
        let shape = rnRect(22)
        SavingsPressable(action: onToggle) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 9) {
                    Ionicon("sparkles", size: 15, color: on ? Color(css: "#FFFFFF") : c.mut)
                        .frame(width: 30, height: 30)
                        .background(rnRect(10).fill(on ? Color(css: "rgba(255,255,255,.14)") : c.card))
                    Text("AUTOMATIC SAVING")
                        .font(.ezer(FontFamily.semibold, 10))
                        .tracking(0.6)
                        .foregroundStyle(on ? Color(css: "rgba(255,255,255,.72)") : c.mut2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    // Off on Light: white at 12% vanishes into the cream bg2, so line2.
                    Capsule()
                        .fill(on ? c.accInk : theme.isDark ? Color(css: "rgba(255,255,255,.12)") : c.line2)
                        .frame(width: 50, height: 30)
                        .overlay(alignment: .leading) {
                            Circle()
                                .fill(on ? Color(css: "#2A0F5C") : c.mut2)
                                .frame(width: 26, height: 26)
                                .rnShadow("#000000", opacity: 0.3, radius: 3, y: 2)
                                .offset(x: on ? 22 : 2)
                        }
                        .animation(.rn(.easeOut, 220), value: on)
                }
                Text("Save automatically")
                    .font(.ezer(FontFamily.serif, 28))
                    .rnLineHeight(31, family: FontFamily.serif, size: 28)
                    .foregroundStyle(on ? Color(css: "#FFFFFF") : c.ink)
                    .padding(.top, 12)
                Text(text)
                    .font(.ezer(FontFamily.regular, 13))
                    .rnLineHeight(19, family: FontFamily.regular, size: 13)
                    .foregroundStyle(on ? Color(css: "rgba(255,255,255,.8)") : c.mut)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)

                if let footer {
                    footer
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 12)
                        .savingsBorderTop(on ? Color(css: "rgba(255,255,255,.16)") : c.line)
                        .padding(.top, 14)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18 + 1)
            .background(
                shape.fill(
                    LinearGradient.rn(
                        on ? [c.accent, Color(css: "#2A0F5C")] : [c.bg2, c.bg2],
                        start: UnitPoint(x: 0, y: 0),
                        end: UnitPoint(x: 1, y: 1)
                    )
                )
            )
            .overlay(shape.strokeBorder(on ? Color(css: theme.tokens.accInk + "2E") : c.line, lineWidth: 1))
        }
        // RN accessibilityRole="switch" with no label: one switch that reads the card's own text
        // (body, footer figures), then On / Off.
        .accessibilityValue(on ? "On" : "Off")
        .accessibilityAddTraits(.isToggle)
    }
}

extension AutoSaveCard where Footer == EmptyView {
    init(on: Bool, text: String, onToggle: @escaping () -> Void) {
        self.init(on: on, text: text, onToggle: onToggle, footer: nil)
    }
}

// Port of apps/mobile/components/redesign/VirtualCard.tsx
//
// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The free-drag spin physics live in SpinCard.swift (shared with Card Studio's
// finished-design review so there is exactly one implementation of it). This
// file owns only what is specific to the Pay in 4 card: its front/back content.
// No contactless mark anywhere (CLAUDE.md).
//
// There is NO tap-to-reveal. GET /cards/highnote returns only last4 + expiry,
// never the full number (PAN), so an issued card cannot be revealed from what
// this app holds; a real reveal needs Highnote's PCI-scoped secure display.
// The preview card's "revealed" number (and its 09/29 expiry) was invented,
// which is worse than showing nothing. Keep it masked.
// =============================================================================

import SwiftUI

private let NUMBER_MASKED = "••••  ••••  ••••  ••••"

struct VirtualCard: View {
    var finish: CardFinish = .amethyst
    /**
     * Fired when a turn starts/ends. The parent screen uses this to switch its
     * ScrollView off, so a vertical drag on the card rotates it instead of
     * scrolling the page.
     */
    var onDragChange: ((Bool) -> Void)?
    /** Issued card (Highnote TEST). nil = the preview card. */
    var issued: (last4: String, expiry: String)?

    init(finish: CardFinish = .amethyst, onDragChange: ((Bool) -> Void)? = nil, issued: (last4: String, expiry: String)? = nil) {
        self.finish = finish
        self.onDragChange = onDragChange
        self.issued = issued
    }

    var body: some View {
        let finishColors = cardFinishes[finish] ?? []

        SpinCard(onDragChange: onDragChange) {
            // front: fill + facePad (padding 18, justifyContent: space-between)
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    CardChip()
                    Spacer(minLength: 0)
                }

                Spacer(minLength: 0)

                Text(issued.map { "••••  ••••  ••••  \($0.last4)" } ?? NUMBER_MASKED)
                    .font(.ezer(FontFamily.medium, 17))
                    .tracking(1.6)
                    .foregroundStyle(Color(css: "#FFFFFF"))
                    .frame(maxWidth: .infinity, alignment: .leading)

                Spacer(minLength: 0)

                HStack(alignment: .center, spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        PayIn4CardLabel("CARDHOLDER")
                        PayIn4CardValue("EZER MEMBER")
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .leading, spacing: 0) {
                        PayIn4CardLabel(issued != nil ? "EXPIRES" : "STATUS")
                        PayIn4CardValue(issued?.expiry ?? "PREVIEW")
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                LinearGradient.rn(finishColors, locations: Gradients.cardFrontLocations, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                    .clipShape(rnRect(Radius.virtualCard))
            )
        } back: {
            ZStack(alignment: .topLeading) {
                LinearGradient.rn(Gradients.cardBack, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                    .clipShape(rnRect(Radius.virtualCard))
                // magStripe: absolute, top 22, left/right 0, height 36
                Color(css: "#000000")
                    .frame(height: 36)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 22)
                // signatureRow: marginTop 78, paddingHorizontal 18
                Text("•••")
                    .font(.ezer(FontFamily.semibold, 12))
                    .tracking(2)
                    .foregroundStyle(Color(css: "#1A1A1A"))
                    .padding(.trailing, 10)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .frame(height: 32)
                    .background(rnRect(4).fill(Color(css: "rgba(255,255,255,.9)")))
                    .padding(.top, 78)
                    .padding(.horizontal, 18)
                // backNote: absolute, bottom 16, left 18
                Text("SINGLE-USE VIRTUAL CARD")
                    .font(.ezer(FontFamily.bold, 8))
                    .tracking(0.8)
                    .foregroundStyle(Color(css: "rgba(255,255,255,.5)"))
                    .padding(.leading, 18)
                    .padding(.bottom, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

/// styles.cardLabel: bold 8, letterSpacing .8, rgba(255,255,255,.55), marginBottom 3.
private struct PayIn4CardLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.ezer(FontFamily.bold, 8))
            .tracking(0.8)
            .foregroundStyle(Color(css: "rgba(255,255,255,.55)"))
            .padding(.bottom, 3)
    }
}

/// styles.cardValue: semibold 11.5, letterSpacing .6, #FFFFFF.
private struct PayIn4CardValue: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.ezer(FontFamily.semibold, 11.5))
            .tracking(0.6)
            .foregroundStyle(Color(css: "#FFFFFF"))
    }
}

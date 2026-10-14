// Port of apps/mobile/app/screens/PhysicalCardReview.tsx
//
// =============================================================================
// EZER Redesign — finished card review
//
// Landed on from PhysicalCardApproval's "Done", and from Home's "Get your
// physical card" tile once HomeCardFlowStatus reports a design AND a terminal
// approval outcome already exist. Before that point the tile still opens the
// raw designer (PhysicalCardView) — this screen is what "you already went
// through the flow" looks like, so it never reopens the blank canvas itself.
// "Edit design" is the one explicit way back into it.
//
// The card uses the same free-drag spin physics as the Pay in 4 virtual card
// (PayIn4/SpinCard.swift) rather than the designer's controlled flip — this is a
// finished object being shown off, not a drawing surface. Front/back content
// comes from CardCanvas's own CardFrontFace/CardBackFace (PayIn4/CardFaces.swift)
// so the LOCKED layout (chip-only front, identifying details back) can't drift
// between the two screens that render a design. Never reimplement them here.
// =============================================================================

import SwiftUI

// isFinish: cardStudioIsFinish (PhysicalCardView.swift).

private func formatLimit(_ cents: Int) -> String {
    "$" + Int(jsRound(Double(cents) / 100)).formatted(.number.locale(Locale(identifier: "en_US")))
}

struct PhysicalCardReviewView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var loading = true
    @State private var finish: CardFinish = .amethyst
    @State private var strokes: [CardStroke] = []
    @State private var access: CardAccessOutcome?
    // While the card is being turned the page must not scroll (RN scrollEnabled={!dragging}).
    @State private var dragging = false
    @State private var mounted = false

    var body: some View {
        let c = theme.colors
        Group {
            if loading {
                VStack(alignment: .leading, spacing: 0) {
                    DoveLoader()
                    Skeleton(w: 200, h: 26)
                    Skeleton(w: 280, h: 12).padding(.top, 10)
                    Skeleton(w: 300, h: 190, r: Radius.virtualCard).frame(maxWidth: .infinity).padding(.top, 28)
                    Skeleton(h: 88, r: 18).padding(.top, 28)
                    Skeleton(h: 52, r: 26).padding(.top, 18)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Layout.screenX)
                .padding(.top, 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(c.bg)
            } else {
                content(c)
            }
        }
        .rnScreen()
        // useEffect(..., []): once per mount.
        .task { load() }
    }

    private func load() {
        guard !mounted else { return }
        mounted = true
        let design = CardDesignStore.loadCardDesign()
        let outcome = CardDesignStore.getCardAccessOutcome()

        // Nothing to review — send them to make something instead of showing an
        // empty spinning card.
        guard let design else {
            router.replace("/screens/PhysicalCard")
            return
        }
        if let f = cardStudioIsFinish(design.finish) { finish = f }
        strokes = design.strokes

        // A design with no terminal outcome means approval was abandoned
        // mid-flow — that screen is the correct next step, not this one.
        guard let outcome else {
            router.replace("/screens/PhysicalCardApproval")
            return
        }
        access = outcome
        loading = false
    }

    private func content(_ c: ThemeColors) -> some View {
        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    // This screen is the finished object: every way out of it goes
                    // home — not "back through however many screens it took to get
                    // here" (an extra Approval or Review can sit underneath from an
                    // earlier attempt). So both the header chevron and the explicit
                    // "Done" button below replace straight to Home, unconditionally.
                    HStack(alignment: .center, spacing: 0) {
                        PressScale(scaleTo: 0.9, action: { router.replace("/(tabs)/home") }) {
                            Ionicon("chevron-back", size: 18, color: c.ink)
                                .frame(width: 38, height: 38)
                                .rnBox(bg: c.card, radius: 19, border: c.line)
                        }
                        Text("Your card")
                            .typeStyle(TypeScale.screenTitle)
                            .foregroundStyle(c.ink)
                            .padding(.leading, 12)
                    }
                    .padding(.bottom, 4)

                    SpinCard(hint: "Drag to spin it around", onDragChange: { dragging = $0 }) {
                        CardFrontFace(finish: finish, strokes: strokes)
                    } back: {
                        CardBackFace(finish: finish)
                    }
                    .padding(.top, 8)

                    if access?.status == .approved, let limitCents = access?.limitCents {
                        Surface(borderColor: c.goldLine, background: c.goldSoft) {
                            VStack(alignment: .leading, spacing: 0) {
                                Label("Your starting limit", color: c.gold)
                                Text(formatLimit(limitCents))
                                    .typeStyle(TypeScale.totalValue)
                                    .foregroundStyle(c.gold)
                                    .padding(.top, 4)
                                BodyText("You're on the access list with priority. We'll print this design.")
                                    .padding(.top, 6)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18 + 1) // padding 18; RN's 1px border takes layout space
                        }
                        .padding(.top, 20)
                    }

                    // Legacy only: PhysicalCardApprovalView no longer writes a 'review'
                    // outcome (CLAUDE.md: no manual-review state), but one saved by an older
                    // build can still be on the device. RN's PhysicalCardReview shows the same.
                    if access?.status == .review {
                        Surface {
                            VStack(alignment: .leading, spacing: 0) {
                                Label("Under review")
                                BodyText("A person is taking a look at your account history. You're on the access list and we'll be in touch.")
                                    .padding(.top, 6)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(18 + 1)
                        }
                        .padding(.top, 20)
                    }

                    if access?.status == .waitlist {
                        VStack(alignment: .leading, spacing: 0) {
                            Text("You're on the early-access list ✓")
                                .font(.ezer(FontFamily.bold, 16.5))
                                .foregroundStyle(c.ink)
                            BodyText("We'll notify you at launch. No spending limit yet — connect your bank any time to get one and move up the list.")
                                .padding(.top, 6)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                        .rnBox(bg: c.successBg, radius: Radius.cardLg)
                        .padding(.top, 20)
                    }

                    if access?.status == .waitlist {
                        PressScale(scaleTo: 0.97, action: { router.push("/screens/PhysicalCardApproval") }) {
                            Text("Connect your bank instead")
                                .font(.ezer(FontFamily.bold, 15))
                                .tracking(0.3)
                                .foregroundStyle(Color(css: "#FFFFFF"))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .rnBox(bg: c.goldBg, radius: Radius.buttonLg)
                        }
                        .padding(.top, 12)
                    }

                    // Explicit, unconditional exit — see the header chevron's comment
                    // above. This is the one control on the screen whose destination
                    // never depends on how the stack got built.
                    PressScale(scaleTo: 0.97, action: { router.replace("/(tabs)/home") }) {
                        Text("Done")
                            .font(.ezer(FontFamily.bold, 15))
                            .tracking(0.3)
                            .foregroundStyle(c.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16 + 1.5) // + the 1.5 border RN lays out
                            .rnBox(bg: c.card, radius: Radius.buttonLg, border: c.line2, borderWidth: 1.5)
                    }
                    .padding(.top, 12)

                    SectionHeader("Not quite right?")
                        .padding(.top, 26)
                    PressScale(scaleTo: 0.97, action: { router.push("/screens/PhysicalCard") }) {
                        HStack(alignment: .center, spacing: 8) {
                            Ionicon("brush-outline", size: 16, color: c.ink)
                            Text("Edit design")
                                .font(.ezer(FontFamily.bold, 14.5))
                                .foregroundStyle(c.ink)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .rnBox(bg: c.card, radius: Radius.buttonLg, border: c.line2, borderWidth: 1.5)
                    }
                    .padding(.top, 10)
                    BodyText("Your approval status stays as-is — redrawing the artwork doesn't change it.")
                        .padding(.top, 8)

                    Surface {
                        HStack(alignment: .top, spacing: 10) {
                            Ionicon("information-circle-outline", size: 16, color: c.mut)
                            VStack(alignment: .leading, spacing: 0) {
                                Label("Please note")
                                BodyText("Card issuance is subject to approval. Any limit shown is an indication based on the information available now and may change before your card is issued.")
                                    .padding(.top, 3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(14 + 1)
                    }
                    .padding(.top, 18)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            .background(CardStudioNoBounce()) // bounces={false}
        }
        .scrollIndicators(.hidden)
        .scrollDisabled(dragging)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(c.bg)
    }
}

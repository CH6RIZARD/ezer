// Port of apps/mobile/app/(tabs)/payin4.tsx
//
// =============================================================================
// EZER Redesign — Pay in 4 tab
//
// Handoff §3. Title "Pay in *four*" (four in Instrument Serif Italic, accent),
// EARLY ACCESS + COMING SOON pulse chip, the locked 3D virtual card, a
// "Spend with clarity" card, "How it splits" 4 date tiles with PAY 1 gold,
// gradient join CTA -> SpendingPowerSheet, shield reassurance, legal fine print.
// =============================================================================
//
// The header's EZER is Primitives' TabMark (`.tabMark()` on the scroll content), locked in the same
// place and size as on every other tab.

import SwiftUI
import UIKit

/** Illustrative basket used to show what one installment actually costs. */
private let EXAMPLE_TOTAL_CENTS = 12000
private let INSTALLMENTS = 4

private struct PayIn4Installment {
    let n: Int
    let amountCents: Int
    let share: Double
    let due: String
}

private let shortDay: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMd")
    return f
}()

/// `d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` → "Oct 26".
private func shortDate(_ d: Date) -> String { shortDay.string(from: d) }

/// `new Date(iso)`: full ISO timestamps, or a bare 'YYYY-MM-DD' which JS reads as UTC midnight.
private func jsNewDate(_ s: String) -> Date? {
    if let d = parseISODate(s) { return d }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    return f.date(from: s)
}

/**
 * The four installments: the first is due at checkout, then one every two
 * weeks — the standard BNPL schedule.
 */
private func installmentsFor(_ plan: HighnotePlan?) -> [PayIn4Installment] {
    if let plan {
        let today = toDateString(Date())
        return plan.dueDates.enumerated().map { i, iso in
            let d = jsNewDate(iso)
            let due: String
            if i < plan.paid {
                due = "Paid"
            } else if let d, toDateString(d) == today {
                due = "Due today"
            } else {
                due = d.map(shortDate) ?? "Invalid Date"
            }
            return PayIn4Installment(n: i + 1, amountCents: plan.perPaymentCents, share: Double(i + 1) / Double(plan.count), due: due)
        }
    }
    let each = Int(jsRound(Double(EXAMPLE_TOTAL_CENTS) / Double(INSTALLMENTS)))

    return (0..<INSTALLMENTS).map { i in
        let d = Calendar.current.date(byAdding: .day, value: i * 14, to: Date()) ?? Date()
        return PayIn4Installment(
            n: i + 1,
            amountCents: each,
            // CUMULATIVE, not per-payment: how much of the purchase is paid off
            // once this installment clears — 1/4, 2/4, 3/4, 4/4. Four identical
            // arcs would tell the user nothing.
            share: Double(i + 1) / Double(INSTALLMENTS),
            due: i == 0 ? "Due today" : shortDate(d)
        )
    }
}

struct PayIn4View: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    // While the card is being turned the page must not scroll — otherwise a
    // vertical drag fights the rotation and the screen slides away underneath it.
    @State private var cardDragging = false

    // useIssuedCard(): the Highnote TEST card, if one was issued. Polls while
    // issuance is still running server-side (it takes a few seconds after joining).
    @State private var issued: HighnoteCardView?
    @State private var issuedPoll: Task<Void, Never>?

    // --- Spending Power sheet ---------------------------------------------------
    // Both the Home tile and this tab's own CTA open the SAME sheet over this tab,
    // rather than navigating to a separate screen. `joined` tracks whether an
    // outcome already exists so the CTA's label can switch to "Your status".
    @State private var sheetVisible = false
    @State private var sheetViaJoin = false
    @State private var joined = false
    @State private var handledSheetParam: String?
    @State private var mounted = false
    /// The Card Studio design, re-read on every appear (coming back from the designer is one).
    @State private var savedDesign: SavedCardDesign?

    var body: some View {
        let colors = theme.colors
        let params = router.params(.payin4)
        let last4 = issued?.card?.last4 ?? ""
        let expiry = issued?.card?.expiry ?? ""
        let plan = issued?.plans?.first
        let installments = installmentsFor(plan)

        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    // --- header (EZER: TabMark, top right) -------------------------
                    (Text("Pay in ") + Text("four").font(.ezer(FontFamily.serif, 28)).foregroundColor(colors.accInk))
                        .typeStyle(TypeScale.screenTitle)
                        .foregroundStyle(colors.ink)
                    BodyText("One card. Four easy payments. Zero drama.")
                        .padding(.top, 6)

                    HStack(alignment: .center, spacing: 8) {
                        Text("EARLY ACCESS")
                            .typeStyle(TypeScale.labelSm)
                            .foregroundStyle(colors.accInk)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(colors.accSoft))
                            .clipShape(Capsule())
                        Text(issued?.status == "ready" ? "TEST CARD" : issued?.status == "pending" ? "ISSUING…" : "COMING SOON")
                            .typeStyle(TypeScale.labelSm)
                            .foregroundStyle(colors.gold)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background {
                                ZStack {
                                    Capsule().fill(colors.goldSoft)
                                    PulseRing(radius: Radius.pill)
                                }
                            }
                            .clipShape(Capsule())
                    }
                    .padding(.top, 14)

                    // --- the card ----------------------------------------------------
                    VirtualCard(
                        onDragChange: { cardDragging = $0 },
                        issued: !last4.isEmpty && !expiry.isEmpty ? (last4: last4, expiry: expiry) : nil,
                        design: savedDesign
                    )
                    .padding(.top, 10)

                    // --- spend with clarity ------------------------------------------
                    Surface {
                        VStack(alignment: .leading, spacing: 0) {
                            SectionHeader("Spend with clarity")
                            BodyText("Split any purchase into four. See every installment before you commit — no interest, no surprises, no drama.")
                                .rnLineHeight(19, TypeScale.body)
                                .padding(.top, 6)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.top, 18)

                    // --- installment schedule ----------------------------------------
                    // Rings, not boxes, and each one fills FURTHER than the last: 1/4,
                    // 2/4, 3/4, 4/4 paid off. Read left to right the row is a progress
                    // sequence that closes on the final payment.
                    SectionHeader("Your installment plan")
                        .padding(.top, 22)
                        .padding(.bottom, 4)
                    BodyText(
                        plan.map { "Your \(formatCents($0.totalCents)) purchase — \($0.paid) of \($0.count) paid, one every two weeks. No interest." }
                            ?? "A \(formatCents(EXAMPLE_TOTAL_CENTS)) purchase becomes four equal installments of \(formatCents(installments.first?.amountCents ?? 0)) — the first at checkout, the rest every two weeks. No interest."
                    )
                    .padding(.bottom, 14)

                    HStack(alignment: .top, spacing: 8) {
                        ForEach(installments, id: \.n) { inst in
                            installmentView(inst, plan: plan)
                        }
                    }

                    BodyText("Each ring shows how much of the purchase is paid off after that installment — a quarter at a time, until it closes at the fourth.")
                        .padding(.top, 12)

                    // --- join CTA ------------------------------------------------------
                    // Opens SpendingPowerSheet right over this tab (never navigates away) —
                    // viaJoin: true so a first tap actually POSTs the waitlist join. Once
                    // `joined`, the label switches and the sheet opens straight to whatever
                    // status/reveal phase already applies.
                    PressScale(action: { openSheet(!joined) }) {
                        Text(joined ? "Your status" : "Check your spending power")
                            .font(.ezer(FontFamily.bold, 15))
                            .foregroundStyle(Color(css: "#FFFFFF"))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(
                                LinearGradient.rn(Gradients.ctaPrimary, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
                                    .clipShape(rnRect(Radius.buttonLg))
                            )
                    }
                    .padding(.top, 20)

                    HStack(alignment: .center, spacing: 0) {
                        Ionicon("shield-checkmark-outline", size: 15, color: colors.mut)
                        BodyText("Your card details are never shared with merchants.")
                            .padding(.leading, 7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.top, 16)

                    Text("Pay in 4 is not yet available. Joining the early-access list does not guarantee approval. Splitting a purchase is subject to eligibility and a soft check that does not affect your credit score. Amounts shown are illustrative.")
                        .font(.ezer(FontFamily.regular, 10.5))
                        .rnLineHeight(16, family: FontFamily.regular, size: 10.5)
                        .foregroundStyle(colors.mut3)
                        .padding(.top, 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, insets.bottom + Layout.tabBottom)
            .background(PayIn4NoBounce())
            .tabMark()
        }
        .scrollIndicators(.hidden)
        .scrollDisabled(cardDragging)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colors.bg)
        .rnScreen()
        .background {
            SpendingPowerSheet(visible: sheetVisible, viaJoin: sheetViaJoin, onClose: closeSheet)
        }
        .onAppear {
            refreshDesign()
            guard !mounted else { return }
            mounted = true
            refreshJoined()
            refreshIssued()
        }
        // Home's Spending Power tile pushes here with ?sheet=spending&t=<nonce>.
        // Keyed on sheet+t together: this tab stays mounted across tab switches,
        // so the nonce makes every tap a genuine, distinct param change.
        .onChange(of: "\(params["sheet"] ?? ""):\(params["t"] ?? "")", initial: true) { _, _ in
            guard params["sheet"] == "spending" else { return }
            let key = "spending:\(params["t"] ?? "")"
            if handledSheetParam != key {
                handledSheetParam = key
                openSheet(false)
            }
        }
    }

    private func installmentView(_ inst: PayIn4Installment, plan: HighnotePlan?) -> some View {
        let colors = theme.colors
        let first = plan.map { inst.due != "Paid" && inst.n == $0.paid + 1 } ?? (inst.n == 1)
        let tint = first ? colors.gold : colors.accInk

        return VStack(alignment: .center, spacing: 7) {
            ProgressRing(progress: inst.share, size: 58, stroke: 5, color: tint, trackColor: colors.line) {
                (Text("\(inst.n)") + Text("/\(INSTALLMENTS)").foregroundColor(colors.mut2))
                    .font(.ezer(FontFamily.bold, 14))
                    .foregroundStyle(tint)
            }

            Text(formatCents(inst.amountCents))
                .font(.ezer(FontFamily.bold, 14))
                .foregroundStyle(colors.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text(inst.due)
                .typeStyle(TypeScale.labelSm)
                .foregroundStyle(first ? colors.gold : colors.mut2)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        }
        .frame(maxWidth: .infinity)
    }

    private func refreshJoined() {
        Task { joined = await CardDesignStore.loadSpendingPowerOutcome() != nil }
    }

    /// Kept as the same value while nothing changed, so an appear doesn't rebuild the card.
    private func refreshDesign() {
        let next = CardDesignStore.loadCardDesign().flatMap { d in
            CardFinish(rawValue: d.finish).map { SavedCardDesign(finish: $0, strokes: d.strokes, updatedAt: d.updatedAt) }
        }
        if next != savedDesign { savedDesign = next }
    }

    private func refreshIssued(_ tries: Int = 0) {
        issuedPoll?.cancel()
        issuedPoll = Task { @MainActor in
            do {
                let r = try await api.highnoteCard()
                if Task.isCancelled { return }
                issued = r
                if r?.status == "pending" && tries < 15 {
                    try await Task.sleep(nanoseconds: 4_000_000_000)
                    refreshIssued(tries + 1)
                }
            } catch {
                // signed out / offline / cancelled: keep the preview card
            }
        }
    }

    private func openSheet(_ viaJoin: Bool) {
        Task {
            // SpendingPowerSheet reads only the local cache. Fill it from the server first, or
            // after a reinstall the sheet says "still a blank" (and POSTs a waitlist join) for
            // someone Home already shows a limit for.
            let outcome = await CardDesignStore.loadSpendingPowerOutcome()
            joined = outcome != nil
            sheetViaJoin = viaJoin && outcome == nil
            sheetVisible = true
        }
    }

    private func closeSheet() {
        sheetVisible = false
        refreshJoined()
        refreshIssued()
    }
}

/// RN `bounces={false}`: SwiftUI has no switch for it, so this finds the hosting UIScrollView and
/// turns bouncing off. Lives in the scroll content's background.
private struct PayIn4NoBounce: UIViewRepresentable {
    func makeUIView(context: Context) -> PayIn4NoBounceProbe {
        let v = PayIn4NoBounceProbe()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: PayIn4NoBounceProbe, context: Context) {
        uiView.apply()
    }
}

private final class PayIn4NoBounceProbe: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        onNextRunLoop { [weak self] in self?.apply() }
    }

    func apply() {
        var v = superview
        while let s = v {
            if let scroll = s as? UIScrollView {
                if scroll.bounces { scroll.bounces = false }
                return
            }
            v = s.superview
        }
    }
}

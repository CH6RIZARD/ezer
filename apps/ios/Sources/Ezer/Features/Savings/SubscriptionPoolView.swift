// Port of apps/mobile/app/screens/SubscriptionPool.tsx
//
// EZER — Subscription savings (the pool)
//
// PATCH-NOTES-subscription-savings.md: a user has at most ONE goal that every subscription with smart
// saving feeds. This screen is that goal: how much it holds, which subscriptions fed it, and per
// source switch Half/Match, Pause/Resume or Stop. Stopping keeps the money in the goal; a stopped
// source can be restarted (PUT). "Add" lists subscriptions without a live source.
//
// Every write goes through SavingsGoalsStore (server write, then re-read). No target, so no ring.
// Amounts shown are `total` (saved + pending + queued): no ACH processor exists yet, so `saved`
// alone stays 0.
//
// Also here: PoolMark / PoolStackedMarks, the cascading merchant marks the Savings tab's pool row uses
// (RN components/redesign/StackedMarks.tsx).

import SwiftUI

// MARK: - stacked marks

struct PoolMark: Hashable {
    var name: String
    var merchantId: String?
    var logoUrl: String?
}

/// Up to three MerchantMarks cascading down-right (`step`), each ringed in the surface colour.
/// `size` is the outer tile, ring included (the mock's border-box 30px).
struct PoolStackedMarks: View {
    let marks: [PoolMark]
    var size: CGFloat = 30
    var step: CGFloat = 10
    var diagonal = true
    let ringColor: Color

    var body: some View {
        let shown = Array(marks.prefix(3))
        let n = CGFloat(max(1, shown.count))
        let w = size + (n - 1) * step
        ZStack(alignment: .topLeading) {
            ForEach(Array(shown.enumerated()), id: \.offset) { i, m in
                MerchantMark(name: m.name, merchantId: m.merchantId, size: size - 4, logoUrl: m.logoUrl)
                    .padding(2)
                    .background(rnRect((size * 0.34).rounded()).fill(ringColor))
                    .offset(x: CGFloat(i) * step, y: diagonal ? CGFloat(i) * step : 0)
            }
        }
        .frame(width: w, height: diagonal ? w : size, alignment: .topLeading)
    }
}

// MARK: - helpers

private func poolMoney(_ dollars: Double) -> String { formatCents(savingsDollarsToCents(dollars)) }

private let poolDayFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

/// "Nov 3". A bare YYYY-MM-DD is a local calendar day.
private func poolMonthDay(_ s: String?) -> String? {
    guard let s, !s.isEmpty else { return nil }
    if s.count == 10, let d = poolDayFormatter.date(from: s) { return savingsMonthDay(d) }
    if let d = parseISODate(s) { return savingsMonthDay(d) }
    return nil
}

private func poolPlural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

/// HALF = half the price (cents rounded), MATCH = the price.
private func poolPer(_ price: Double, _ mode: String) -> Double {
    mode == "HALF" ? jsRound(price * 50) / 100 : price
}

// MARK: - screen

struct SubscriptionPoolView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(DataStore.self) private var data
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var open: String?
    @State private var adding = false
    /// subscriptionId of the write in flight: that row dims and the camera dove flies.
    @State private var busy: String?

    private func run(_ id: String, _ title: String, _ op: @escaping @MainActor () async -> MoveResult) {
        guard busy == nil else { return }
        busy = id
        Task {
            let res = await op()
            busy = nil
            if !res.ok { AppAlert.alert(title, res.error) }
        }
    }

    private func sub(_ id: String) -> Subscription? { data.subscriptions.first { $0.id == id } }

    /// The subscription's price, else worked back from what the source moves per charge.
    private func price(_ s: PoolSource) -> Double {
        if let c = sub(s.subscriptionId)?.amountCents, c > 0 { return Double(c) / 100 }
        return s.mode == "HALF" ? s.perCharge * 2 : s.perCharge
    }

    private var eligible: [Subscription] {
        let sources = savings.pool?.sources ?? []
        return data.subscriptions.filter { s in
            if s.status.lowercased().contains("cancel") { return false }
            guard let src = sources.first(where: { $0.subscriptionId == s.id }) else { return true }
            return src.status == "ENDED"
        }
    }

    var body: some View {
        let c = theme.colors
        ScrollView(.vertical) {
            ScreenBody {
                content(c)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, insets.bottom + 48)
        }
        .scrollIndicators(.hidden)
        .cameraDove(busy != nil)
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
        .background {
            Color.clear
                .frame(width: 0, height: 0)
                .rnModal(isPresented: adding, animationType: .slide, onRequestClose: { adding = false }) {
                    PoolAddSheet(
                        eligible: eligible,
                        hasAny: !data.subscriptions.isEmpty,
                        onClose: { adding = false },
                        onAdd: { s, mode in
                            adding = false
                            run(s.id, "Could not add it") { await savings.setSubscriptionSaving(s.id, mode) }
                        }
                    )
                }
        }
    }

    @ViewBuilder
    private func content(_ c: ThemeColors) -> some View {
        let pool = savings.pool
        let sources = pool?.sources ?? []
        let live = sources.filter { $0.status != "ENDED" }
        let activeCount = live.filter { $0.status == "ACTIVE" }.count
        let ended = sources.filter { $0.status == "ENDED" }
        let sk = !savings.hydrated
        let shareColors: [Color] = [c.accInk, c.gold, c.mut, c.mut2, c.line2]
        let shareBase = sources.filter { $0.total > 0 }
        let shareTotal = shareBase.reduce(0) { $0 + $1.total }
        let history = Array((pool?.recent ?? []).prefix(10))

        VStack(alignment: .leading, spacing: 0) {
            // --- header ---
            HStack(alignment: .center, spacing: 12) {
                SavingsPressable(hitSlop: 8, action: { router.back() }) {
                    Ionicon("chevron-back", size: 18, color: c.ink)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(c.card))
                        .overlay(Circle().strokeBorder(c.line, lineWidth: 1))
                }
                Text("Subscription savings")
                    .font(.ezer(FontFamily.bold, 21))
                    .tracking(-0.4)
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 3) {
                    if activeCount > 0 { Ionicon("sparkles", size: 10, color: c.success) }
                    Text(activeCount > 0 ? "AUTO" : "PAUSED")
                        .font(.ezer(FontFamily.bold, 9)).tracking(0.5)
                        .foregroundStyle(activeCount > 0 ? c.success : c.mut2)
                }
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(rnRect(Radius.pill).fill(activeCount > 0 ? c.successBg : c.bg2))
                .fixedSize()
            }

            // --- hero ---
            Surface(radius: Radius.hero) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("SAVED FROM SUBSCRIPTIONS")
                        .font(.ezer(FontFamily.semibold, 11)).tracking(0.5)
                        .foregroundStyle(c.mut)
                    if sk {
                        Skeleton(w: 160, h: 44, r: 12).padding(.top, 8).padding(.bottom, 4)
                    } else {
                        Text(poolMoney(pool?.saved ?? 0))
                            .font(.ezer(FontFamily.serif, 44))
                            .foregroundStyle(c.success)
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                            .padding(.top, 4)
                    }
                    Text(activeCount > 0
                         ? "+\(poolMoney(pool?.perCycle ?? 0)) every cycle · from \(poolPlural(live.count, "subscription", "subscriptions"))"
                         : "Nothing is adding to it right now")
                        .font(.ezer(FontFamily.regular, 13))
                        .foregroundStyle(c.mut)
                        .padding(.top, 4)

                    if shareTotal > 0 {
                        GeometryReader { geo in
                            let gaps = CGFloat(max(0, shareBase.count - 1)) * 3
                            HStack(spacing: 3) {
                                ForEach(Array(shareBase.enumerated()), id: \.element.id) { i, s in
                                    Rectangle()
                                        .fill(shareColors[i % shareColors.count])
                                        .frame(width: max(0, (geo.size.width - gaps) * CGFloat(s.total / shareTotal)))
                                }
                            }
                        }
                        .frame(height: 8)
                        .clipShape(rnRect(4))
                        .padding(.top, 14)

                        PoolLegend(items: shareBase.enumerated().map { i, s in
                            PoolLegendItem(
                                id: s.id,
                                name: s.merchantName,
                                pct: "\(Int(jsRound(s.total / shareTotal * 100)))%",
                                color: shareColors[i % shareColors.count]
                            )
                        })
                        .padding(.top, 10)
                    }

                    Text("One goal for every subscription you save alongside. No target: it grows with each charge.")
                        .font(.ezer(FontFamily.regular, 12))
                        .rnLineHeight(17, family: FontFamily.regular, size: 12)
                        .foregroundStyle(c.mut2)
                        .padding(.top, 12)
                        .savingsBorderTop(c.line)
                        .padding(.top, 14)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18 + 1)
            }
            .padding(.top, 16)

            // --- sources ---
            HStack(alignment: .center, spacing: 0) {
                Text("Where it comes from")
                    .font(.ezer(FontFamily.bold, 16.5))
                    .foregroundStyle(c.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                SavingsPressable(hitSlop: 10, action: { adding = true }) {
                    HStack(spacing: 4) {
                        Ionicon("add", size: 15, color: c.accInk)
                        Text("Add").font(.ezer(FontFamily.semibold, 12.5)).foregroundStyle(c.accInk)
                    }
                    .padding(.leading, 10)
                    .padding(.vertical, 6)
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 10)

            VStack(alignment: .leading, spacing: 8) {
                if sk {
                    ForEach(0..<2, id: \.self) { i in
                        Surface {
                            VStack(alignment: .leading, spacing: 10) {
                                Skeleton(w: i == 0 ? 170 : 120, h: 14)
                                Skeleton(w: 90, h: 10)
                            }
                            .padding(14)
                        }
                    }
                } else if live.isEmpty {
                    BodyText("No subscription is saving right now. Tap Add, or turn on smart saving from any subscription.")
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(18 + 1)
                        .background(rnRect(18).fill(c.card))
                        .overlay(rnRect(18).strokeBorder(c.line2, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
                } else {
                    ForEach(live) { s in sourceRow(s, c) }
                }
            }

            // --- stopped ---
            if !ended.isEmpty {
                Text("STOPPED · THE MONEY STAYS IN THIS GOAL")
                    .font(.ezer(FontFamily.semibold, 10.5)).tracking(0.5)
                    .foregroundStyle(c.mut2)
                    .padding(.top, 20)
                    .padding(.bottom, 8)
                Surface {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(ended.enumerated()), id: \.element.id) { i, s in
                            endedRow(s, i, c)
                        }
                    }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 1)
                }
            }

            // --- recent ---
            if !history.isEmpty {
                Text("Recent")
                    .font(.ezer(FontFamily.bold, 16.5))
                    .foregroundStyle(c.ink)
                    .padding(.top, 24)
                    .padding(.bottom, 10)
                Surface {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(history.enumerated()), id: \.element.id) { i, r in
                            recentRow(r, i, c)
                        }
                    }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 1)
                }
            }

            Text("EZER is not a bank. Balances and transfers shown here are simulated while bank connections are being certified — no funds are held, promised or guaranteed.")
                .font(.ezer(FontFamily.regular, 10.5))
                .foregroundStyle(c.mut3)
                .rnLineHeight(16, family: FontFamily.regular, size: 10.5)
                .padding(.top, 24)
        }
    }

    // MARK: - source row

    private func sourceRow(_ s: PoolSource, _ c: ThemeColors) -> some View {
        let sb = sub(s.subscriptionId)
        let isOpen = open == s.subscriptionId
        let paused = s.status == "PAUSED"
        let next = poolMonthDay(s.renewalDate ?? sb?.renewalDate)
        let half = s.mode == "HALF"
        let p = price(s)
        let rowBusy = busy == s.subscriptionId

        return VStack(alignment: .leading, spacing: 0) {
            SavingsPressable(action: { open = isOpen ? nil : s.subscriptionId }) {
                HStack(alignment: .center, spacing: 12) {
                    MerchantMark(name: s.merchantName, merchantId: sb?.merchantId, size: 40, logoUrl: s.logo ?? sb?.logo)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            Text(s.merchantName)
                                .font(.ezer(FontFamily.bold, 14.5))
                                .foregroundStyle(c.ink)
                                .lineLimit(1)
                            Text(half ? "SAVE HALF" : "MATCH FULL")
                                .font(.ezer(FontFamily.bold, 9.5)).tracking(0.3)
                                .foregroundStyle(half ? c.gold : c.accInk)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(rnRect(8).fill(half ? c.goldSoft : c.accSoft))
                                .fixedSize()
                        }
                        Text(paused
                             ? "Paused · was +\(poolMoney(s.perCharge)) each charge"
                             : "+\(poolMoney(s.perCharge)) each charge" + (next.map { " · next \($0)" } ?? ""))
                            .font(.ezer(FontFamily.regular, 11.5))
                            .foregroundStyle(c.mut2)
                            .lineLimit(1)
                            .padding(.top, 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(poolMoney(s.total))
                            .font(.ezer(FontFamily.bold, 14))
                            .foregroundStyle(s.total > 0 ? c.success : c.mut2)
                        Text(s.charges > 0 ? poolPlural(s.charges, "charge", "charges") : (next.map { "starts \($0)" } ?? "no charges yet"))
                            .font(.ezer(FontFamily.regular, 11))
                            .foregroundStyle(c.mut2)
                            .lineLimit(1)
                            .padding(.top, 2)
                    }
                    .fixedSize()
                    Ionicon("chevron-down", size: 12, color: c.mut2)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
                .padding(14 + 1)
            }

            if isOpen {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 8) {
                        ForEach(["HALF", "MATCH"], id: \.self) { mode in
                            let on = s.mode == mode
                            SavingsPressable(disabled: busy != nil || on, action: {
                                run(s.subscriptionId, "Could not switch") { await savings.setSubscriptionSaving(s.subscriptionId, mode) }
                            }) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(mode == "HALF" ? "Save half" : "Match full")
                                        .font(.ezer(FontFamily.bold, 12.5)).foregroundStyle(c.ink).lineLimit(1)
                                    Text("+\(poolMoney(poolPer(p, mode))) each charge")
                                        .font(.ezer(FontFamily.regular, 11)).foregroundStyle(c.mut).lineLimit(1)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10 + 2)
                                .background(rnRect(12).fill(on ? c.goldSoft : Color.clear))
                                .overlay(rnRect(12).strokeBorder(on ? c.gold : c.line, lineWidth: 2))
                            }
                        }
                    }
                    HStack(alignment: .center, spacing: 10) {
                        SavingsPressable(disabled: busy != nil, action: {
                            run(s.subscriptionId, "Could not change that") {
                                if paused { return await savings.resumeSubscriptionSaving(s.subscriptionId) }
                                return await savings.pauseSubscriptionSaving(s.subscriptionId)
                            }
                        }) {
                            Text(paused ? "Resume" : "Pause")
                                .font(.ezer(FontFamily.bold, 12)).foregroundStyle(c.ink)
                                .padding(.horizontal, 14 + 1)
                                .padding(.vertical, 9 + 1)
                                .background(rnRect(Radius.pill).fill(c.bg2))
                                .overlay(rnRect(Radius.pill).strokeBorder(c.line, lineWidth: 1))
                        }
                        Spacer(minLength: 0)
                        SavingsPressable(hitSlop: 8, disabled: busy != nil, action: {
                            open = nil
                            run(s.subscriptionId, "Could not stop it") { await savings.stopSubscriptionSaving(s.subscriptionId) }
                        }) {
                            Text("Stop saving from \(s.merchantName)")
                                .font(.ezer(FontFamily.bold, 12)).foregroundStyle(c.red)
                                .lineLimit(1)
                                .padding(.vertical, 9)
                        }
                    }
                    .padding(.top, 10)
                }
                .padding(.horizontal, 14 + 1)
                .padding(.bottom, 14 + 1)
            }
        }
        .background(rnRect(18).fill(c.card))
        .overlay(rnRect(18).strokeBorder(c.line, lineWidth: 1))
        .opacity(rowBusy ? 0.55 : paused ? 0.7 : 1)
    }

    // MARK: - stopped row

    private func endedRow(_ s: PoolSource, _ i: Int, _ c: ThemeColors) -> some View {
        let sb = sub(s.subscriptionId)
        let endedDate = s.endedAt.flatMap(parseISODate)
        let when: String? = endedDate.map { Calendar.current.isDateInToday($0) ? "today" : savingsMonthDay($0) }
        return HStack(alignment: .center, spacing: 12) {
            MerchantMark(name: s.merchantName, merchantId: sb?.merchantId, size: 32, logoUrl: s.logo ?? sb?.logo)
                .opacity(0.55)
            VStack(alignment: .leading, spacing: 1) {
                Text(s.merchantName)
                    .font(.ezer(FontFamily.semibold, 13.5)).foregroundStyle(c.mut).lineLimit(1)
                Text((when.map { "Stopped \($0) · " } ?? "Stopped · ") + poolPlural(s.charges, "charge", "charges"))
                    .font(.ezer(FontFamily.regular, 11)).foregroundStyle(c.mut2).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(poolMoney(s.total)).font(.ezer(FontFamily.bold, 13.5)).foregroundStyle(c.mut)
            SavingsPressable(disabled: busy != nil, action: {
                // ENDED is restarted with PUT (PATCH answers 409 for an ended source).
                run(s.subscriptionId, "Could not restart it") { await savings.setSubscriptionSaving(s.subscriptionId, s.mode) }
            }) {
                Text("Restart")
                    .font(.ezer(FontFamily.bold, 11)).foregroundStyle(c.accInk)
                    .padding(.horizontal, 11 + 1)
                    .padding(.vertical, 7 + 1)
                    .overlay(rnRect(Radius.pill).strokeBorder(c.line2, lineWidth: 1))
            }
        }
        .padding(.vertical, 12)
        .savingsBorderTop(c.line, i > 0 ? 1 : 0)
        .opacity(busy == s.subscriptionId ? 0.55 : 1)
    }

    // MARK: - recent row

    /// One charge-driven save. `queued` waits for the weekly sweep, `pending` is clearing.
    private func recentRow(_ r: PoolRecent, _ i: Int, _ c: ThemeColors) -> some View {
        let state = r.state == "queued" ? " · next sweep" : r.state == "pending" ? " · clearing" : ""
        return HStack(alignment: .center, spacing: 11) {
            Ionicon("checkmark", size: 14, color: c.success)
                .frame(width: 30, height: 30)
                .background(rnRect(Radius.cellSm).fill(c.successBg))
            VStack(alignment: .leading, spacing: 0) {
                Text("\(r.merchantName) charged")
                    .font(.ezer(FontFamily.bold, 13.5)).foregroundStyle(c.ink).lineLimit(1)
                Text((r.date.map(savingsMonthDay) ?? "") + state)
                    .font(.ezer(FontFamily.regular, 11.5)).foregroundStyle(c.mut2).lineLimit(1)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("+" + poolMoney(r.amount))
                .font(.ezer(FontFamily.bold, 13.5))
                .foregroundStyle(c.success)
                .opacity(r.state == "saved" ? 1 : 0.6)
                .lineLimit(1)
        }
        .padding(.vertical, 12)
        .savingsBorderTop(c.line, i > 0 ? 1 : 0)
    }
}

// MARK: - legend (wrapping row)

private struct PoolLegendItem: Identifiable {
    let id: String
    let name: String
    let pct: String
    let color: Color
}

private struct PoolLegend: View {
    @Environment(ThemeStore.self) private var theme
    let items: [PoolLegendItem]

    var body: some View {
        let c = theme.colors
        PoolFlow(hSpacing: 14, vSpacing: 6) {
            ForEach(items) { it in
                HStack(spacing: 6) {
                    Circle().fill(it.color).frame(width: 8, height: 8)
                    (Text(it.name + " ") + Text(it.pct).font(.ezer(FontFamily.bold, 11.5)).foregroundStyle(c.ink))
                        .font(.ezer(FontFamily.regular, 11.5))
                        .foregroundStyle(c.mut)
                        .lineLimit(1)
                }
            }
        }
    }
}

/// flexWrap: 'wrap' for the legend.
private struct PoolFlow: SwiftUI.Layout {
    var hSpacing: CGFloat
    var vSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxW { y += rowH + vSpacing; x = 0; rowH = 0 }
            x += s.width + hSpacing
            rowH = max(rowH, s.height)
            widest = max(widest, x - hSpacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { y += rowH + vSpacing; x = bounds.minX; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + hSpacing
            rowH = max(rowH, s.height)
        }
    }
}

// MARK: - add sheet

private struct PoolAddSheet: View {
    @Environment(ThemeStore.self) private var theme

    let eligible: [Subscription]
    let hasAny: Bool
    let onClose: () -> Void
    let onAdd: (Subscription, String) -> Void

    @State private var contentHeight: CGFloat = 0

    var body: some View {
        let c = theme.colors
        ZStack(alignment: .bottom) {
            c.scrim
                .contentShape(Rectangle())
                .onTapGesture { onClose() }

            VStack(alignment: .leading, spacing: 0) {
                rnRect(2)
                    .fill(c.line2)
                    .frame(width: 38, height: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 10)

                HStack(alignment: .center, spacing: 0) {
                    Text("Add a subscription")
                        .font(.ezer(FontFamily.bold, 16.5))
                        .foregroundStyle(c.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    SavingsPressable(hitSlop: 6, action: onClose) {
                        Ionicon("close", size: 17, color: c.ink)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(c.bg2))
                            .overlay(Circle().strokeBorder(c.line, lineWidth: 1))
                    }
                }
                .frame(height: 38)

                BodyText("Each charge also moves money into Subscription savings. Stop any time; what\u{2019}s saved stays.")
                    .padding(.top, 4)
                    .padding(.bottom, 14)

                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(eligible) { s in row(s, c) }
                        if eligible.isEmpty {
                            BodyText(hasAny ? "Every subscription is already saving." : "No subscriptions found yet.")
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(16)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }
                .scrollIndicators(.hidden)
                .frame(height: min(contentHeight, 420))
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 34)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rnRect(topLeading: 28, topTrailing: 28).fill(c.card))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }

    private func row(_ s: Subscription, _ c: ThemeColors) -> some View {
        let price: Double? = (s.amountCents ?? 0) > 0 ? Double(s.amountCents ?? 0) / 100 : nil
        let next = poolMonthDay(s.renewalDate)
        let meta = [price.map { "\(poolMoney($0))/mo" }, next.map { "next \($0)" }].compactMap { $0 }.joined(separator: " · ")
        return HStack(alignment: .center, spacing: 12) {
            MerchantMark(name: s.merchantName, merchantId: s.merchantId, size: 38, logoUrl: s.logo)
            VStack(alignment: .leading, spacing: 2) {
                Text(s.merchantName)
                    .font(.ezer(FontFamily.bold, 13.5)).foregroundStyle(c.ink).lineLimit(1)
                if !meta.isEmpty {
                    Text(meta).font(.ezer(FontFamily.regular, 11)).foregroundStyle(c.mut2).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            choice("Half", price.map { "+" + poolMoney(poolPer($0, "HALF")) }, fg: c.gold, bg: c.goldSoft) { onAdd(s, "HALF") }
            choice("Match", price.map { "+" + poolMoney($0) }, fg: c.accInk, bg: c.accSoft) { onAdd(s, "MATCH") }
        }
        .padding(12 + 1)
        .background(rnRect(16).fill(c.bg2))
        .overlay(rnRect(16).strokeBorder(c.line, lineWidth: 1))
    }

    private func choice(_ label: String, _ amount: String?, fg: Color, bg: Color, _ action: @escaping () -> Void) -> some View {
        SavingsPressable(action: action) {
            VStack(spacing: 0) {
                Text(label).font(.ezer(FontFamily.bold, 10.5)).foregroundStyle(fg)
                if let amount {
                    Text(amount).font(.ezer(FontFamily.regular, 10)).foregroundStyle(fg).lineLimit(1)
                }
            }
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .background(rnRect(11).fill(bg))
            .fixedSize()
        }
    }
}

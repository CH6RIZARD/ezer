// Port of apps/mobile/app/screens/SubscriptionDetail.tsx
//
// EZER Redesign — Subscription Detail (handoff §6)
//
// Opened from Home list rows, the day popover, Wallet breakdown rows and the Alerts Manage/Act
// buttons.
//
// Structure is a port of the prototype's SUB DETAIL screen, in order:
//   top bar ("Subscription")
//   centred hero    — 64px logo, name, serif price "/ month", status pill
//   meta card       — Next charge / Paid this year / Card
//   Charge history  — title INSIDE the card, rows split by hairlines
//   How you're getting charged — purple gradient card + SVG price chart + chips
//   Smart payment options — icon-tile radio rows -> Enable -> green banner
//   Save smart      — gold toggle -> 6/12/24-month projections (PURPLE tiles)
//   Lifetime cost   — serif 36px red total
//   Cancel CTA      — red button; on tap it ALSO opens the merchant's real cancellation page,
//                     then turns green
//
// RN borders take layout space (Yoga); the `.padding(1)` / `.padding(2)` next to each bordered
// box below is that border, so the content sits where it does in RN.

import SwiftUI

/**
 * Real price histories called out in the handoff. Anything not listed is flat, which renders the
 * "No price changes — steady at $X" chip.
 */
private let PRICE_HISTORY: [String: [Int]] = [
    "netflix": [1099, 1099, 1299, 1299, 1549, 1549],
    "youtube": [1199, 1199, 1199, 1399, 1399, 1399],
    "fitpass": [2900, 2900, 2900, 3400, 3400, 3400],
]

private func monthLabels(_ n: Int) -> [String] {
    var out: [String] = []
    let now = jsParts(Date())
    for i in stride(from: n - 1, through: 0, by: -1) {
        // new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleDateString('en-US', { month: 'short' })
        out.append(WalletDateFormat.shortMonth(jsDate(now.year, now.month - i, 1)))
    }
    return out
}

private struct WalletPayOption {
    /// 'half' | 'full'
    let key: String
    let title: String
    let sub: String
    let icon: String
    let tileBg: Color
    let tileFg: Color
}

/// RN `flexDirection: 'row', flexWrap: 'wrap', gap` — children at their own size, wrapped into
/// lines `spacing` apart in both directions. (`SwiftUI.Layout`: inside this module `Layout` is the
/// constants enum.)
private struct WalletFlowLayout: SwiftUI.Layout {
    var spacing: CGFloat

    private func lines(_ maxW: CGFloat, _ sizes: [CGSize]) -> [[Int]] {
        var out: [[Int]] = []
        var cur: [Int] = []
        var w: CGFloat = 0
        for (i, s) in sizes.enumerated() {
            let add = cur.isEmpty ? s.width : w + spacing + s.width
            if !cur.isEmpty && add > maxW {
                out.append(cur)
                cur = [i]
                w = s.width
            } else {
                cur.append(i)
                w = add
            }
        }
        if !cur.isEmpty { out.append(cur) }
        return out
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let maxW = proposal.width ?? .infinity
        let ls = lines(maxW, sizes)
        var h: CGFloat = 0
        var widest: CGFloat = 0
        for (n, l) in ls.enumerated() {
            let lh = l.map { sizes[$0].height }.max() ?? 0
            let lw = l.map { sizes[$0].width }.reduce(0, +) + spacing * CGFloat(max(0, l.count - 1))
            widest = max(widest, lw)
            h += lh + (n > 0 ? spacing : 0)
        }
        return CGSize(width: maxW.isFinite ? maxW : widest, height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let ls = lines(bounds.width, sizes)
        var y = bounds.minY
        for l in ls {
            let lh = l.map { sizes[$0].height }.max() ?? 0
            var x = bounds.minX
            for i in l {
                subviews[i].place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(sizes[i]))
                x += sizes[i].width + spacing
            }
            y += lh + spacing
        }
    }
}

struct SubscriptionDetailView: View {
    let id: String?

    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win

    /// null | 'half' | 'full'
    @State private var payOpt: String?
    @State private var smartEnabled = false
    @State private var smartBusy = false
    @State private var smartError: String?
    @State private var saveSmart = false
    /// 6 | 12 | 24
    @State private var ssMonths = 12
    @State private var cancelStarted = false
    /** Only set when the destination was a guess, so the copy stays honest. */
    @State private var cancelNote: String?
    /** True while auto-discovery is probing — keeps the CTA from double-firing. */
    @State private var cancelBusy = false

    // GET /subscriptions/:id returns everything this screen needs in one call — the subscription,
    // its merchant, the full charge history, price history and lifetime cost — all derived from
    // Plaid-synced transactions. Falling back to an unrelated subscription is never right:
    // showing the wrong merchant's price, renewal and cancel button is worse than showing nothing.
    @State private var detail: SubscriptionDetail?
    @State private var loading = true
    /// RN's effect ran once per `params.id`. `.task` also restarts when the screen re-appears
    /// (e.g. after a cover), so a finished load for the same id is not repeated.
    @State private var fetched = false
    @State private var fetchedId: String?

    init(id: String?) {
        self.id = id
    }

    var body: some View {
        let colors = theme.colors
        Group {
            if loading {
                ZStack {
                    colors.bg.ignoresSafeArea()
                    DoveLoader()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let sub = detail {
                content(sub, colors)
            } else {
                notFound(colors)
            }
        }
        .rnScreen()
        .task(id: id) { await load() }
    }

    // MARK: - Load

    private func load() async {
        if fetched && fetchedId == id { return }
        guard let id, !id.isEmpty else {
            loading = false
            fetched = true
            fetchedId = self.id
            return
        }
        loading = true
        do {
            let d = try await api.subscriptionDetail(id: id)
            if Task.isCancelled { return }
            detail = d
        } catch {
            // A 404 here is a real answer: that subscription is not this user's.
            if Task.isCancelled { return }
            detail = nil
        }
        if !Task.isCancelled {
            loading = false
            fetched = true
            fetchedId = id
        }
    }

    // MARK: - States

    private func backButton(_ colors: ThemeColors) -> some View {
        Ionicon("chevron-back", size: 18, color: colors.ink)
            .frame(width: 38, height: 38)
            .background(Circle().fill(colors.card))
            .overlay(Circle().strokeBorder(colors.line, lineWidth: 1))
    }

    private func notFound(_ colors: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // In RN's column this PressScale stretches across the row (alignItems stretch).
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                backButton(colors)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }

            VStack(alignment: .center, spacing: 10) {
                Ionicon("help-circle-outline", size: 40, color: colors.mut2)
                Text("We couldn't find that subscription")
                    .typeStyle(TypeScale.sectionHeader)
                    .foregroundStyle(colors.ink)
                    .multilineTextAlignment(.center)
                BodyText("It may have been cancelled or removed. Go back and pick it again.")
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.top, insets.top + 10)
        .padding(.horizontal, Layout.screenX)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(colors.bg.ignoresSafeArea())
    }

    // MARK: - Content

    private func content(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    topBar(colors)
                    hero(sub, colors)
                    metaCard(sub, colors)
                    historyCard(sub, colors)
                    chartCard(sub, colors)
                    smartCard(sub, colors)
                    saveSmartCard(sub, colors)
                    lifetimeCard(sub, colors)
                    cancelCTA(sub, colors)
                    if let note = cancelNote, !note.isEmpty {
                        BodyText(note)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 8)
                    }
                }
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            // RN bounces={false} overScrollMode="never".
            .rnNoBounce()
        }
        .scrollIndicators(.hidden)
        .background(colors.bg.ignoresSafeArea())
    }

    // MARK: - Derived values (computed per render, as in RN)

    // The card each charge landed on travels WITH the charge, so the header can name the real one
    // instead of guessing at a default instrument.
    private func card(_ sub: SubscriptionDetail) -> ChargeFundingInstrument? {
        sub.charges.first?.fundingInstrument
    }

    private func charges(_ sub: SubscriptionDetail) -> [SubscriptionDetailCharge] {
        let t: (SubscriptionDetailCharge) -> Double = { c in
            parseISODate(c.chargeTimestamp)?.timeIntervalSince1970 ?? -Double.infinity
        }
        return Array(sub.charges.sorted { t($0) > t($1) }.prefix(6))
    }

    private func priceCents(_ sub: SubscriptionDetail) -> Int {
        charges(sub).first?.amountCents ?? 0
    }

    private func halfCents(_ sub: SubscriptionDetail) -> Int {
        Int(jsRound(Double(priceCents(sub)) / 2))
    }

    // MARK: - Sections

    private func topBar(_ colors: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                backButton(colors)
            }
            Text("Subscription")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(colors.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
        }
    }

    private func heroPriceRow(_ price: Int, _ colors: ThemeColors) -> Text {
        let amount: Text = Text(formatCents(price))
            .font(.custom(FontFamily.serif, size: 20))
            .foregroundStyle(colors.ink)
        let rest: Text = Text(" / month")
            .font(.custom(FontFamily.regular, size: 15))
            .foregroundStyle(colors.mut)
        return amount + rest
    }

    private func hero(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let name = sub.merchantName
        let trial = sub.status == "trial"
        return VStack(alignment: .center, spacing: 8) {
            MerchantMark(name: name, merchantId: sub.merchantId, size: 64)
            Text(name)
                .font(.custom(FontFamily.bold, size: 24))
                .tracking(-0.5)
                .foregroundStyle(colors.ink)
                .multilineTextAlignment(.center)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            heroPriceRow(priceCents(sub), colors)
                .lineLimit(1)
            Text(trial ? "FREE TRIAL" : "ACTIVE")
                .font(.custom(FontFamily.bold, size: 11))
                .tracking(0.6)
                .foregroundStyle(colors.gold)
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
                .background(rnRect(14).fill(colors.goldSoft))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 18)
        .padding(.bottom, 22)
    }

    private func metaRow(_ key: String, _ value: String, _ valueColor: Color) -> some View {
        // row, center, space-between, gap 12, paddingVertical 14
        HStack(alignment: .center, spacing: 0) {
            BodyText(key).fixedSize()
            Spacer(minLength: 12)
            Text(value)
                .font(.custom(FontFamily.bold, size: 13.5))
                .foregroundStyle(valueColor)
                .lineLimit(1)
                .multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 14)
    }

    private func metaCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let nextCharge: String = {
            guard let r = sub.renewalDate, !r.isEmpty else { return "—" }
            return parseISODate(r).map { WalletDateFormat.longMonthDay($0) } ?? "Invalid Date"
        }()
        let ytdCents = charges(sub)
            .filter { c in
                guard let d = parseISODate(c.chargeTimestamp) else { return false }
                return jsParts(d).year == jsParts(Date()).year
            }
            .reduce(0) { $0 + $1.amountCents }
        let cardText: String = card(sub).map { "\($0.displayName) ···· \($0.last4)" } ?? "—"

        return Surface {
            VStack(alignment: .leading, spacing: 0) {
                metaRow("Next charge", nextCharge, colors.ink)
                Rectangle().fill(colors.line).frame(height: 1)
                metaRow("Paid this year", formatCents(ytdCents), colors.red)
                Rectangle().fill(colors.line).frame(height: 1)
                metaRow("Card", cardText, colors.ink)
            }
            .padding(.horizontal, 16)
            .padding(1)
        }
        .padding(.bottom, 18)
    }

    private func historyCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        Surface {
            VStack(alignment: .leading, spacing: 0) {
                Text("Charge history")
                    .font(.custom(FontFamily.bold, size: 16))
                    .foregroundStyle(colors.ink)
                    .padding(.top, 12)
                    .padding(.bottom, 4)
                ForEach(charges(sub)) { c in
                    HStack(alignment: .center, spacing: 0) {
                        VStack(alignment: .leading, spacing: 0) {
                            Text(parseISODate(c.chargeTimestamp).map { formatDate($0) } ?? "Invalid Date")
                                .font(.custom(FontFamily.semibold, size: 13.5))
                                .foregroundStyle(colors.ink)
                                .lineLimit(1)
                            Text("Monthly")
                                .font(.custom(FontFamily.regular, size: 11.5))
                                .foregroundStyle(colors.mut)
                                .padding(.top, 1)
                        }
                        .padding(.trailing, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(formatCents(c.amountCents))
                                .font(.custom(FontFamily.bold, size: 13.5))
                                .foregroundStyle(colors.red)
                            Text(c.fundingInstrument.map { $0.last4.isEmpty ? "" : "•\($0.last4)" } ?? "")
                                .font(.custom(FontFamily.regular, size: 11))
                                .foregroundStyle(colors.mut)
                                .padding(.top, 1)
                        }
                    }
                    .padding(.vertical, 11)
                    // borderTopWidth 1: the hairline takes layout space above the row.
                    .padding(.top, 1)
                    .overlay(alignment: .top) {
                        Rectangle().fill(colors.line).frame(height: 1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.bottom, 2)
            .padding(1)
        }
        .padding(.bottom, 16)
    }

    private func chartCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let price = priceCents(sub)
        // --- price history -------------------------------------------------------------------
        let history = PRICE_HISTORY[sub.merchantId]
        let labels = monthLabels(6)
        let series: [Int] = history ?? Array(repeating: price, count: 6)
        let points: [PricePoint] = series.enumerated().map { PricePoint(label: labels[$0.offset], cents: $0.element) }

        // One chip per price change in the last four months, exactly as the prototype builds
        // them; a flat history falls back to the "steady at" chip so the row is never empty.
        var chips: [String] = []
        if series.count > 1 {
            for i in 1..<series.count {
                let change = series[i] - series[i - 1]
                if change != 0 && i >= series.count - 4 {
                    chips.append("\(change > 0 ? "↑" : "↓") \(formatCents(abs(change))) since \(labels[i - 1])")
                }
            }
        }
        if chips.isEmpty { chips.append("No price changes — steady at \(formatCents(price))") }

        /** Card is 18px-padded inside the 20px screen gutters. */
        let chartW = win.width - Layout.screenX * 2 - 36

        return VStack(alignment: .leading, spacing: 0) {
            Text("How you're getting charged")
                .font(.custom(FontFamily.bold, size: 16))
                .foregroundStyle(Color(css: "#FFFFFF"))
            Text("\(sub.merchantName) · price over time")
                .font(.custom(FontFamily.regular, size: 12))
                .foregroundStyle(Color(css: ChartColors.subtext))
                .lineLimit(1)
                .padding(.top, 2)
                .padding(.bottom, 14)

            PriceChart(points: points, width: chartW)

            WalletFlowLayout(spacing: 7) {
                ForEach(chips, id: \.self) { txt in
                    Text(txt)
                        .font(.custom(FontFamily.bold, size: 11.5))
                        .foregroundStyle(Color(css: ChartColors.line))
                        .padding(.horizontal, 11)
                        .padding(.vertical, 5)
                        .background(rnRect(Radius.chip).fill(Color(css: ChartColors.chipBg)))
                }
            }
            .padding(.top, 12)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            rnRect(Radius.cardLg).fill(
                LinearGradient.rn(Gradients.chartCard, start: UnitPoint(x: 0.1, y: 0), end: UnitPoint(x: 0.9, y: 1))
            )
        )
        .padding(.bottom, 16)
    }

    private func payOptions(_ price: Int, _ half: Int, _ colors: ThemeColors) -> [WalletPayOption] {
        [
            WalletPayOption(
                key: "half",
                title: "Pay full + save half",
                sub: "Pay \(formatCents(price)) + auto-save \(formatCents(half)) · \(formatCents(price + half)) total/mo",
                icon: "logo-usd",
                tileBg: colors.goldSoft,
                tileFg: colors.gold
            ),
            WalletPayOption(
                key: "full",
                title: "Pay full + match full",
                sub: "Pay \(formatCents(price)) + match \(formatCents(price)) into investing · \(formatCents(price * 2)) total/mo",
                icon: "trending-up",
                tileBg: colors.accSoft,
                tileFg: colors.accInk
            ),
        ]
    }

    private func banner(_ text: String, center: Bool, _ colors: ThemeColors) -> some View {
        Text(text)
            .font(.custom(FontFamily.semibold, size: 12.5))
            .foregroundStyle(colors.success)
            .multilineTextAlignment(center ? .center : .leading)
            .rnLineHeight(18, family: FontFamily.semibold, size: 12.5)
            .frame(maxWidth: .infinity, alignment: center ? .center : .leading)
            .padding(.vertical, 12)
            .padding(.horizontal, 14)
            .background(rnRect(13).fill(colors.successBg))
    }

    private func payOptionRow(_ opt: WalletPayOption, _ colors: ThemeColors) -> some View {
        let on = payOpt == opt.key
        return PressScale(scaleTo: 0.98, action: {
            payOpt = opt.key
            smartEnabled = false
        }) {
            HStack(alignment: .center, spacing: 12) {
                Ionicon(opt.icon, size: 19, color: opt.tileFg)
                    .frame(width: 38, height: 38)
                    .background(rnRect(Radius.chip).fill(opt.tileBg))
                VStack(alignment: .leading, spacing: 0) {
                    Text(opt.title)
                        .font(.custom(FontFamily.bold, size: 14.5))
                        .foregroundStyle(colors.ink)
                    Text(opt.sub)
                        .font(.custom(FontFamily.regular, size: 12))
                        .foregroundStyle(colors.mut)
                        .rnLineHeight(17.4, family: FontFamily.regular, size: 12)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                // radio: 22x22 r11, 2px goldLine border; dot 11x11 (r6 clamps to a circle).
                Circle()
                    .fill(on ? colors.gold : Color.clear)
                    .frame(width: 11, height: 11)
                    .frame(width: 22, height: 22)
                    .overlay(Circle().strokeBorder(colors.goldLine, lineWidth: 2))
            }
            .padding(14)
            .padding(2)
            .background(rnRect(Radius.buttonSm).fill(on ? colors.goldSoft : Color.clear))
            .overlay(rnRect(Radius.buttonSm).strokeBorder(on ? colors.gold : colors.line, lineWidth: 2))
        }
        .padding(.bottom, 10)
    }

    private func smartCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let price = priceCents(sub)
        let half = halfCents(sub)
        return Surface(radius: Radius.cardLg) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Smart payment options")
                    .font(.custom(FontFamily.bold, size: 16))
                    .foregroundStyle(colors.ink)
                Text("Pay in full · automate the difference")
                    .font(.custom(FontFamily.regular, size: 12))
                    .foregroundStyle(colors.mut)
                    .padding(.top, 2)
                    .padding(.bottom, 14)

                ForEach(payOptions(price, half, colors), id: \.key) { opt in
                    payOptionRow(opt, colors)
                }

                if payOpt != nil && !smartEnabled {
                    PressScale(scaleTo: 0.98, disabled: smartBusy, action: {
                        Task { await enableSmartSaving(sub.merchantName, price, half) }
                    }) {
                        Group {
                            Group {
                                Text("Enable smart saving")
                                    .font(.custom(FontFamily.bold, size: 14))
                                    .foregroundStyle(Color(css: "#FFFFFF"))
                            }
                            .cameraDove(smartBusy)
                            .opacity(smartBusy ? 0.6 : 1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(rnRect(Radius.buttonSm).fill(colors.accent))
                    }
                }
                if let err = smartError, !smartEnabled {
                    Text(err)
                        .font(.custom(FontFamily.regular, size: 12))
                        .foregroundStyle(colors.red)
                        .rnLineHeight(17.4, family: FontFamily.regular, size: 12)
                        .padding(.top, 8)
                }

                if smartEnabled {
                    banner(
                        "✓ Smart saving on — each cycle pays \(formatCents(price)) and moves \(formatCents(payOpt == "full" ? price : half)) to your \(payOpt == "full" ? "investments" : "savings") automatically.",
                        center: false,
                        colors
                    )
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .padding(1)
        }
        .padding(.bottom, 16)
    }

    private func ssLead(_ price: Int, _ colors: ThemeColors) -> Text {
        let a: Text = Text("With ")
        let b: Text = Text(formatCents(price)).font(.custom(FontFamily.serif, size: 15))
        let c: Text = Text("/mo automatically saved:")
        return (a + b + c)
            .font(.custom(FontFamily.semibold, size: 13))
            .foregroundStyle(colors.ink)
    }

    private func projTile(_ m: Int, _ price: Int, _ colors: ThemeColors) -> some View {
        let on = ssMonths == m
        // The layout style MUST sit on PressScale — it lands on the Pressable. On the inner View
        // the tiles collapse to a one-letter-per-line column.
        return PressScale(scaleTo: 0.96, action: { ssMonths = m }) {
            VStack(alignment: .center, spacing: 4) {
                Text(m == 6 ? "After 6 months" : m == 12 ? "After 1 year" : "After 2 years")
                    .font(.custom(FontFamily.regular, size: 10.5))
                    .foregroundStyle(colors.mut)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(formatCents(price * m))
                    .font(.custom(FontFamily.serif, size: 16))
                    .foregroundStyle(colors.accInk)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .padding(.vertical, 13)
            .padding(.horizontal, 4)
            .padding(2)
            .frame(maxWidth: .infinity)
            .background(rnRect(13).fill(on ? colors.accSoft : Color.clear))
            .overlay(rnRect(13).strokeBorder(on ? colors.accInk : colors.line, lineWidth: 2))
        }
        .frame(maxWidth: .infinity)
    }

    private func saveSmartCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let price = priceCents(sub)
        let projection = price * ssMonths
        return Surface(radius: Radius.cardLg) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Save smart")
                            .font(.custom(FontFamily.bold, size: 16))
                            .foregroundStyle(colors.ink)
                        Text("See how your savings would grow")
                            .font(.custom(FontFamily.regular, size: 12))
                            .foregroundStyle(colors.mut)
                            .padding(.top, 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Prototype track is solid `--gold` when on (#A87D2F light, #D6B36F dark) with a
                    // white knob. `goldBg` is muddy in dark (#8F6B29) and read as a different gold.
                    RNSwitch(
                        isOn: $saveSmart,
                        trackColorFalse: colors.line2,
                        trackColorTrue: colors.gold,
                        thumbColor: Color(css: "#FFFFFF"),
                        iosBackgroundColor: colors.line2
                    )
                    .fixedSize()
                }

                if saveSmart {
                    ssLead(price, colors)
                        .padding(.top, 14)
                        .padding(.bottom, 10)

                    HStack(alignment: .top, spacing: 8) {
                        ForEach([6, 12, 24], id: \.self) { m in
                            projTile(m, price, colors)
                        }
                    }
                    .padding(.bottom, 12)

                    banner("That's \(formatCents(projection)) saved without changing your lifestyle", center: true, colors)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .padding(1)
        }
        .padding(.bottom, 16)
    }

    private func lifetimeCard(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let lifetimeCents = charges(sub).reduce(0) { $0 + $1.amountCents }
        return Surface(radius: Radius.cardLg) {
            VStack(alignment: .leading, spacing: 0) {
                BodyText("This has cost you more than")
                    .padding(.bottom, 4)
                // typeScale.totalValueSm with letterSpacing -0.5
                Text(formatCents(lifetimeCents))
                    .font(.custom(TypeScale.totalValueSm.family, size: TypeScale.totalValueSm.size))
                    .tracking(-0.5)
                    .foregroundStyle(colors.red)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .padding(1)
        }
        .padding(.bottom, 16)
    }

    private func cancelCTA(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        PressScale(scaleTo: 0.98, disabled: cancelBusy, action: {
            Task { await onCancel(sub) }
        }) {
            Text(
                cancelBusy
                    ? "Finding cancellation page…"
                    : cancelStarted
                        ? "Cancellation started ✓ — choose where the money goes"
                        : "Cancel & choose where to send the money"
            )
            .font(.custom(FontFamily.bold, size: 14.5))
            .foregroundStyle(Color(css: "#FFFFFF"))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .padding(.horizontal, 14)
            .background(rnRect(16).fill(cancelStarted ? colors.success : colors.red))
            .opacity(cancelBusy ? 0.7 : 1)
        }
    }

    // MARK: - Actions

    // --- cancel -----------------------------------------------------------------------------
    // Flipping local state is not enough: the user asked to land on the service's real
    // cancellation page. `cancellationUrl` on the merchant record wins over the curated table
    // inside resolveCancellationUrl.
    private func onCancel(_ sub: SubscriptionDetail) async {
        if cancelBusy { return }
        let name = sub.merchantName

        // Fast path: a record URL or a curated one resolves with no network, so merchants whose
        // record has a cancellationUrl from the API open instantly.
        if let quick = resolveCancellationUrlSync(name, sub.merchantId, sub.cancellationUrl) {
            cancelStarted = true
            cancelNote = nil
            Task { _ = await openCancellation(quick) }
            return
        }

        // Slow path: auto-discovery probes the merchant's domain for the page cancellation
        // actually lives behind, so it needs a pending state.
        cancelBusy = true
        defer { cancelBusy = false }
        let target = await resolveCancellationUrl(name, sub.merchantId, sub.cancellationUrl, sub.website)
        cancelStarted = target.source != "unknown"
        // 'unknown' gets no note here — openCancellation already shows an honest alert in that
        // case, so this stays quiet instead of doubling up.
        cancelNote = target.source == "homepage"
            ? "We couldn't confirm the exact cancellation page — opening \(name)'s site instead. \(appStoreFallbackHint())"
            : nil
        _ = await openCancellation(target)
    }

    // "Enable smart saving" makes it real: a goal for this subscription that auto-saves the chosen
    // amount every month (FIXED/MONTHLY on the server's sweep). Re-enabling reuses the same goal
    // rather than stacking duplicates.
    private func enableSmartSaving(_ name: String, _ price: Int, _ half: Int) async {
        guard let opt = self.payOpt, !smartBusy else { return }
        let smartGoalName = "\(name) savings"
        let monthlyCents = opt == "full" ? price : half
        if savings.goals.contains(where: { $0.name == smartGoalName }) {
            smartEnabled = true
            return
        }
        smartBusy = true
        smartError = nil
        let res = await savings.addGoal(
            NewGoalInput(
                name: smartGoalName,
                // A year of saving is the target; the goal keeps going if they want more.
                targetAmount: Double(monthlyCents * 12) / 100,
                autoSave: true,
                monthlyAmount: Double(monthlyCents) / 100
            )
        )
        smartBusy = false
        if res.ok {
            smartEnabled = true
        } else {
            smartError = res.error ?? "Could not set up smart saving."
        }
    }
}

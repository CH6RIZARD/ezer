// Port of apps/mobile/app/(tabs)/home.tsx
//
// =============================================================================
// EZER Redesign — Home / dashboard (handoff §1)
//
// Header row (gear · greeting + "Your Dashboard" · EZER wordmark), a 2x2 stat
// grid where ALL FOUR tiles are pressable, the Pay in 4 banner, a Calendar/List
// segmented toggle, and the hero calendar whose days open the §2 popover.
//
// Data comes from DataStore, so the dashboard totals always agree with the
// detail screens.
// =============================================================================
//
// The header's EZER is Primitives' TabMark (`.tabMark()` on the scroll content), locked in the same
// place and size as on every other tab; the header's right slot is an empty 72 that keeps the title
// centred.
//
// RN borders take layout space (Yoga puts children inside border + padding) while rnBox/Surface
// only draw theirs, so every padded box with a border pads by `padding + borderWidth` here.

import SwiftUI

private let WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]

/** Handoff: spending power is a fixed $400 in the prototype. (Unused: the tile is derived.) */
private let SPENDING_POWER_CENTS = 40000

private func greeting() -> String {
    let h = Calendar.current.component(.hour, from: Date())
    if h < 12 { return "Good Morning ✳" }
    if h < 18 { return "Good Afternoon ✳" }
    return "Good Evening ✳"
}

private let EMPTY_MARKS: [HomeDayMark] = []

/// toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) -> "October 2026"
private let homeMonthTitleFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMMyyyy")
    return f
}()

/// toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) -> "Oct 15"
private let homeShortDayFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMd")
    return f
}()

private enum HomeViewMode { case calendar, list }

private struct HomeStatTile {
    let key: String
    let icon: String
    let tint: Color
    let value: String
    let label: String
    let sub: String
    let onPress: () -> Void
}

private struct HomeSpendingPower {
    let value: String
    let label: String
    let icon: String
    let isAmount: Bool
    let pulse: Bool
    let onPress: () -> Void
}

private struct HomeTopTicket {
    let id: String
    let merchantId: String
    let name: String
    let logo: String?
    let cents: Int
}

private struct HomeCellData {
    let day: Int
    let isToday: Bool
    let totalCents: Int
    let marks: [HomeDayMark]
}

struct HomeView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.isScreenFocused) private var focused

    @State private var connectBank = ConnectBank()
    @State private var cardFlow = HomeCardFlowStatus()

    @State private var view: HomeViewMode = .calendar
    @State private var monthOffset = 0
    @State private var popDate: Date?

    var body: some View {
        let colors = theme.colors

        ZStack {
            ScrollView(.vertical) {
                ScreenBody {
                    VStack(alignment: .leading, spacing: 0) {
                        header(colors)
                        grid(colors)
                            .padding(.top, 18)
                        payIn4Banner()
                            .padding(.top, 12)
                        segment(colors)
                            .padding(.top, 18)
                        if view == .calendar {
                            calendar(colors)
                                .padding(.top, 14)
                        } else {
                            list(colors)
                                .padding(.top, 14)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.top, insets.top + 10)
                .padding(.horizontal, Layout.screenX)
                // Every other screen adds insets.bottom on top of the fixed
                // contentBottom constant (Wallet, Settings, ...) — this one
                // didn't, so on a device with a real gesture-nav inset the last
                // row in List view sat behind the floating tab bar instead of
                // above it.
                .padding(.bottom, insets.bottom + Layout.tabBottom)
                .rnNoBounce()
                .tabMark()
            }
            .scrollIndicators(.hidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colors.bg)
        .rnScreen()
        .background {
            DayPopover(
                visible: popDate != nil,
                date: popDate,
                events: eventsFor(popDate),
                onClose: { popDate = nil },
                onSelect: { e in openSub(e.subscriptionId) }
            )
        }
        .premiumGate()
        // useCardFlowStatus(): useEffect(refresh, [refresh]) + useFocusEffect(refresh)
        .onAppear { cardFlow.mounted() }
        .onDisappear { cardFlow.unmounted() }
        .onChange(of: focused, initial: true) { _, f in cardFlow.focusChanged(f) }
    }

    // MARK: - calendar model

    /// new Date(); d.setDate(1); d.setMonth(d.getMonth() + monthOffset)
    private var month: (year: Int, month: Int) {
        let now = jsParts(Date())
        let d = jsParts(jsDate(now.year, now.month + monthOffset, 1))
        return (d.year, d.month)
    }

    /**
     * Events for the month ON SCREEN, projected from each subscription's
     * recurrence rule — not read out of the 30-day risk window.
     *
     * Reading from `risks` meant a monthly subscription appeared exactly once and
     * every other month was blank, which is not what a calendar is for.
     */
    private func byDay(_ m: (year: Int, month: Int)) -> [String: [HomeDayEvent]] {
        let events = projectMonthEvents(data.subscriptions, data.risks, year: m.year, month: m.month)
        let grouped = groupEventsByDay(events)

        var map: [String: [HomeDayEvent]] = [:]
        for (day, list) in grouped {
            let key = "\(m.year)-\(m.month)-\(day)"
            map[key] = list.map { e in
                HomeDayEvent(
                    id: e.id,
                    merchantId: e.merchantId,
                    subscriptionId: e.subscriptionId,
                    merchantName: e.merchantName,
                    amountCents: e.amountCents,
                    type: e.type,
                    afterTrialCents: e.afterTrialCents,
                    logo: e.logo
                )
            }
        }
        return map
    }

    private func cells(_ m: (year: Int, month: Int)) -> [Date?] {
        let first = jsDate(m.year, m.month, 1)
        let daysInMonth = jsParts(jsDate(m.year, m.month + 1, 0)).day
        let lead = Calendar.current.component(.weekday, from: first) - 1 // getDay(): 0 = Sunday
        var out: [Date?] = []
        for _ in 0..<lead { out.append(nil) }
        for d in 1...daysInMonth {
            out.append(jsDate(m.year, m.month, d))
        }
        while out.count % 7 != 0 { out.append(nil) }
        return out
    }

    private func eventsFor(_ d: Date?) -> [HomeDayEvent] {
        guard let d else { return [] }
        let p = jsParts(d)
        return byDay((p.year, p.month))["\(p.year)-\(p.month)-\(p.day)"] ?? []
    }

    private func openDay(_ day: Int) {
        let m = month
        popDate = jsDate(m.year, m.month, day)
    }

    private func openSub(_ subscriptionId: String) {
        popDate = nil
        router.push("/screens/SubscriptionDetail", ["id": subscriptionId])
    }

    // MARK: - stat tiles

    // Top-left  : Monthly Burn, with 30-day risk folded in as its subline
    // Top-right : Current Savings — total across every goal
    // Bottom-L  : rotating panel (connect bank <-> physical card CTA <-> top ticket) — rendered
    //             separately below, since it is not a plain stat tile
    // Bottom-R  : Spending Power -> Pay in 4 (unchanged)
    private func tiles(_ colors: ThemeColors) -> [HomeStatTile] {
        let goals = savings.goals
        let savingsTotalCents = Int(jsRound(goals.reduce(0.0) { $0 + $1.currentAmount } * 100))
        let riskCents = data.homeSummary?.next30DayRisk ?? 0

        return [
            HomeStatTile(
                key: "burn",
                icon: "warning-outline",
                tint: colors.red,
                value: formatCents(data.homeSummary?.monthlyBurnRate ?? 0),
                label: "Monthly Burn",
                // 30-day risk now lives here instead of its own tile.
                sub: "\(formatCents(riskCents)) at risk · 30d",
                onPress: { view = .list }
            ),
            HomeStatTile(
                key: "savings",
                icon: "wallet-outline",
                tint: colors.success,
                value: formatCents(savingsTotalCents),
                label: "Current Savings",
                sub: "\(goals.count) goal\(goals.count == 1 ? "" : "s")",
                onPress: { router.push("/(tabs)/savings") }
            ),
        ]
    }

    /**
     * Monthly cost of each merchant's most recent charge. Ranking "Top ticket" off
     * the upcoming-risk list alone was wrong: a subscription that simply has no
     * renewal inside the 30-day window read as $0 and sorted last. The real price
     * is the latest charge, normalised to a monthly figure.
     */
    private var monthlyByMerchant: [String: Int] {
        // NB: utils/calculations#getMonthlyEquivalent returns DOLLARS, so it is not
        // usable here — everything on this screen is cents.
        func perMonthCents(_ cents: Int, _ cadence: String) -> Int {
            if cadence == "yearly" { return Int(jsRound(Double(cents) / 12)) }
            if cadence == "weekly" { return Int(jsRound(Double(cents * 52) / 12)) }
            return cents
        }

        // Priced from the user's OWN subscriptions.
        var out: [String: Int] = [:]
        for s in data.subscriptions {
            guard let amount = s.amountCents, amount != 0 else { continue }
            out[s.merchantId] = perMonthCents(amount, s.cadence)
        }
        return out
    }

    /**
     * Spending power — derived, never a constant.
     *
     * This tile read a hardcoded $400, which claimed a Pay-in-4 limit for a user
     * who had linked no bank and been approved for nothing. What it shows now
     * depends on where the user actually is (approved -> the real limit; suspended -> "Paused";
     * not yet assessed -> an em dash).
     */
    private var spendingPower: HomeSpendingPower {
        let cardAccess = cardFlow.access
        // This tile opens the Pay in 4 tab with SpendingPowerSheet already up, not a
        // standalone screen and never Card Studio. `t` is a nonce, not a real param — tab
        // screens stay mounted across tab switches, so pushing the SAME params twice looked
        // identical to payin4's dedupe guard and only opened the sheet on the FIRST tap ever.
        // A fresh value on every tap makes each one a genuine change again.
        let nav = self.router
        let goToSpendingPower = {
            nav.push("/(tabs)/payin4", ["sheet": "spending", "t": String(Int(nowMs()))])
        }

        // Automated underwriting never leaves a real outcome at "review" or "no
        // limit" — `approved` with a real limitCents is the only terminal state
        // POST /cards/access-list can produce now.
        if cardAccess?.status == .approved, let limit = cardAccess?.limitCents, limit != 0 {
            return HomeSpendingPower(
                value: formatCents(limit),
                label: "Spending Power",
                icon: "cash-outline",
                isAmount: true,
                pulse: false,
                onPress: goToSpendingPower
            )
        }

        // An uncured missed Pay in 4 payment — installmentEngine.ts's "restrict
        // tightly" half. Distinct from "not yet assessed": this tile must say so
        // rather than showing the same blank dash a brand-new user sees.
        if cardAccess?.status == .suspended {
            return HomeSpendingPower(
                value: "Paused",
                label: "Spending Power",
                icon: "alert-circle-outline",
                isAmount: false,
                pulse: false,
                onPress: goToSpendingPower
            )
        }

        // Not yet assessed (never connected, or only joined the waitlist). An em
        // dash, not "Link a bank" — the rotating tile to its immediate left
        // already says "Connect your bank," so this tile stays in its stat form
        // and still says, truthfully, that there is no figure yet.
        return HomeSpendingPower(
            value: "—",
            label: "Spending Power",
            icon: "cash-outline",
            isAmount: true,
            pulse: true,
            onPress: goToSpendingPower
        )
    }

    /** Top three subscriptions by cost, for the "Top ticket" rotation. */
    private var topTicket: [HomeTopTicket] {
        // Fallback for live API data, where charge history is not on this screen:
        // the largest known amount the risk feed reports for that subscription.
        var riskBySub: [String: Int] = [:]
        for r in data.risks {
            let prev = riskBySub[r.subscriptionId] ?? 0
            if r.amountCents > prev { riskBySub[r.subscriptionId] = r.amountCents }
        }

        let monthly = monthlyByMerchant
        let items = data.subscriptions.enumerated().map { idx, s in
            (idx, HomeTopTicket(
                id: s.id,
                merchantId: s.merchantId,
                name: s.merchantName,
                logo: s.logo,
                cents: monthly[s.merchantId] ?? riskBySub[s.id] ?? 0
            ))
        }
        // Array.prototype.sort is stable: equal costs keep their list order.
        return items
            .filter { $0.1.cents > 0 }
            .sorted { a, b in a.1.cents != b.1.cents ? a.1.cents > b.1.cents : a.0 < b.0 }
            .prefix(3)
            .map { $0.1 }
    }

    // MARK: - header

    private func header(_ colors: ThemeColors) -> some View {
        // Row: alignItems 'center'. The margin pads the 42px gear to headerSide's 72.
        HStack(alignment: .center, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.push("/settings") }) {
                Ionicon("settings-outline", size: 18, color: colors.ink)
                    .frame(width: 42, height: 42)
                    .rnBox(bg: colors.card, radius: 21, border: colors.line)
            }
            .padding(.trailing, 30)

            // The centre block must be allowed to shrink, and both side slots
            // must reserve equal width — otherwise the 24px title and the
            // wordmark collide on narrow screens.
            VStack(alignment: .center, spacing: 0) {
                Text(verbatim: greeting())
                    .typeStyle(TypeScale.greeting)
                    .foregroundStyle(colors.mut)
                    .lineLimit(1)
                Text("Your Dashboard")
                    .typeStyle(TypeScale.dashTitle)
                    .foregroundStyle(colors.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity)

            // Keeps the title centred; the EZER here is TabMark, locked in the same place as on
            // the other tabs.
            Color.clear.frame(width: 72, height: 0)
        }
    }

    // MARK: - 2x2 grid

    private func grid(_ colors: ThemeColors) -> some View {
        let t = tiles(colors)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                ForEach(t, id: \.key) { tile in
                    statTile(tile, colors: colors)
                }
            }
            .fixedSize(horizontal: false, vertical: true)

            HStack(alignment: .top, spacing: 10) {
                // bottom-left: rotating panel of call-outs
                RotatingTile(slides: slides(colors))
                    .frame(maxWidth: .infinity, minHeight: 132, maxHeight: .infinity)

                // bottom-right: spending power — state-driven, never a fixed number
                spendingPowerTile(colors)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func statTile(_ t: HomeStatTile, colors: ThemeColors) -> some View {
        PressScale(action: t.onPress) {
            VStack(alignment: .center, spacing: 6) {
                Ionicon(t.icon, size: 22, color: t.tint)
                Text(verbatim: t.value)
                    .typeStyle(TypeScale.statValue)
                    .foregroundStyle(colors.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Label(t.label, lines: 1, shrink: true)
                if !t.sub.isEmpty {
                    Text(verbatim: t.sub)
                        .font(.custom(FontFamily.regular, size: 10.5))
                        .foregroundStyle(colors.mut2)
                        .multilineTextAlignment(.center)
                        .lineLimit(1)
                }
            }
            .padding(.vertical, 16 + 1)
            .padding(.horizontal, 14 + 1)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .rnBox(bg: colors.card, radius: Radius.card, border: colors.line, clip: true)
        }
        // gridItem: width 48% + flexGrow 1 (two per row share the width), minHeight 132.
        .frame(maxWidth: .infinity, minHeight: 132, maxHeight: .infinity)
    }

    private func slides(_ colors: ThemeColors) -> [HomeRotatingSlide] {
        let connected = ConnectBank.connected(data)
        let connectLabel = connectBank.label
        let hasCardDesign = cardFlow.hasCompletedFlow
        let top = topTicket
        let topTicketCents = top.reduce(0) { $0 + $1.cents }
        let bank = self.connectBank
        let store = self.data
        let nav = self.router

        return [
            // Connect-a-bank leads the rotation while nothing is linked —
            // with no accounts there is no burn, no risk and no top ticket,
            // so this is the only card that can actually do anything. Once
            // a bank IS connected it drops to the end rather than
            // disappearing, since people add second and third accounts.
            HomeRotatingSlide(
                key: "connect-bank",
                render: {
                    AnyView(HomeSlide {
                        Ionicon(connected ? "add-circle-outline" : "link-outline", size: 26, color: colors.accInk)
                        HomeSlideLabel(text: connected ? "Add another bank" : "Connect your bank", lines: 2)
                        HomeSlideCta(
                            text: connectLabel ?? (connected ? "Add →" : "Link it →"),
                            color: colors.accInk,
                            minimumScale: 0.75
                        )
                    })
                },
                onPress: { Task { await bank.connect(data: store) } }
            ),
            HomeRotatingSlide(
                key: "physical-card",
                // Already been through the flow once → show the finished
                // design (with an explicit edit affordance there), not the
                // blank/edit canvas someone already finished with.
                render: {
                    AnyView(HomeSlide {
                        Ionicon("card-outline", size: 28, color: colors.accInk)
                        HomeSlideLabel(text: hasCardDesign ? "Your physical card" : "Get your physical card", lines: 2)
                        HomeSlideCta(
                            text: hasCardDesign ? "View it →" : "Design it →",
                            color: colors.accInk,
                            minimumScale: 0.75
                        )
                    })
                },
                onPress: { nav.push(hasCardDesign ? "/screens/PhysicalCardReview" : "/screens/PhysicalCard") }
            ),
            HomeRotatingSlide(
                key: "top-ticket",
                render: {
                    AnyView(HomeSlide {
                        HStack(alignment: .center, spacing: 5) {
                            ForEach(top, id: \.id) { t in
                                MerchantMark(name: t.name, merchantId: t.merchantId, size: 24, logoUrl: t.logo)
                            }
                        }
                        .padding(.bottom, 1)
                        HomeSlideLabel(text: "Top ticket", lines: 1)
                        HomeSlideCta(
                            text: "\(formatCents(topTicketCents))/mo",
                            color: colors.red,
                            minimumScale: 0.7
                        )
                    })
                },
                onPress: { nav.push("/screens/DrainReview") }
            ),
        ]
    }

    private func spendingPowerTile(_ colors: ThemeColors) -> some View {
        let sp = spendingPower
        return PressScale(action: sp.onPress) {
            VStack(alignment: .center, spacing: 6) {
                Ionicon(sp.icon, size: 22, color: colors.gold)
                // A dollar amount gets the serif display face; a short
                // instruction does not — set in serif italic it reads as a
                // value rather than an action.
                Group {
                    if sp.isAmount {
                        Text(verbatim: sp.value)
                            .typeStyle(TypeScale.statValue)
                    } else {
                        // styles.tileAction: sans, not the serif display face.
                        Text(verbatim: sp.value)
                            .font(.custom(FontFamily.bold, size: 15))
                            .multilineTextAlignment(.center)
                    }
                }
                .foregroundStyle(colors.gold)
                .lineLimit(sp.isAmount ? 1 : 2)
                .minimumScaleFactor(0.65)
                Label(sp.label, lines: 1, shrink: true)
            }
            .padding(.vertical, 16 + 1)
            .padding(.horizontal, 14 + 1)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // The pulse is an invitation to act. It only earns its place
            // when there IS an action; on a settled balance it is noise.
            // (First child of the gradient: drawn over the border, under the content.)
            .background {
                if sp.pulse {
                    PulseRing(radius: Radius.card)
                        .padding(1)
                }
            }
            .background {
                rnRect(Radius.card).strokeBorder(colors.goldLine, lineWidth: 1)
            }
            .background {
                LinearGradient.rn(colors.goldTile, start: UnitPoint(x: 0.1, y: 0), end: UnitPoint(x: 0.9, y: 1))
                    .clipShape(rnRect(Radius.card))
            }
            .clipShape(rnRect(Radius.card))
        }
        .frame(maxWidth: .infinity, minHeight: 132, maxHeight: .infinity)
    }

    // MARK: - Pay in 4 banner

    private func payIn4Banner() -> some View {
        PressScale(action: { router.push("/(tabs)/payin4") }) {
            HStack(alignment: .center, spacing: 12) {
                // 40px r13 translucent tile holding a GOLD card glyph.
                Ionicon("card-outline", size: 20, color: Color(css: "#E7C77E"))
                    .frame(width: 40, height: 40)
                    .background(rnRect(13).fill(Color(css: "rgba(255,255,255,.12)")))
                VStack(alignment: .leading, spacing: 0) {
                    Text("Ezer Pay in 4")
                        .font(.custom(FontFamily.bold, size: 15))
                        .foregroundStyle(Color(css: "#FFFFFF"))
                    // Lavender, not white-alpha — measured off the prototype.
                    Text("Spin the card. Split anything in four.")
                        .font(.custom(FontFamily.regular, size: 12))
                        .foregroundStyle(Color(css: "#C9BCE8"))
                        .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Ionicon("chevron-forward", size: 18, color: Color(css: "rgba(255,255,255,.75)"))
            }
            // Prototype: padding 14px 16px, gap 12.
            .padding(.vertical, 14)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .background(rnRect(Radius.card).fill(Color(css: "#2E1065")))
        }
    }

    // MARK: - calendar / list toggle

    private func segment(_ colors: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 4) {
            ForEach([HomeViewMode.calendar, .list], id: \.self) { v in
                let active = view == v
                Button {
                    view = v
                } label: {
                    // Inactive is transparent with `ink` text in the prototype —
                    // muted grey made the unselected tab look disabled.
                    HStack(alignment: .center, spacing: 7) {
                        Ionicon(v == .calendar ? "calendar-outline" : "list-outline", size: 15,
                                color: active ? Color(css: "#FFFFFF") : colors.ink)
                        // 14px/600 in the prototype, not 13/700.
                        Text(verbatim: v == .calendar ? "Calendar" : "List")
                            .font(.custom(FontFamily.semibold, size: 14))
                            .foregroundStyle(active ? Color(css: "#FFFFFF") : colors.ink)
                    }
                    // Prototype: gap 7, padding 10px 0, radius 10.
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .background(rnRect(10).fill(active ? colors.accent : Color.clear))
                    .contentShape(Rectangle())
                }
                .buttonStyle(PlainPressStyle())
            }
        }
        .padding(4 + 1)
        .rnBox(bg: colors.card, radius: Radius.buttonSm, border: colors.line)
    }

    // MARK: - calendar

    private func calendar(_ colors: ThemeColors) -> some View {
        let m = month
        let map = byDay(m)
        let monthCells = cells(m)
        let today = jsParts(Date())
        let todayKey = "\(today.year)-\(today.month)-\(today.day)"
        let cellColors = HomeDayCellColors(cellHl: colors.cellHl, cellBg: colors.cellBg, accent: colors.accent, ink: colors.ink, red: colors.red)
        // Per-cell props built once per render; the Equatable cells skip re-rendering when
        // their own props did not change.
        let cellData: [HomeCellData] = monthCells.map { d in
            guard let d else { return HomeCellData(day: 0, isToday: false, totalCents: 0, marks: EMPTY_MARKS) }
            let p = jsParts(d)
            let key = "\(p.year)-\(p.month)-\(p.day)"
            let evts = map[key] ?? []
            return HomeCellData(
                day: p.day,
                isToday: key == todayKey,
                totalCents: evts.reduce(0) { $0 + $1.amountCents },
                marks: evts.isEmpty
                    ? EMPTY_MARKS
                    : evts.map { e in HomeDayMark(id: e.id, merchantName: e.merchantName, merchantId: e.merchantId, logo: e.logo) }
            )
        }
        let columns = Array(repeating: GridItem(.flexible(), spacing: 0, alignment: .top), count: 7)

        return Surface(radius: Radius.hero) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    PressScale(scaleTo: 0.9, action: { monthOffset -= 1 }) {
                        Ionicon("chevron-back", size: 16, color: colors.ink)
                            .frame(width: 32, height: 32)
                            .rnBox(radius: 16, border: colors.line)
                    }
                    Spacer(minLength: 0)
                    Text(verbatim: homeMonthTitleFormatter.string(from: jsDate(m.year, m.month, 1)))
                        .typeStyle(TypeScale.serifTitle)
                        .foregroundStyle(colors.ink)
                    Spacer(minLength: 0)
                    PressScale(scaleTo: 0.9, action: { monthOffset += 1 }) {
                        Ionicon("chevron-forward", size: 16, color: colors.ink)
                            .frame(width: 32, height: 32)
                            .rnBox(radius: 16, border: colors.line)
                    }
                }
                .padding(.bottom, 12)

                HStack(alignment: .center, spacing: 0) {
                    ForEach(WEEKDAYS, id: \.self) { w in
                        Text(verbatim: w)
                            .font(.custom(FontFamily.bold, size: 10))
                            .tracking(0.5)
                            .foregroundStyle(colors.mut2)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                }

                LazyVGrid(columns: columns, alignment: .center, spacing: 0) {
                    ForEach(Array(cellData.enumerated()), id: \.offset) { _, c in
                        DayCell(day: c.day, isToday: c.isToday, totalCents: c.totalCents, marks: c.marks, colors: cellColors, onPress: openDay)
                            .equatable()
                    }
                }
                .padding(.top, 6)

                HStack(alignment: .center, spacing: 16) {
                    HStack(alignment: .center, spacing: 6) {
                        rnRect(4).fill(colors.red).frame(width: 7, height: 7)
                        Text("Renewals")
                            .font(.custom(FontFamily.regular, size: 11))
                            .foregroundStyle(colors.mut)
                    }
                    HStack(alignment: .center, spacing: 6) {
                        rnRect(4).fill(colors.gold).frame(width: 7, height: 7)
                        Text("Trials ending")
                            .font(.custom(FontFamily.regular, size: 11))
                            .foregroundStyle(colors.mut)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 12)
            }
            .padding(14 + 1)
        }
    }

    // MARK: - list

    private func list(_ colors: ThemeColors) -> some View {
        let risks = data.risks
        return VStack(alignment: .leading, spacing: 8) {
            ForEach(risks) { r in
                PressScale(action: { openSub(r.subscriptionId) }) {
                    Surface {
                        HStack(alignment: .center, spacing: 12) {
                            MerchantMark(name: r.merchantName, merchantId: r.subscriptionId, size: 40, logoUrl: r.logo)
                            VStack(alignment: .leading, spacing: 0) {
                                Text(verbatim: r.merchantName)
                                    .font(.custom(FontFamily.bold, size: 14.5))
                                    .foregroundStyle(colors.ink)
                                    .lineLimit(1)
                                // dueDate is a calendar day at UTC midnight; new Date()
                                // would show the previous day west of UTC.
                                Text(verbatim: "\(r.type == "trial" ? "Trial" : "Renewal") · \(parseLocalDay(r.dueDate).map { homeShortDayFormatter.string(from: $0) } ?? "Invalid Date")")
                                    .font(.custom(FontFamily.regular, size: 11.5))
                                    .foregroundStyle(colors.mut)
                                    .lineLimit(1)
                                    .padding(.top, 2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            VStack(alignment: .trailing, spacing: 4) {
                                Text(verbatim: formatCents(r.amountCents))
                                    .font(.custom(FontFamily.bold, size: 14))
                                    .foregroundStyle(colors.ink)
                                Text(verbatim: "in \(r.daysUntilDue)d")
                                    .font(.custom(FontFamily.bold, size: 10))
                                    .foregroundStyle(r.type == "trial" ? colors.gold : colors.red)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(
                                        rnRect(Radius.pill).fill(
                                            r.type == "trial" ? colors.goldSoft : Color(css: theme.tokens.red + "1F")
                                        )
                                    )
                            }
                        }
                        .padding(12 + 1)
                    }
                }
            }
            if risks.isEmpty {
                BodyText("Nothing due in the next 30 days.")
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 20)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - slide content (styles.slide / slideLabel / slideCta)

/// styles.slide: flex 1, centred, full width, gap 3.
private struct HomeSlide<Content: View>: View {
    @ViewBuilder var content: Content

    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        VStack(alignment: .center, spacing: 3) {
            content
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

/// <Label numberOfLines adjustsFontSizeToFit style={styles.slideLabel}>: centred, marginTop 3,
/// full width, shrinks before the price does.
private struct HomeSlideLabel: View {
    let text: String
    let lines: Int

    var body: some View {
        Label(text, lines: lines, shrink: true)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 3)
    }
}

/// styles.slideCta: bold 12.5, lineHeight 17 (the default clipped the descender/`$` on the
/// price), centred, full width, marginTop 1.
private struct HomeSlideCta: View {
    let text: String
    let color: Color
    let minimumScale: CGFloat

    var body: some View {
        Text(verbatim: text)
            .font(.custom(FontFamily.bold, size: 12.5))
            .foregroundStyle(color)
            .lineLimit(1)
            .minimumScaleFactor(minimumScale)
            .multilineTextAlignment(.center)
            .rnLineHeight(17, family: FontFamily.bold, size: 12.5)
            .frame(maxWidth: .infinity)
            .padding(.top, 1)
    }
}

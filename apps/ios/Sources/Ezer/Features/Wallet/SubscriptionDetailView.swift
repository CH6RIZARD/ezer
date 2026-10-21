// Port of apps/mobile/app/screens/SubscriptionDetail.tsx
//
// EZER Redesign — Subscription Detail (handoff "Sub 6a", Staircase)
//
// Opened from Home list rows, the day popover, Wallet breakdown rows and the Alerts Manage/Act
// buttons. One screen, in order:
//   purple hero  — back, logo, name/ACTIVE/card, serif price, "x% more than you first paid" chip,
//                  the STAIRCASE (one equal-width step per price however long it lasted, rises
//                  tagged, next charge a dashed step), Next charge / Total spent / Per day
//   Your move    — Keep | Keep + save | Cancel, one outcome card, one CTA
//   Charges      — 3 recent, "All n" expands
//
// Smart saving is ONE goal ("Subscription savings"): enabling adds this subscription as a SOURCE
// of the pool (setSubscriptionSaving), never a goal of its own, and "enabled" is read from
// pool.sources by subscriptionId, never by goal name (PATCH-NOTES-subscription-savings.md).

import SwiftUI

// MARK: - Staircase maths (RN utils/priceSteps.ts)

struct PriceStep: Hashable {
    var cents: Int
    /// Charges at this price.
    var count: Int
    /// Index of the first / last charge in the oldest-first input.
    var from: Int
    var to: Int
}

/// Runs of equal consecutive amounts, oldest first.
func priceSteps(_ amounts: [Int]) -> [PriceStep] {
    var out: [PriceStep] = []
    for (i, cents) in amounts.enumerated() {
        if let last = out.last, last.cents == cents {
            out[out.count - 1].count += 1
            out[out.count - 1].to = i
        } else {
            out.append(PriceStep(cents: cents, count: 1, from: i, to: i))
        }
    }
    return out
}

/// Step height in points: 96 for a steady price, else 52–118 by price.
func stepHeight(_ cents: Int, _ min: Int, _ max: Int) -> CGFloat {
    max == min ? 96 : 52 + CGFloat(cents - min) / CGFloat(max - min) * 66
}

/// Hero colours: the hero is the purple card in every theme.
private enum Hero {
    static let top = Color(css: "#2E1170")
    static let mid = Color(css: "#1D0B45")
    static let sub = Color(css: ChartColors.subtext)
    static let gold = Color(css: ChartColors.line)
    static let goldInk = Color(css: "#2A0F5C")
    static let white = Color(css: "#FFFFFF")
}
/// At most this many steps; older prices are summed up in the line under it.
private let MAX_STEPS = 4

private let monthYearShortF: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMyyyy")
    return f
}()
/// "Mar 2022"
private func monthYYYY(_ d: Date) -> String { monthYearShortF.string(from: d) }
/// "Mar ’22"
private func monthYY(_ d: Date) -> String {
    "\(WalletDateFormat.shortMonth(d)) ’\(String(String(jsParts(d).year).suffix(2)))"
}
private func pctUp(_ a: Int, _ b: Int) -> Int { b == 0 ? 0 : Int(jsRound(Double(a - b) / Double(b) * 100)) }
private func listNames(_ names: [String]) -> String {
    names.count <= 1 ? names.joined() : names.dropLast().joined(separator: ", ") + " and " + names[names.count - 1]
}

private enum Seg: String { case keep, save, cancel }
private enum SaveMode { case half, match }

struct SubscriptionDetailView: View {
    let id: String?

    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win

    @State private var seg: Seg = .save
    @State private var mode: SaveMode = .half
    @State private var kept = false
    @State private var hist = false
    @State private var smartBusy = false
    @State private var smartError: String?
    @State private var cancelStarted = false
    /** Only set when the destination was a guess, so the copy stays honest. */
    @State private var cancelNote: String?
    /** True while auto-discovery is probing — keeps the CTA from double-firing. */
    @State private var cancelBusy = false

    // GET /subscriptions/:id returns everything this screen needs in one call. Falling back to an
    // unrelated subscription is never right.
    @State private var detail: SubscriptionDetail?
    @State private var loading = true
    /// `.task` also restarts when the screen re-appears, so a finished load for the same id is
    /// not repeated.
    @State private var fetched = false
    @State private var fetchedId: String?

    init(id: String?) {
        self.id = id
    }

    var body: some View {
        let colors = theme.colors
        Group {
            if loading {
                VStack(alignment: .leading, spacing: 12) {
                    DoveLoader()
                    Skeleton(w: 36, h: 36, r: 18)
                    Skeleton(w: 170, h: 16).padding(.top, 12)
                    Skeleton(w: 140, h: 64)
                    Skeleton(h: 150, r: 12).padding(.top, 10)
                    SkeletonRows(count: 3)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, Layout.screenX)
                .padding(.top, insets.top + 10)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .background(colors.bg.ignoresSafeArea())
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

    // MARK: - Not found

    private func notFound(_ colors: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                Ionicon("chevron-back", size: 18, color: colors.ink)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(colors.card))
                    .overlay(Circle().strokeBorder(colors.line, lineWidth: 1))
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

    // MARK: - Derived values

    /// Newest first.
    private func charges(_ sub: SubscriptionDetail) -> [SubscriptionDetailCharge] {
        let t: (SubscriptionDetailCharge) -> Double = { c in
            parseISODate(c.chargeTimestamp)?.timeIntervalSince1970 ?? -Double.infinity
        }
        return sub.charges.sorted { t($0) > t($1) }
    }

    private func chargeDate(_ c: SubscriptionDetailCharge) -> Date {
        parseISODate(c.chargeTimestamp) ?? Date(timeIntervalSince1970: 0)
    }

    // MARK: - Content

    private func content(_ sub: SubscriptionDetail, _ colors: ThemeColors) -> some View {
        let all = charges(sub)
        return ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    hero(sub, all, colors)
                    sheet(sub, all, colors)
                }
            }
            .rnNoBounce()
        }
        .scrollIndicators(.hidden)
        // The sheet is the card colour to the bottom of the screen.
        .background(colors.card.ignoresSafeArea())
    }

    // MARK: - Hero

    private func statCol(_ label: String, _ value: String, _ color: Color = Hero.white) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.custom(FontFamily.semibold, size: 9.5))
                .tracking(0.5)
                .foregroundStyle(Hero.sub)
            Text(value)
                .font(.custom(FontFamily.bold, size: 14.5))
                .foregroundStyle(color)
                .lineLimit(1)
                .padding(.top, 3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func hero(_ sub: SubscriptionDetail, _ all: [SubscriptionDetailCharge], _ colors: ThemeColors) -> some View {
        let name = sub.merchantName
        let card = all.first?.fundingInstrument
        let n = all.count
        let P = all.first?.amountCents ?? 0
        let firstCents = all.last?.amountCents ?? P
        let changed = all.contains { $0.amountCents != P }
        let total = sub.lifetimeCostCents != 0 ? sub.lifetimeCostCents : all.reduce(0) { $0 + $1.amountCents }
        let perDay = formatCents(Int(jsRound(Double(P * 12) / 365)))
        let renewal = sub.renewalDate.flatMap { $0.isEmpty ? nil : parseISODate($0) }
        let next = renewal.map { WalletDateFormat.monthDay($0) }
        let daysLeft = renewal.map { max(0, Int((($0.timeIntervalSinceNow) / 86_400).rounded(.up))) }

        let oldestFirst = Array(all.reversed())
        let allSteps = priceSteps(oldestFirst.map(\.amountCents))
        let steps = Array(allSteps.suffix(MAX_STEPS))
        let sMin = allSteps.map(\.cents).min() ?? 0
        let sMax = allSteps.map(\.cents).max() ?? 0
        let rises = allSteps.indices.filter { $0 > 0 && allSteps[$0].cents > allSteps[$0 - 1].cents }.count
        let dateAt: (Int) -> Date = { chargeDate(oldestFirst[$0]) }

        // Equal-width steps (flex 1) and the dashed next step (flex .7), gap 6.
        let avail = win.width - Layout.screenX * 2
        let unit = steps.isEmpty ? 0 : (avail - 6 * CGFloat(steps.count)) / (CGFloat(steps.count) + 0.7)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 0) {
                PressScale(scaleTo: 0.9, action: { router.back() }) {
                    Ionicon("chevron-back", size: 18, color: Hero.white)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Color(css: "rgba(255,255,255,.08)")))
                        .overlay(Circle().strokeBorder(Color(css: "rgba(255,255,255,.14)"), lineWidth: 1))
                }
                Spacer(minLength: 0)
                MerchantMark(name: name, merchantId: sub.merchantId, size: 40, logoUrl: sub.logo)
            }

            HStack(spacing: 8) {
                Text(name)
                    .font(.custom(FontFamily.bold, size: 15))
                    .foregroundStyle(Hero.white)
                    .lineLimit(1)
                Text(sub.status == "trial" ? "FREE TRIAL" : "ACTIVE")
                    .font(.custom(FontFamily.bold, size: 9.5))
                    .tracking(0.6)
                    .foregroundStyle(Hero.gold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(rnRect(10).fill(Color(css: "rgba(231,199,126,.18)")))
                    .fixedSize()
                if let card {
                    Text("\(card.displayName) ···· \(card.last4)")
                        .font(.custom(FontFamily.regular, size: 12))
                        .foregroundStyle(Hero.sub)
                        .lineLimit(1)
                }
            }
            .padding(.top, 20)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(formatCents(P))
                    .font(.custom(FontFamily.serif, size: 96))
                    .tracking(-2)
                    .foregroundStyle(Hero.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text("/ month")
                    .font(.custom(FontFamily.regular, size: 15))
                    .foregroundStyle(Hero.sub)
                    .fixedSize()
            }
            .padding(.top, 4)

            if n > 0 {
                let chipFg = changed ? Hero.gold : Color(css: "#C4A9F7")
                HStack(spacing: 8) {
                    HStack(spacing: 5) {
                        Ionicon(changed ? "trending-up" : "checkmark-circle", size: 12, color: chipFg)
                        Text(changed ? "\(pctUp(P, firstCents))% more than you first paid" : "Same price since \(monthYYYY(dateAt(0)))")
                            .font(.custom(FontFamily.bold, size: 11.5))
                            .foregroundStyle(chipFg)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(rnRect(12).fill(Color(css: changed ? "rgba(231,199,126,.2)" : "rgba(196,169,247,.2)")))
                    if changed {
                        (Text("was ") + Text(formatCents(firstCents)).strikethrough())
                            .font(.custom(FontFamily.regular, size: 12.5))
                            .foregroundStyle(Hero.sub)
                            .lineLimit(1)
                    }
                }
                .padding(.top, 12)
            }

            // --- staircase ---
            if !steps.isEmpty {
                HStack(alignment: .bottom, spacing: 6) {
                    ForEach(Array(steps.enumerated()), id: \.element.from) { i, s in
                        let prevIdx = allSteps.count - steps.count + i - 1
                        stepView(s, prev: prevIdx >= 0 ? allSteps[prevIdx] : nil, cur: i == steps.count - 1, width: unit, height: stepHeight(s.cents, sMin, sMax))
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        Text("next")
                            .font(.custom(FontFamily.bold, size: 11))
                            .foregroundStyle(Hero.gold)
                        Text(next ?? "—")
                            .font(.custom(FontFamily.regular, size: 10))
                            .foregroundStyle(Hero.sub)
                            .lineLimit(1)
                    }
                    .padding(.top, 8)
                    .padding(.horizontal, 8)
                    .frame(width: unit * 0.7, height: stepHeight(P, sMin, sMax), alignment: .topLeading)
                    .overlay(
                        rnRect(topLeading: 12, topTrailing: 12, bottomTrailing: 4, bottomLeading: 4)
                            .stroke(Color(css: "rgba(231,199,126,.6)"), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    )
                }
                .frame(height: 150, alignment: .bottom)
                .padding(.top, 22)

                HStack(spacing: 6) {
                    ForEach(steps, id: \.from) { s in
                        Text(s.count == 1 ? monthYY(dateAt(s.from)) : "\(monthYY(dateAt(s.from))) – \(monthYY(dateAt(s.to)))")
                            .font(.custom(FontFamily.regular, size: 10))
                            .foregroundStyle(Color(css: "rgba(201,188,232,.8)"))
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(width: unit, alignment: .leading)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.top, 6)
            }

            if n > 0 {
                let line: (String, String) = changed
                    ? ("\(formatCents(allSteps[0].cents)) for \(allSteps[0].count) \(allSteps[0].count == 1 ? "charge" : "charges"), then",
                       "\(rises) \(rises == 1 ? "increase" : "increases") since \(WalletDateFormat.shortMonth(dateAt(allSteps[1].from)))")
                    : ("\(n) \(n == 1 ? "charge" : "charges") at \(formatCents(P)),", "not one increase")
                (Text(line.0 + " ") + Text(line.1).font(.custom(FontFamily.bold, size: 12.5)).foregroundColor(Hero.white))
                    .font(.custom(FontFamily.regular, size: 12.5))
                    .foregroundStyle(Hero.sub)
                    .padding(.top, 12)
            }

            HStack(alignment: .top, spacing: 0) {
                statCol("NEXT CHARGE", next.map { "\($0) · \(daysLeft ?? 0)d" } ?? "—")
                statCol(changed ? "TOTAL SPENT" : "PER YEAR", formatCents(changed ? total : P * 12), changed ? Color(css: "#F08A73") : Hero.white)
                statCol("PER DAY", perDay)
            }
            .padding(.top, 14)
            .overlay(alignment: .top) { Rectangle().fill(Color(css: "rgba(255,255,255,.12)")).frame(height: 1) }
            .padding(.top, 16)
        }
        .padding(.top, insets.top + 10)
        .padding(.horizontal, Layout.screenX)
        .padding(.bottom, 52)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(LinearGradient.rn([Hero.top, Hero.mid, colors.bg], locations: [0, 0.64, 1]))
    }

    // MARK: - Your move + Charges

    private func sheet(_ sub: SubscriptionDetail, _ all: [SubscriptionDetailCharge], _ colors: ThemeColors) -> some View {
        let name = sub.merchantName
        let n = all.count
        let P = all.first?.amountCents ?? 0
        let H = Int(jsRound(Double(P) / 2))
        let renewal = sub.renewalDate.flatMap { $0.isEmpty ? nil : parseISODate($0) }
        let next = renewal.map { WalletDateFormat.monthDay($0) }
        let perDay = formatCents(Int(jsRound(Double(P * 12) / 365)))

        // One pool, many sources.
        let live = (savings.pool?.sources ?? []).filter { $0.status != "ENDED" }
        let mine = live.first { $0.subscriptionId == sub.id }
        let others = live.filter { $0.subscriptionId != sub.id }
        let curMode: SaveMode = mine.map { $0.mode == "MATCH" ? .match : .half } ?? mode
        let per = curMode == .match ? P : H

        let out: (label: String, value: String, color: Color, line: String, border: Color) = {
            switch seg {
            case .keep:
                return ("NEXT 12 MONTHS", "−" + formatCents(P * 12), colors.red, "\(perDay) a day, every day. Nothing else changes.", colors.line2)
            case .save:
                return ("SAVED IN 12 MONTHS", "+" + formatCents(per * 12), colors.accInk, "Each \(formatCents(P)) charge also moves \(formatCents(per)) into Subscription savings.", colors.accInk)
            case .cancel:
                return ("BACK IN 12 MONTHS", "+" + formatCents(P * 12), colors.gold, "Cancel\(next.map { " before \($0)" } ?? "") and choose where the \(formatCents(P)) a month goes instead.", colors.gold)
            }
        }()

        let doneText: String? = {
            if seg == .keep && kept { return "✓ Kept as is.\(next.map { " Nothing changes on \($0)." } ?? "")" }
            if seg == .cancel && cancelStarted { return "Cancellation started ✓ — choose where the money goes" }
            if seg == .save, let mine {
                if mine.status == "PAUSED" { return "Saving from \(name) is paused. Resume it in Subscription savings." }
                return "✓ Added to Subscription savings — each \(name) charge also moves \(formatCents(per)) there. \(live.count) \(live.count == 1 ? "subscription now feeds" : "subscriptions now feed") it."
            }
            return nil
        }()
        let busy = seg == .save ? smartBusy : seg == .cancel ? cancelBusy : false
        let ctaLabel = busy
            ? (seg == .cancel ? "Finding cancellation page…" : "Setting up…")
            : seg == .keep ? "Keep as is" : seg == .cancel ? "Cancel & choose where to send the money" : "Enable smart saving"

        let shown = Array(all.prefix(hist ? 6 : 3))
        let earlier = hist && n > 6 ? Array(all.dropFirst(6)) : []

        return VStack(alignment: .leading, spacing: 0) {
            Text("Your move")
                .font(.custom(FontFamily.serif, size: 32))
                .foregroundStyle(colors.ink)
            Text(next.map { "Before \($0), when \(name) charges \(formatCents(P)) again" } ?? "Next time \(name) charges \(formatCents(P))")
                .font(.custom(FontFamily.regular, size: 12.5))
                .foregroundStyle(colors.mut)
                .padding(.top, 4)

            // --- segments ---
            HStack(spacing: 0) {
                ForEach([(Seg.keep, "Keep"), (.save, "Keep + save"), (.cancel, "Cancel")], id: \.0) { k, t in
                    let on = seg == k
                    PressScale(scaleTo: 0.97, action: { seg = k }) {
                        Text(t)
                            .font(.custom(FontFamily.bold, size: 13))
                            .foregroundStyle(on ? (k == .keep ? colors.ink : Hero.white) : colors.mut)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(
                                Capsule().fill(
                                    on && k == .save
                                        ? LinearGradient.rn(["#6230B8", "#4C1D95"], start: .topLeading, end: .bottomTrailing)
                                        : LinearGradient.rn([on ? (k == .cancel ? colors.red : colors.line2) : Color.clear, on ? (k == .cancel ? colors.red : colors.line2) : Color.clear])
                                )
                            )
                            .contentShape(Capsule())
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(4)
            .background(Capsule().fill(colors.bg))
            .overlay(Capsule().strokeBorder(colors.line, lineWidth: 1))
            .padding(.top, 16)

            // --- outcome card ---
            VStack(alignment: .leading, spacing: 0) {
                Text(out.label)
                    .font(.custom(FontFamily.semibold, size: 10.5))
                    .tracking(0.5)
                    .foregroundStyle(colors.mut)
                Text(out.value)
                    .font(.custom(FontFamily.serif, size: 52))
                    .tracking(-1)
                    .foregroundStyle(out.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.top, 4)
                Text(out.line)
                    .font(.custom(FontFamily.regular, size: 13))
                    .foregroundStyle(colors.mut)
                    .rnLineHeight(19, family: FontFamily.regular, size: 13)
                    .padding(.top, 8)

                if seg == .save {
                    HStack(spacing: 8) {
                        ForEach([SaveMode.half, .match], id: \.self) { m in
                            let on = curMode == m
                            PressScale(scaleTo: 0.97, disabled: smartBusy, action: { pickMode(m, sub: sub, mine: mine != nil, cur: curMode) }) {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(m == .half ? "Save half" : "Match full")
                                        .font(.custom(FontFamily.bold, size: 13))
                                        .foregroundStyle(colors.ink)
                                        .lineLimit(1)
                                    Text("+\(formatCents(m == .match ? P : H)) each charge")
                                        .font(.custom(FontFamily.regular, size: 11.5))
                                        .foregroundStyle(colors.mut)
                                        .lineLimit(1)
                                }
                                .padding(.vertical, 10)
                                .padding(.horizontal, 12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(rnRect(14).fill(on ? colors.goldSoft : Color.clear))
                                .overlay(rnRect(14).strokeBorder(on ? colors.gold : colors.line2, lineWidth: 2))
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.top, 14)

                    let marks: [(String, String)] = others.isEmpty
                        ? [(sub.id, name)]
                        : others.prefix(3).map { ($0.subscriptionId, $0.merchantName) }
                    HStack(spacing: 10) {
                        ZStack(alignment: .topLeading) {
                            ForEach(Array(marks.enumerated()), id: \.element.0) { i, m in
                                MerchantMark(name: m.1, size: 22)
                                    .frame(width: 22, height: 22)
                                    .clipShape(rnRect(7))
                                    .padding(2)
                                    .background(rnRect(9).fill(colors.bg2))
                                    .offset(x: CGFloat(i) * 16)
                            }
                        }
                        .frame(width: 26 + CGFloat(max(0, marks.count - 1)) * 16, height: 26, alignment: .topLeading)
                        let tail = others.isEmpty
                            ? "as its first subscription"
                            : "with \(listNames(others.map(\.merchantName)))\(mine != nil ? "" : ", not a goal of its own")"
                        (Text(mine != nil ? "Saving into " : "Goes into ")
                            + Text("Subscription savings").font(.custom(FontFamily.bold, size: 12)).foregroundColor(colors.ink)
                            + Text(" " + tail))
                            .font(.custom(FontFamily.regular, size: 12))
                            .foregroundStyle(colors.mut)
                            .rnLineHeight(16, family: FontFamily.regular, size: 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.top, 12)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rnRect(20).fill(colors.bg2))
            .overlay(rnRect(20).strokeBorder(out.border, lineWidth: 1))
            .padding(.top, 12)

            // --- CTA / done ---
            if let doneText {
                Text(doneText)
                    .font(.custom(FontFamily.semibold, size: 12.5))
                    .foregroundStyle(colors.success)
                    .rnLineHeight(18, family: FontFamily.semibold, size: 12.5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 13)
                    .padding(.horizontal, 14)
                    .background(rnRect(14).fill(colors.successBg))
                    .padding(.top, 12)
                if seg == .save {
                    PressScale(scaleTo: 0.98, action: { router.push("/screens/SubscriptionPool") }) {
                        HStack(spacing: 6) {
                            Text("Open Subscription savings")
                                .font(.custom(FontFamily.bold, size: 13.5))
                                .foregroundStyle(colors.accInk)
                            Ionicon("chevron-forward", size: 13, color: colors.accInk)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .overlay(rnRect(14).strokeBorder(colors.line2, lineWidth: 1.5))
                    }
                    .padding(.top, 10)
                }
            } else {
                PressScale(scaleTo: 0.98, disabled: busy, action: {
                    switch seg {
                    case .keep: kept = true
                    case .cancel: Task { await onCancel(sub) }
                    case .save: Task { await enableSmartSaving(sub.id, mode) }
                    }
                }) {
                    Text(ctaLabel)
                        .font(.custom(FontFamily.bold, size: 14.5))
                        .foregroundStyle(seg == .keep ? colors.ink : Hero.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(
                            Capsule().fill(
                                seg == .save
                                    ? LinearGradient.rn(["#6230B8", "#4C1D95", "#3E1680"], locations: [0, 0.55, 1], start: .topLeading, end: .bottomTrailing)
                                    : LinearGradient.rn([seg == .cancel ? colors.red : Color.clear, seg == .cancel ? colors.red : Color.clear])
                            )
                        )
                        .overlay(Capsule().strokeBorder(seg == .keep ? colors.line2 : Color.clear, lineWidth: 1.5))
                        .shadow(color: seg == .save ? Color(css: "rgba(98,48,184,.7)") : .clear, radius: 15, y: 14)
                        .cameraDove(busy)
                        .opacity(busy ? 0.7 : 1)
                }
                .padding(.top, 12)
            }
            if seg == .save, let err = smartError {
                Text(err)
                    .font(.custom(FontFamily.regular, size: 13))
                    .foregroundStyle(colors.red)
                    .padding(.top, 8)
            }
            if seg == .cancel, let note = cancelNote, !note.isEmpty {
                BodyText(note)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }

            // --- Charges ---
            if n > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("Charges")
                        .font(.custom(FontFamily.bold, size: 16.5))
                        .foregroundStyle(colors.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if n > 3 {
                        PressScale(scaleTo: 0.95, action: { hist.toggle() }) {
                            HStack(spacing: 4) {
                                Text(hist ? "Show less" : "All \(n)")
                                    .font(.custom(FontFamily.bold, size: 12.5))
                                    .foregroundStyle(colors.accInk)
                                Ionicon(hist ? "chevron-up" : "chevron-down", size: 12, color: colors.accInk)
                            }
                        }
                    }
                }
                .padding(.top, 28)
                .padding(.bottom, 8)

                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, c in
                        let older: SubscriptionDetailCharge? = i + 1 < n ? all[i + 1] : nil
                        let note = older.flatMap { c.amountCents > $0.amountCents ? "↑ \(pctUp(c.amountCents, $0.amountCents))%" : nil }
                        chargeRow(formatDate(chargeDate(c)), note, formatCents(c.amountCents), colors.red, line: i > 0, colors)
                    }
                    if let oldest = earlier.last, let newest = earlier.first {
                        chargeRow(
                            "\(earlier.count) earlier · \(monthYYYY(chargeDate(oldest))) – \(monthYYYY(chargeDate(newest)))",
                            nil,
                            formatCents(earlier.reduce(0) { $0 + $1.amountCents }),
                            colors.mut,
                            line: true,
                            colors
                        )
                    }
                }
                .padding(.horizontal, 14)
                .background(rnRect(18).fill(colors.bg2))
                .overlay(rnRect(18).strokeBorder(colors.line, lineWidth: 1))
            }
        }
        .padding(.top, 24)
        .padding(.horizontal, Layout.screenX)
        .padding(.bottom, Layout.contentBottom)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(rnRect(topLeading: 28, topTrailing: 28).fill(colors.card))
        .padding(.top, -24)
    }

    /// One staircase step: price + charge count inside, a "+x%" tag on its top edge when it rose.
    private func stepView(_ s: PriceStep, prev: PriceStep?, cur: Bool, width: CGFloat, height h: CGFloat) -> some View {
        let shape = rnRect(topLeading: 12, topTrailing: 12, bottomTrailing: 4, bottomLeading: 4)
        let fill = cur
            ? LinearGradient.rn(["#E7C77E", "rgba(231,199,126,.6)"])
            : LinearGradient.rn(["rgba(231,199,126,.2)", "rgba(231,199,126,.2)"])
        return ZStack(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 1) {
                Text(formatCents(s.cents))
                    .font(.custom(FontFamily.bold, size: 14))
                    .foregroundStyle(cur ? Hero.goldInk : Hero.white)
                    .lineLimit(1)
                Text("\(s.count) \(s.count == 1 ? "charge" : "charges")")
                    .font(.custom(FontFamily.regular, size: 10.5))
                    .foregroundStyle(cur ? Color(css: "rgba(42,15,92,.72)") : Hero.sub)
                    .lineLimit(1)
            }
            .padding(.top, 9)
            .padding(.horizontal, 9)
            .frame(width: width, height: h, alignment: .topLeading)
            .background(shape.fill(fill))
            .clipShape(shape)
            if let prev, s.cents > prev.cents {
                Text("+\(pctUp(s.cents, prev.cents))%")
                    .font(.custom(FontFamily.bold, size: 10))
                    .foregroundStyle(Hero.goldInk)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(rnRect(7).fill(Hero.gold))
                    .fixedSize()
                    .offset(x: -5, y: -(h + 6))
            }
        }
        .frame(width: width, alignment: .leading)
    }

    private func chargeRow(_ date: String, _ note: String?, _ amount: String, _ amountColor: Color, line: Bool, _ colors: ThemeColors) -> some View {
        HStack(spacing: 10) {
            Text(date)
                .font(.custom(FontFamily.semibold, size: 13))
                .foregroundStyle(colors.ink)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let note {
                Text(note)
                    .font(.custom(FontFamily.bold, size: 10))
                    .foregroundStyle(colors.gold)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(rnRect(8).fill(colors.goldSoft))
                    .fixedSize()
            }
            Text(amount)
                .font(.custom(FontFamily.bold, size: 13))
                .foregroundStyle(amountColor)
                .fixedSize()
        }
        .padding(.vertical, 11)
        .overlay(alignment: .top) {
            Rectangle().fill(line ? colors.line : Color.clear).frame(height: 1)
        }
    }

    // MARK: - Actions

    private func pickMode(_ m: SaveMode, sub: SubscriptionDetail, mine: Bool, cur: SaveMode) {
        if mine {
            // Already a source: the same idempotent PUT switches its mode.
            if cur != m { Task { await enableSmartSaving(sub.id, m) } }
        } else {
            mode = m
        }
    }

    private func enableSmartSaving(_ subscriptionId: String, _ m: SaveMode) async {
        if smartBusy { return }
        smartBusy = true
        smartError = nil
        let res = await savings.setSubscriptionSaving(subscriptionId, m == .match ? "MATCH" : "HALF")
        smartBusy = false
        if !res.ok { smartError = res.error ?? "Could not set up smart saving." }
    }

    // Flipping local state is not enough: the user asked to land on the service's real
    // cancellation page. `cancellationUrl` on the merchant record wins over the curated table
    // inside resolveCancellationUrl.
    private func onCancel(_ sub: SubscriptionDetail) async {
        if cancelBusy { return }
        let name = sub.merchantName
        if let quick = resolveCancellationUrlSync(name, sub.merchantId, sub.cancellationUrl) {
            cancelStarted = true
            cancelNote = nil
            Task { _ = await openCancellation(quick) }
            return
        }
        // Auto-discovery probes the merchant's domain, so it needs a pending state.
        cancelBusy = true
        defer { cancelBusy = false }
        let target = await resolveCancellationUrl(name, sub.merchantId, sub.cancellationUrl, sub.website)
        cancelStarted = target.source != "unknown"
        // 'unknown' gets no note — openCancellation already shows an honest alert.
        cancelNote = target.source == "homepage"
            ? "We couldn't confirm the exact cancellation page — opening \(name)'s site instead. \(appStoreFallbackHint())"
            : nil
        _ = await openCancellation(target)
    }
}

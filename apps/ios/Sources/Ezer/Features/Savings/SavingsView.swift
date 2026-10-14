// Port of apps/mobile/app/(tabs)/savings.tsx
//
// EZER Redesign — Savings (4th tab)
//
// The account the app was missing, and the one thing it does that a bank does not: it decides how
// much you can spare and moves it, without asking you for a number.
//
// The screen is ordered by what the user actually wants to know, in order:
//   1. how much is saved                    (hero)
//   2. what the app is about to do next     (autopilot card — the differentiator)
//   3. how each goal is doing               (rings, tappable)
//   4. what already happened                (activity)
//
// Every goal card opens its own detail screen; the hero actions open the shared MoveMoneySheet.
// A row that shows a number the user cannot act on does not belong here.
//
// RN `shortDate` ("Sat, Aug 2") is declared in the .tsx but never used, so it is not ported.

import SwiftUI

struct SavingsView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var moveMode: SavingsMoveMode?
    @State private var creating = false
    /// A refresh the user asked for (pull, Retry): the only refresh that flies the camera dove.
    @State private var asked = false
    /// `handledCreateParam` ref.
    @State private var handledCreateParam: String?

    private func userRefresh() {
        asked = true
        Task { await savings.refresh(); asked = false }
    }

    var body: some View {
        let c = theme.colors
        // checkingBalance / checkingLabel / averageSave were only read by the engine-facing figures
        // removed from this screen. Nothing here shows a bank balance or a statistic about the sweep.
        let goals = savings.goals
        let params = router.params(.savings)
        // Reallocate's "Create a new goal" lands here with ?create=1&t=<nonce> and should open the goal
        // sheet. Keyed on create+t together because this tab stays mounted across tab switches, so the
        // same params pushed twice would otherwise only open the sheet the very first time.
        let createKey: String? = params["create"] == "1" ? "\(params["create"] ?? ""):\(params["t"] ?? "")" : nil

        ScrollView(.vertical) {
            ScreenBody {
                content(c, goals)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, insets.bottom + Layout.tabBottom)
            .tabMark()
            // RN: an invisible RefreshControl (refreshing={false}, transparent tint). The pull only
            // starts the refresh; the camera dove below is what shows the wait. `.refreshable` drew
            // the system spinner circle instead, which the owner reported (Oct 13 2026).
            .pullToRefresh { userRefresh() }
        }
        .scrollIndicators(.hidden)
        // The one loader, only for a wait someone can see: the first load or a refresh they asked
        // for. The silent refresh behind shown data does not fly it (owner, Oct 14 2026: "looping for
        // no reason, everything is already loaded"). RN: useCameraDove(isLoading && (!hydrated || asked)).
        .cameraDove(savings.isLoading && (!savings.hydrated || asked))
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
        .background {
            MoveMoneySheet(visible: moveMode != nil, mode: moveMode ?? .add, onClose: { moveMode = nil })
            GoalFormSheet(
                visible: creating,
                onClose: { creating = false },
                onCreated: { id in router.push("/screens/GoalDetail", ["id": id]) }
            )
        }
        .onChange(of: createKey, initial: true) { _, key in
            guard let key else { return }
            if handledCreateParam != key {
                handledCreateParam = key
                creating = true
            }
        }
    }

    // MARK: - render

    @ViewBuilder
    private func content(_ c: ThemeColors, _ goals: [SavingsGoal]) -> some View {
        let transactions = savings.transactions
        let autoSave = savings.autoSave
        let totalSaved = savings.totalSaved
        let hasGoals = !goals.isEmpty

        VStack(alignment: .leading, spacing: 0) {
            Text("Savings")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(c.ink)
            BodyText("Saved for you · yours to move")
                .padding(.top, 6)

            // A failed load must not render as "$0.00 saved".
            if let error = savings.error {
                Surface(borderColor: Color(css: theme.tokens.red + "55")) {
                    HStack(alignment: .center, spacing: 9) {
                        Ionicon("cloud-offline-outline", size: 16, color: c.red)
                        Text(error)
                            .font(.ezer(FontFamily.medium, 12))
                            .foregroundStyle(c.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        SavingsPressable(hitSlop: 8, action: { userRefresh() }) {
                            Text("Retry").font(.ezer(FontFamily.bold, 12)).foregroundStyle(c.accInk)
                        }
                    }
                    .padding(12 + 1)
                }
                .padding(.top, 14)
            }

            // --- hero ---
            Surface(radius: Radius.hero) {
                VStack(alignment: .leading, spacing: 0) {
                    Label("Total saved")
                    Text(savings.hydrated ? formatCents(savingsDollarsToCents(totalSaved)) : "—")
                        .typeStyle(TypeScale.totalValue)
                        .foregroundStyle(c.success)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .padding(.top, 4)

                    // One fact, not two. "Typical save" was the mean of past debits — a statistic about
                    // the engine's behaviour. What they came for is the total above and how it moved
                    // this month.
                    HStack(alignment: .center, spacing: 14) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(formatCents(savingsDollarsToCents(savings.savedThisMonth)))
                                .font(.ezer(FontFamily.bold, 15))
                                .foregroundStyle(c.ink)
                                .lineLimit(1)
                            Text("Saved this month")
                                .font(.ezer(FontFamily.regular, 11))
                                .foregroundStyle(c.mut2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.top, 14)

                    HStack(alignment: .top, spacing: 8) {
                        SavingsActionButton(icon: "add", iconSize: 16, title: "Add", primary: true, disabled: !hasGoals) {
                            moveMode = .add
                        }
                        SavingsActionButton(icon: "arrow-up", iconSize: 15, title: "Withdraw", disabled: !hasGoals || totalSaved <= 0) {
                            moveMode = .withdraw
                        }
                        SavingsActionButton(icon: "swap-horizontal", iconSize: 15, title: "Move", disabled: goals.count < 2 || totalSaved <= 0) {
                            moveMode = .move
                        }
                    }
                    .padding(.top, 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18 + 1)
            }
            .padding(.top, 16)

            // --- autopilot ---
            SectionHeader("Autopilot")
                .padding(.top, 26)
                .padding(.bottom, 10)
            autopilotCard(c, goals, autoSave)

            // --- goals ---
            HStack(alignment: .center, spacing: 0) {
                SectionHeader("Goals")
                    .frame(maxWidth: .infinity, alignment: .leading)
                SavingsPressable(hitSlop: 10, action: { creating = true }) {
                    HStack(alignment: .center, spacing: 4) {
                        Ionicon("add", size: 15, color: c.accInk)
                        Text("New goal").font(.ezer(FontFamily.semibold, 12.5)).foregroundStyle(c.accInk)
                    }
                }
            }
            .padding(.top, 26)
            .padding(.bottom, 10)

            if hasGoals {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(goals) { g in goalRow(g, c) }
                }
            } else if !savings.hydrated {
                VStack(spacing: 8) {
                    ForEach(0..<2, id: \.self) { i in
                        Surface {
                            VStack(alignment: .leading, spacing: 10) {
                                Skeleton(w: i == 0 ? 170 : 120, h: 14)
                                Skeleton(h: 8, r: 4)
                                Skeleton(w: 90, h: 10)
                            }
                            .padding(14)
                        }
                    }
                }
            } else {
                Surface {
                    VStack(alignment: .center, spacing: 0) {
                        Ionicon("flag-outline", size: 22, color: c.mut2)
                        BodyText("Create a goal and we start putting money aside for it on our own.")
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                        PressScale(action: { creating = true }) {
                            Text("Create a goal")
                                .font(.ezer(FontFamily.bold, 13))
                                .foregroundStyle(Color(css: "#FFFFFF"))
                                .padding(.horizontal, 18)
                                .padding(.vertical, 11)
                                .background(rnRect(Radius.button).fill(c.accent))
                        }
                        .padding(.top, 14)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(20 + 1)
                }
            }

            // --- activity ---
            SectionHeader("Recent activity")
                .padding(.top, 26)
                .padding(.bottom, 10)
            if !transactions.isEmpty {
                Surface {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(transactions.prefix(10).enumerated()), id: \.element.id) { i, t in
                            txRow(t, i, goals, c)
                        }
                    }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 1)
                }
            } else if !savings.hydrated {
                Surface { SkeletonRows(count: 3, card: false).padding(.horizontal, 14 + 1) }
            } else {
                Surface {
                    BodyText("No movements yet.")
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(20 + 1)
                }
            }

            // Standing disclosure. The API's savingsEngine cannot custody funds until a real ACH
            // processor is wired, so these balances are simulated. Saying so in the product is cheaper
            // than explaining it to a partner later.
            Text("EZER is not a bank. Balances and transfers shown here are simulated while bank connections are being certified — no funds are held, promised or guaranteed.")
                .font(.ezer(FontFamily.regular, 10.5))
                .foregroundStyle(c.mut3)
                .rnLineHeight(16, family: FontFamily.regular, size: 10.5)
                .padding(.top, 24)
        }
    }

    // MARK: - autopilot

    /// Every branch is the SERVER's answer, not a local guess. `preview` comes from
    /// GET /savings/sweep/preview, which runs the same gate the real sweep runs.
    private func autopilotCopy(_ autoSave: AutoSaveSettings, _ activeGoals: [SavingsGoal]) -> (headline: String, detail: String) {
        let preview = savings.preview
        if !autoSave.enabled {
            return ("Paused", "Automatic saving is off. Your goals stay put until you turn it back on.")
        }
        if activeGoals.isEmpty {
            return ("No goals switched on", "Turn on automatic saving for a goal and we will start moving money into it.")
        }
        if preview.unknown {
            // We did not get an answer, so we do not claim one.
            return ("Not sure yet", preview.explanation)
        }
        if preview.wouldSweep {
            return (
                "About \(formatCents(savingsDollarsToCents(preview.amountDollars)))",
                "this week, split across \(activeGoals.count) \(activeGoals.count == 1 ? "goal" : "goals")."
            )
        }
        return ("Nothing this time", preview.explanation)
    }

    private func autopilotCard(_ c: ThemeColors, _ goals: [SavingsGoal], _ autoSave: AutoSaveSettings) -> some View {
        let on = autoSave.enabled
        let white = Color(css: "#FFFFFF")
        let copy = autopilotCopy(autoSave, goals.filter { $0.autoSave })
        let shape = rnRect(Radius.hero)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 9) {
                Ionicon(on ? "sparkles" : "pause", size: 15, color: on ? white : c.mut)
                    .frame(width: 28, height: 28)
                    .background(rnRect(Radius.cellSm).fill(on ? Color(css: "rgba(255,255,255,.14)") : c.card))
                Text("NEXT AUTOMATIC SAVE")
                    .font(.ezer(FontFamily.semibold, 10))
                    .tracking(0.6)
                    .foregroundStyle(on ? Color(css: "rgba(255,255,255,.72)") : c.mut)
            }

            Text(copy.headline)
                .font(.ezer(FontFamily.serif, 32))
                .foregroundStyle(on ? white : c.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .padding(.top, 12)

            Text(copy.detail)
                .font(.ezer(FontFamily.regular, 12.5))
                .foregroundStyle(on ? Color(css: "rgba(255,255,255,.78)") : c.mut)
                .rnLineHeight(18.5, family: FontFamily.regular, size: 12.5)
                .padding(.top, 6)

            // The checking balance and the buffer used to sit here. They are inputs to the ENGINE, not
            // to the user. Only the on/off control remains.
            HStack(alignment: .center, spacing: 12) {
                Spacer(minLength: 0)
                SavingsPressable(hitSlop: 8, action: { Task { _ = await savings.setAutoSaveEnabled(!on) } }) {
                    Text(on ? "Pause" : "Resume")
                        .font(.ezer(FontFamily.bold, 11.5))
                        .foregroundStyle(on ? white : c.accInk)
                        .padding(.horizontal, 14 + 1)
                        .padding(.vertical, 9 + 1)
                        .background(rnRect(Radius.pill).fill(on ? Color(css: "rgba(255,255,255,.16)") : c.card))
                        .overlay(rnRect(Radius.pill).strokeBorder(on ? Color(css: "transparent") : c.line, lineWidth: 1))
                }
            }
            .padding(.top, 14)
            .savingsBorderTop(on ? Color(css: "rgba(255,255,255,.16)") : c.line)
            .padding(.top, 16)
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
        .overlay(shape.strokeBorder(on ? Color(css: "transparent") : c.line, lineWidth: 1))
    }

    // MARK: - goal card

    private func goalRow(_ g: SavingsGoal, _ c: ThemeColors) -> some View {
        let pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0
        let funded = g.targetAmount > 0 && g.currentAmount >= g.targetAmount
        let ringColor = funded ? c.success : Color(css: g.color)

        return PressScale(scaleTo: Motion.pressScale, action: { router.push("/screens/GoalDetail", ["id": g.id]) }) {
            Surface {
                HStack(alignment: .center, spacing: 13) {
                    ProgressRing(progress: pct, size: 50, stroke: 4, color: ringColor, trackColor: c.line) {
                        Ionicon(g.icon, size: 18, color: ringColor)
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .center, spacing: 7) {
                            Text(g.name)
                                .font(.ezer(FontFamily.bold, 14.5))
                                .foregroundStyle(c.ink)
                                .lineLimit(1)
                            tag(g.autoSave, c).fixedSize()
                        }

                        (Text(formatCents(savingsDollarsToCents(g.currentAmount)))
                            + Text("  of \(formatCents(savingsDollarsToCents(g.targetAmount)))")
                            .foregroundStyle(c.mut2)
                            .font(.ezer(FontFamily.regular, 14)))
                            .font(.ezer(FontFamily.bold, 14))
                            .foregroundStyle(c.ink)
                            .lineLimit(1)
                            .padding(.top, 4)

                        Text(funded ? "Funded — nice work" : "\(formatCents(savingsDollarsToCents(g.targetAmount - g.currentAmount))) to go")
                            .font(.ezer(FontFamily.regular, 11.5))
                            .foregroundStyle(c.mut2)
                            .lineLimit(1)
                            .padding(.top, 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Ionicon("chevron-forward", size: 16, color: c.mut2)
                }
                .padding(14 + 1)
            }
        }
    }

    @ViewBuilder
    private func tag(_ auto: Bool, _ c: ThemeColors) -> some View {
        // tag { row, centre, gap 3, paddingH 6, paddingV 2.5, radius.pill }; tagText bold 8.5, tracking .5
        if auto {
            HStack(alignment: .center, spacing: 3) {
                Ionicon("sparkles", size: 9, color: c.success)
                Text("AUTO").font(.ezer(FontFamily.bold, 8.5)).tracking(0.5).foregroundStyle(c.success)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2.5)
            .background(rnRect(Radius.pill).fill(c.successBg))
        } else {
            HStack(alignment: .center, spacing: 3) {
                Text("PAUSED").font(.ezer(FontFamily.bold, 8.5)).tracking(0.5).foregroundStyle(c.mut2)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 2.5)
            .background(rnRect(Radius.pill).fill(c.bg2))
        }
    }

    // MARK: - activity row

    private func txRow(_ t: SavingsTransaction, _ i: Int, _ goals: [SavingsGoal], _ c: ThemeColors) -> some View {
        let inbound = t.type != .withdraw
        // A sweep and a manual deposit are indistinguishable on the wire, so both read as "Money in".
        let (title, icon): (String, String) = {
            switch t.type {
            case .transfer: return ("Money in", "arrow-down")
            case .withdraw: return ("Withdrawal", "arrow-up")
            case .move: return ("Moved between goals", "swap-horizontal")
            }
        }()
        let goalPart: String = {
            guard let id = t.goalId, !id.isEmpty else { return "" }
            return "\(goals.first { $0.id == id }?.name ?? "Savings") · "
        }()
        // Pending is not cosmetic: this money can still be returned.
        let meta = goalPart + savingsMonthDay(t.date) + (t.pending ? " · clearing" : "")

        return HStack(alignment: .center, spacing: 11) {
            Ionicon(icon, size: 14, color: inbound ? c.success : c.gold)
                .frame(width: 30, height: 30)
                .background(rnRect(Radius.cellSm).fill(inbound ? c.successBg : c.goldSoft))

            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.ezer(FontFamily.bold, 13.5))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                Text(meta)
                    .font(.ezer(FontFamily.regular, 11.5))
                    .foregroundStyle(c.mut2)
                    .lineLimit(1)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text((inbound ? "+" : "−") + formatCents(savingsDollarsToCents(t.amountDollars)))
                .font(.ezer(FontFamily.bold, 13.5))
                .foregroundStyle(inbound ? c.success : c.red)
                .opacity(t.pending ? 0.6 : 1)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .layoutPriority(1)
        }
        .padding(.vertical, 12)
        // Hairline between rows only, so the card keeps one border.
        .savingsBorderTop(c.line, i > 0 ? 1 : 0)
    }
}

// Port of apps/mobile/app/screens/GoalDetail.tsx
//
// EZER — Goal detail
//
// Opened by tapping any goal. This is where a goal stops being a progress bar and becomes something
// you can operate: rename it, re-target it, switch automatic saving on or off for it, add money,
// withdraw to a bank account, move money to another goal, or close it out.
//
// There is no auto-save amount or cadence control, deliberately. The user says WHETHER this goal
// saves; the engine says how much, from their checking balance.
//
// It uses the SAME sheets as the Savings tab (MoveMoneySheet, GoalFormSheet) so a withdrawal cannot
// behave differently depending on where it started.
//
// RN `shortDate` is declared in the .tsx but never used, so it is not ported.

import SwiftUI

struct GoalDetailView: View {
    let id: String

    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var moveMode: SavingsMoveMode?
    @State private var editing = false

    var body: some View {
        let c = theme.colors
        let goals = savings.goals
        // A goal deleted from this very screen disappears one render before the router pops.
        // Rendering a "not found" card is calmer than crashing.
        if let goal = goals.first(where: { $0.id == id }) {
            found(goal, goals, c)
        } else {
            notFound(c)
        }
    }

    // MARK: - not found

    private func notFound(_ c: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SavingsPressable(hitSlop: 12, action: { router.back() }) {
                Ionicon("chevron-back", size: 20, color: c.ink)
                    .frame(width: 34, height: 34)
            }
            .padding(.leading, -6)

            Surface {
                BodyText("This goal is no longer here.")
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(20 + 1)
            }
            .padding(.top, 16)
        }
        .padding(.horizontal, Layout.screenX)
        .padding(.top, insets.top + 20)
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
    }

    // MARK: - found

    private func found(_ goal: SavingsGoal, _ goals: [SavingsGoal], _ c: ThemeColors) -> some View {
        ScrollView(.vertical) {
            ScreenBody {
                content(goal, goals, c)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, 48)
        }
        .scrollIndicators(.hidden)
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
        .background {
            MoveMoneySheet(visible: moveMode != nil, mode: moveMode ?? .add, goalId: goal.id, onClose: { moveMode = nil })
            GoalFormSheet(visible: editing, goal: goal, onClose: { editing = false })
        }
    }

    @ViewBuilder
    private func content(_ goal: SavingsGoal, _ goals: [SavingsGoal], _ c: ThemeColors) -> some View {
        let autoSave = savings.autoSave
        let preview = savings.preview
        let history = savings.transactionsForGoal(goal.id)

        // Money that has come INTO this goal, however it arrived. Sweeps and manual deposits are
        // indistinguishable on the wire, so this counts both rather than claiming a split.
        let paidInHere = Double(history.filter { $0.type != .withdraw }.reduce(0) { $0 + jsRound($1.amountDollars * 100) }) / 100

        let pctRaw = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0
        let pct = Int(min(100, jsRound(pctRaw * 100)))
        let funded = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount
        let remaining = max(0, goal.targetAmount - goal.currentAmount)
        let ringColor = funded ? c.success : Color(css: goal.color)

        // Goals share each run in proportion to what they still need, so this goal's share of the
        // next sweep is its share of the total remaining need.
        let activeGoals = goals.filter { $0.autoSave && $0.currentAmount < $0.targetAmount }
        let totalNeed = activeGoals.reduce(0) { $0 + ($1.targetAmount - $1.currentAmount) }
        let shareOfNext = goal.autoSave && !funded && totalNeed > 0 && preview.amountDollars > 0
            ? (remaining / totalNeed) * preview.amountDollars
            : 0

        let autoCopy: String = {
            if !goal.autoSave { return "Turn this on and we decide what you can spare and move it here." }
            if funded { return "This goal is funded, so spare money goes to your other goals." }
            if shareOfNext > 0 {
                return "About \(formatCents(savingsDollarsToCents(shareOfNext))) of this week's save should land here."
            }
            return preview.explanation.isEmpty ? "Nothing spare right now. We check again each week." : preview.explanation
        }()

        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 0) {
                SavingsPressable(hitSlop: 12, action: { router.back() }) {
                    Ionicon("chevron-back", size: 20, color: c.ink)
                        .frame(width: 34, height: 34)
                }
                .padding(.leading, -6)
                Spacer(minLength: 0)
                SavingsPressable(hitSlop: 12, action: { editing = true }) {
                    HStack(alignment: .center, spacing: 5) {
                        Ionicon("create-outline", size: 15, color: c.accInk)
                        Text("Edit").font(.ezer(FontFamily.semibold, 13)).foregroundStyle(c.accInk)
                    }
                }
            }

            // --- hero: ring carries the progress, so no bar is needed ---
            Surface(radius: Radius.hero) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 16) {
                        ProgressRing(progress: pctRaw, size: 76, stroke: 6, color: ringColor, trackColor: c.line) {
                            Ionicon(goal.icon, size: 26, color: ringColor)
                        }

                        VStack(alignment: .leading, spacing: 0) {
                            Text(goal.name)
                                .typeStyle(TypeScale.sectionHeader)
                                .foregroundStyle(c.ink)
                                .lineLimit(2)
                            Text(formatCents(savingsDollarsToCents(goal.currentAmount)))
                                .typeStyle(TypeScale.totalValueSm)
                                .foregroundStyle(c.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.5)
                                .padding(.top, 2)
                            Text("\(pct)% of \(formatCents(savingsDollarsToCents(goal.targetAmount)))"
                                + (funded ? "" : " · \(formatCents(savingsDollarsToCents(remaining))) to go"))
                                .font(.ezer(FontFamily.regular, 12))
                                .foregroundStyle(c.mut)
                                .lineLimit(1)
                                .padding(.top, 4)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if funded {
                        HStack(alignment: .center, spacing: 7) {
                            Ionicon("checkmark-circle", size: 14, color: c.success)
                            Text("Target reached — automatic saving has moved on to your other goals")
                                .font(.ezer(FontFamily.medium, 11.5))
                                .foregroundStyle(c.success)
                                .rnLineHeight(16, family: FontFamily.medium, size: 11.5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 9)
                        .background(rnRect(Radius.chip).fill(c.successBg))
                        .padding(.top, 14)
                    }

                    HStack(alignment: .top, spacing: 8) {
                        SavingsActionButton(icon: "add", iconSize: 16, title: "Add", primary: true) {
                            moveMode = .add
                        }
                        SavingsActionButton(icon: "arrow-up", iconSize: 15, title: "Withdraw", disabled: goal.currentAmount <= 0) {
                            moveMode = .withdraw
                        }
                        SavingsActionButton(icon: "swap-horizontal", iconSize: 15, title: "Move", disabled: goals.count < 2 || goal.currentAmount <= 0) {
                            moveMode = .move
                        }
                    }
                    .padding(.top, 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18 + 1)
            }
            .padding(.top, 12)

            // --- automatic saving ---
            SectionHeader("Automatic saving")
                .padding(.top, 26)
                .padding(.bottom, 10)

            Surface {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 12) {
                        Ionicon(goal.autoSave ? "sparkles" : "pause", size: 16, color: goal.autoSave ? c.success : c.mut2)
                            .frame(width: 34, height: 34)
                            .background(rnRect(Radius.cellSm).fill(goal.autoSave ? c.successBg : c.bg2))

                        VStack(alignment: .leading, spacing: 0) {
                            Text(goal.autoSave ? "On for this goal" : "Off for this goal")
                                .typeStyle(TypeScale.cardTitle)
                                .foregroundStyle(c.ink)
                            BodyText(autoCopy)
                                .rnLineHeight(17, TypeScale.body)
                                .padding(.top, 3)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        RNSwitch(
                            isOn: Binding(
                                get: { goal.autoSave },
                                set: { v in Task { _ = await savings.setGoalAutoSave(goal.id, v) } }
                            ),
                            trackColorFalse: c.line,
                            trackColorTrue: c.accSoft,
                            thumbColor: goal.autoSave ? c.accInk : c.mut2
                        )
                        .fixedSize()
                    }

                    if paidInHere > 0 {
                        VStack(alignment: .leading, spacing: 3) {
                            Label("Paid in so far")
                            Text(formatCents(savingsDollarsToCents(paidInHere)))
                                .font(.ezer(FontFamily.bold, 17))
                                .foregroundStyle(c.success)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 12)
                        .savingsBorderTop(c.line)
                        .padding(.top, 14)
                    }

                    if !autoSave.enabled && goal.autoSave {
                        HStack(alignment: .center, spacing: 7) {
                            Ionicon("pause-circle", size: 14, color: c.gold)
                            Text("Automatic saving is paused for every goal. Resume it on the Savings tab.")
                                .font(.ezer(FontFamily.medium, 11.5))
                                .foregroundStyle(c.gold)
                                .rnLineHeight(16, family: FontFamily.medium, size: 11.5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 9)
                        .background(rnRect(Radius.chip).fill(c.goldSoft))
                        .padding(.top, 14)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16 + 1)
            }

            // --- reaching the goal ---
            // This card used to print the engine's inputs (balance, buffer, weekly cap, "Skipping").
            // What belongs here is the goal: is it growing on its own, and how much is left. The
            // controls live on the Savings tab, so this points there instead of duplicating them.
            SectionHeader("Reaching this goal")
                .padding(.top, 26)
                .padding(.bottom, 10)
            Surface {
                VStack(alignment: .leading, spacing: 10) {
                    BodyText(goal.autoSave
                        ? "This goal grows on its own. Every week we set aside whatever you can comfortably spare, and this goal takes a share of it based on how much it still needs — so it fills faster when you have room and pauses when you do not."
                        : "Automatic saving is off for this goal, so it only grows when you add money yourself.")
                        .rnLineHeight(18, TypeScale.body)

                    SavingsPressable(hitSlop: 8, action: { router.push("/(tabs)/savings") }) {
                        Text("Adjust automatic saving")
                            .typeStyle(TypeScale.cardTitle.size(14))
                            .foregroundStyle(c.accent)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.top, 2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16 + 1)
            }

            // --- activity ---
            SectionHeader("Activity")
                .padding(.top, 26)
                .padding(.bottom, 10)
            if !history.isEmpty {
                Surface {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(history.prefix(25).enumerated()), id: \.element.id) { i, t in
                            txRow(t, i, c)
                        }
                    }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 1)
                }
            } else {
                Surface {
                    BodyText("Nothing has moved in or out yet.")
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(20 + 1)
                }
            }

            SavingsPressable(action: { confirmDelete(goal) }) {
                HStack(alignment: .center, spacing: 7) {
                    Ionicon("trash-outline", size: 15, color: c.red)
                    Text("Close this goal").font(.ezer(FontFamily.semibold, 13)).foregroundStyle(c.red)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
            }
            .padding(.top, 26)
        }
    }

    // MARK: - close

    private func confirmDelete(_ goal: SavingsGoal) {
        // Closing is a server-side status change, and the API has no "close and sweep the balance
        // elsewhere" operation. Rather than invent one on the client, the user is asked to empty the
        // goal first.
        if goal.currentAmount > 0 {
            AppAlert.alert(
                "Move the money first",
                "\(goal.name) still holds \(formatCents(savingsDollarsToCents(goal.currentAmount))). Withdraw it or move it to another goal, then close this one."
            )
            return
        }

        AppAlert.alert("Close \(goal.name)?", "This goal is empty, so nothing moves.", [
            AlertButton("Cancel", style: .cancel),
            AlertButton("Close goal", style: .destructive) {
                Task {
                    let res = await savings.closeGoal(goal.id)
                    if !res.ok { AppAlert.alert("Could not close goal", res.error) } else { router.back() }
                }
            },
        ])
    }

    // MARK: - activity row

    private func txRow(_ t: SavingsTransaction, _ i: Int, _ c: ThemeColors) -> some View {
        let inbound = t.type != .withdraw
        let (title, icon): (String, String) = {
            switch t.type {
            case .transfer: return ("Money in", "arrow-down")
            case .withdraw: return ("Withdrawn to bank", "arrow-up")
            case .move: return ("Moved between goals", "swap-horizontal")
            }
        }()

        return HStack(alignment: .center, spacing: 11) {
            Ionicon(icon, size: 14, color: inbound ? c.success : c.gold)
                .frame(width: 30, height: 30)
                .background(rnRect(Radius.cellSm).fill(inbound ? c.successBg : c.goldSoft))

            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.ezer(FontFamily.bold, 13.5))
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                // toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                Text(formatDate(t.date) + (t.pending ? " · clearing" : ""))
                    .font(.ezer(FontFamily.regular, 11.5))
                    .foregroundStyle(c.mut2)
                    .lineLimit(1)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text((inbound ? "+" : "−") + formatCents(savingsDollarsToCents(t.amountDollars)))
                .font(.ezer(FontFamily.bold, 13.5))
                .foregroundStyle(inbound ? c.success : c.red)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .layoutPriority(1)
        }
        .padding(.vertical, 12)
        .savingsBorderTop(c.line, i > 0 ? 1 : 0)
    }
}

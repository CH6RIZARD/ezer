// Port of apps/mobile/app/screens/GoalDetail.tsx
//
// EZER — Goal (one standard goal)
//
// Opened by tapping a goal on the Savings tab: what it holds, how far it has to go, whether it saves
// on its own and what has moved in or out. Edit renames / re-targets it, Add / Withdraw / Move move
// money, and "Close this goal" closes it out.
//
// The owner's redesign has no mock of a standard goal (Oct 21 2026: "the goal UI for any individual
// saved goal is still old, not my redesign UI"), so this screen is composed from the handoff's own
// pieces, in the pool screen's visual language:
//   header, hero, Recent, legal line   "Savings Pool" (SubscriptionPoolView's styles, copied)
//   status tag, "Funded — nice work",  "SavingsTab" (the goal rows, and the TOTAL SAVED card's
//   Add / Withdraw / Move              row: MoneyActions, shared with the Savings tab)
//   the AUTOMATIC SAVING card          "Goal 1a" (AutoSaveCard, shared with GoalFormSheet)
// Every sentence is the old screen's (owner: "change logic, not wording").
//
// There is no auto-save amount or cadence control, deliberately. The user says WHETHER this goal
// saves; the engine says how much, from their checking balance.
//
// It uses the SAME sheets as the Savings tab (MoveMoneySheet, GoalFormSheet) so a withdrawal cannot
// behave differently depending on where it started.

import SwiftUI

private func goalMoney(_ dollars: Double) -> String { formatCents(savingsDollarsToCents(dollars)) }

struct GoalDetailView: View {
    let id: String

    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var moveMode: SavingsMoveMode?
    @State private var editing = false
    /// The goal's automatic saving is being switched: the card dims, ignores taps and the camera
    /// dove flies (the write ends in a full refresh).
    @State private var toggling = false

    var body: some View {
        let c = theme.colors
        let goals = savings.goals
        // A goal deleted from this very screen disappears one render before the router pops.
        // Rendering a "not found" card is calmer than crashing.
        if let goal = goals.first(where: { $0.id == id }) {
            found(goal, goals, c)
        } else {
            missing(c)
        }
    }

    // MARK: - pool pieces

    /// The pool header's 38pt round button (back, edit).
    private func roundButton(_ icon: String, _ size: CGFloat, _ label: String, _ c: ThemeColors, _ action: @escaping () -> Void) -> some View {
        SavingsPressable(hitSlop: 8, action: action) {
            Ionicon(icon, size: size, color: c.ink)
                .frame(width: 38, height: 38)
                .background(Circle().fill(c.card))
                .overlay(Circle().strokeBorder(c.line, lineWidth: 1))
        }
        .accessibilityLabel(label)
    }

    private func sectionTitle(_ s: String, _ c: ThemeColors) -> some View {
        Text(s)
            .font(.ezer(FontFamily.bold, 16.5))
            .foregroundStyle(c.ink)
            .padding(.top, 24)
            .padding(.bottom, 10)
    }

    private func eyebrow(_ c: ThemeColors) -> some View {
        Text("SAVED")
            .font(.ezer(FontFamily.semibold, 11)).tracking(0.5)
            .foregroundStyle(c.mut)
    }

    // MARK: - not loaded yet / not found

    /// Before the first load the pool screen's skeletons; after it, the goal is gone.
    private func missing(_ c: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                roundButton("chevron-back", 18, "Back", c) { router.back() }
                if !savings.hydrated { Skeleton(w: 160, h: 18) }
            }

            if savings.hydrated {
                Surface {
                    BodyText("This goal is no longer here.")
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(20 + 1)
                }
                .padding(.top, 16)
            } else {
                Surface(radius: Radius.hero) {
                    VStack(alignment: .leading, spacing: 0) {
                        eyebrow(c)
                        Skeleton(w: 160, h: 44, r: 12).padding(.top, 8).padding(.bottom, 4)
                        Skeleton(w: 150, h: 12).padding(.top, 4)
                        Skeleton(h: 8, r: 4).padding(.top, 14)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18 + 1)
                }
                .padding(.top, 16)

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(0..<2, id: \.self) { i in
                        Surface {
                            VStack(alignment: .leading, spacing: 10) {
                                Skeleton(w: i == 0 ? 170 : 120, h: 14)
                                Skeleton(w: 90, h: 10)
                            }
                            .padding(14)
                        }
                    }
                }
                .padding(.top, 24)
            }
        }
        .padding(.horizontal, Layout.screenX)
        .padding(.top, insets.top + 10)
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
            .padding(.bottom, insets.bottom + 48)
        }
        .scrollIndicators(.hidden)
        .cameraDove(toggling)
        .rnScreen()
        .background(c.bg.ignoresSafeArea())
        .background {
            MoveMoneySheet(visible: moveMode != nil, mode: moveMode ?? .add, goalId: goal.id, onClose: { moveMode = nil })
            GoalFormSheet(visible: editing, goal: goal, onClose: { editing = false })
        }
    }

    @ViewBuilder
    private func content(_ goal: SavingsGoal, _ goals: [SavingsGoal], _ c: ThemeColors) -> some View {
        let preview = savings.preview
        let history = savings.transactionsForGoal(goal.id)
        // The Savings tab's Pause: it stops every goal, whatever this goal's own switch says.
        let allPaused = !savings.autoSave.enabled

        // Money that has come INTO this goal, however it arrived. Sweeps and manual deposits are
        // indistinguishable on the wire, so this counts both rather than claiming a split.
        let paidInHere = Double(history.filter { $0.type != .withdraw }.reduce(0) { $0 + jsRound($1.amountDollars * 100) }) / 100

        let pctRaw = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0
        let pct = Int(min(100, jsRound(pctRaw * 100)))
        let funded = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount
        let remaining = max(0, goal.targetAmount - goal.currentAmount)

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
                return "About \(goalMoney(shareOfNext)) of this week's save should land here."
            }
            return preview.explanation.isEmpty ? "Nothing spare right now. We check again each week." : preview.explanation
        }()

        // The pool's tag: AUTO while this goal fills on its own, FUNDED once it reaches its target.
        let tag: (text: String, icon: String?) = funded
            ? ("FUNDED", "checkmark")
            : goal.autoSave && !allPaused ? ("AUTO", "sparkles") : ("PAUSED", nil)

        VStack(alignment: .leading, spacing: 0) {
            // --- header ---
            HStack(alignment: .center, spacing: 12) {
                roundButton("chevron-back", 18, "Back", c) { router.back() }
                Text(goal.name)
                    .font(.ezer(FontFamily.bold, 21))
                    .tracking(-0.4)
                    .foregroundStyle(c.ink)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                HStack(spacing: 3) {
                    if let icon = tag.icon { Ionicon(icon, size: 10, color: c.success) }
                    Text(tag.text)
                        .font(.ezer(FontFamily.bold, 9)).tracking(0.5)
                        .foregroundStyle(tag.icon != nil ? c.success : c.mut2)
                }
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(rnRect(Radius.pill).fill(tag.icon != nil ? c.successBg : c.bg2))
                .fixedSize()
                roundButton("create-outline", 18, "Edit goal", c) { editing = true }
            }

            // --- hero ---
            Surface(radius: Radius.hero) {
                VStack(alignment: .leading, spacing: 0) {
                    eyebrow(c)
                    Text(goalMoney(goal.currentAmount))
                        .font(.ezer(FontFamily.serif, 44))
                        .foregroundStyle(c.success)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .padding(.top, 4)
                    Text(funded
                         ? "Funded — nice work"
                         : "\(pct)% of \(goalMoney(goal.targetAmount)) · \(goalMoney(remaining)) to go")
                        .font(.ezer(FontFamily.regular, 13))
                        .foregroundStyle(c.mut)
                        .padding(.top, 4)

                    GeometryReader { geo in
                        rnRect(4)
                            .fill(funded ? c.success : Color(css: goal.color))
                            .frame(width: geo.size.width * CGFloat(max(0, pct)) / 100)
                    }
                    .frame(height: 8)
                    .background(c.line)
                    .clipShape(rnRect(4))
                    .padding(.top, 14)

                    // Styled like SubscriptionDetail's "Added to Subscription savings" banner.
                    if funded {
                        Text("Target reached — automatic saving has moved on to your other goals")
                            .font(.ezer(FontFamily.semibold, 12.5))
                            .foregroundStyle(c.success)
                            .rnLineHeight(18, family: FontFamily.semibold, size: 12.5)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 13)
                            .padding(.horizontal, 14)
                            .background(rnRect(14).fill(c.successBg))
                            .padding(.top, 12)
                    }

                    // Move counts Subscription savings too: the sheet offers it.
                    MoneyActions(
                        dim: true,
                        withdrawDisabled: goal.currentAmount <= 0,
                        moveDisabled: savings.movableGoals.count < 2 || goal.currentAmount <= 0,
                        onPick: { moveMode = $0 }
                    )
                    .padding(.top, 16)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18 + 1)
            }
            .padding(.top, 16)

            // --- automatic saving ---
            sectionTitle("Automatic saving", c)
            AutoSaveCard(
                on: goal.autoSave,
                text: autoCopy,
                onToggle: { toggleAutoSave(goal) },
                footer: paidInHere > 0 ? paidIn(paidInHere, on: goal.autoSave, c) : nil
            )
            .opacity(toggling ? 0.55 : 1)
            .disabled(toggling)

            if allPaused && goal.autoSave {
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
                .padding(.top, 10)
            }

            // --- reaching the goal ---
            // What the goal does on its own, not the sweep's inputs (balance, buffer, weekly cap,
            // "Skipping"): those are the engine's vocabulary, and the controls that change them live
            // on the Savings tab, so this points there instead of duplicating them.
            Text(goal.autoSave
                 ? "This goal grows on its own. Every week we set aside whatever you can comfortably spare, and this goal takes a share of it based on how much it still needs — so it fills faster when you have room and pauses when you do not."
                 : "Automatic saving is off for this goal, so it only grows when you add money yourself.")
                .font(.ezer(FontFamily.regular, 12))
                .rnLineHeight(17, family: FontFamily.regular, size: 12)
                .foregroundStyle(c.mut2)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            SavingsPressable(hitSlop: 8, action: { router.push("/(tabs)/savings") }) {
                Text("Adjust automatic saving")
                    .font(.ezer(FontFamily.semibold, 12.5))
                    .foregroundStyle(c.accInk)
            }
            .padding(.top, 8)

            // --- recent ---
            sectionTitle("Recent", c)
            if history.isEmpty {
                BodyText("Nothing has moved in or out yet.")
                    .rnLineHeight(18, TypeScale.body)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(18 + 1)
                    .background(rnRect(18).fill(c.card))
                    .overlay(rnRect(18).strokeBorder(c.line2, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            } else {
                Surface {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(history.prefix(25).enumerated()), id: \.element.id) { i, t in
                            txRow(t, i, c)
                        }
                    }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 1)
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
            .padding(.top, 24)

            Text("EZER is not a bank. Balances and transfers shown here are simulated while bank connections are being certified — no funds are held, promised or guaranteed.")
                .font(.ezer(FontFamily.regular, 10.5))
                .foregroundStyle(c.mut3)
                .rnLineHeight(16, family: FontFamily.regular, size: 10.5)
                .padding(.top, 24)
        }
    }

    /// "Paid in so far", in the automatic saving card's footer. On the purple the label takes the
    /// card's own white; the figure stays success green, as the old screen showed it.
    private func paidIn(_ dollars: Double, on: Bool, _ c: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label("Paid in so far", color: on ? Color(css: "rgba(255,255,255,.72)") : nil)
            Text(goalMoney(dollars))
                .font(.ezer(FontFamily.bold, 17))
                .foregroundStyle(c.success)
        }
    }

    private func toggleAutoSave(_ goal: SavingsGoal) {
        guard !toggling else { return }
        toggling = true
        Task {
            let res = await savings.setGoalAutoSave(goal.id, !goal.autoSave)
            toggling = false
            if !res.ok { AppAlert.alert("Could not change that", res.error) }
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
                "\(goal.name) still holds \(goalMoney(goal.currentAmount)). Withdraw it or move it to another goal, then close this one."
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

    // MARK: - recent row

    /// The pool screen's Recent row, filled from this goal's transfers.
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
                    .font(.ezer(FontFamily.bold, 13.5)).foregroundStyle(c.ink).lineLimit(1)
                // toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                Text(formatDate(t.date) + (t.pending ? " · clearing" : ""))
                    .font(.ezer(FontFamily.regular, 11.5)).foregroundStyle(c.mut2).lineLimit(1)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text((inbound ? "+" : "−") + goalMoney(t.amountDollars))
                .font(.ezer(FontFamily.bold, 13.5))
                .foregroundStyle(inbound ? c.success : c.red)
                .opacity(t.pending ? 0.6 : 1)
                .lineLimit(1)
        }
        .padding(.vertical, 12)
        .savingsBorderTop(c.line, i > 0 ? 1 : 0)
    }
}

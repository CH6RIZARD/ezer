// Port of apps/mobile/components/redesign/MoveMoneySheet.tsx
//
// EZER Redesign — Move money sheet
//
// One sheet for all three ways money moves, because they are the same gesture with a different
// destination: pick a source, pick a destination, type an amount, confirm.
//
//   add       linked bank account  →  goal
//   withdraw  goal                 →  linked bank account
//   move      goal                 →  goal
//
// Withdraw and Move also offer Subscription savings (`movableGoals`), like any goal. Add does not:
// the pool fills from charges.
//
// The goal detail screen opens the identical sheet — a withdrawal must not behave differently
// depending on which screen the user started from.
//
// Every action is a SERVER call, so the sheet has a genuine in-flight state and its ceilings come
// from the API's `withdrawable` figure rather than a local balance. Withdrawable is not the balance:
// money inside the ACH return window is real but not yet spendable, and the sheet says so rather
// than let the user hit a 409.
//
// RN structure -> Swift: the RN component is always mounted and renders a <Modal visible>; its
// fields reset on the OPEN transition. Here `MoveMoneySheet` presents `.rnModal` (transparent,
// animationType "slide") and the sheet's state lives in the presented content, which is created
// fresh on each open — the same reset, from the goals current at that moment.

import SwiftUI

/// RN `MoveMode`.
enum SavingsMoveMode: Hashable, Sendable { case add, withdraw, move }

/** Quick-amount chips. Round numbers cover most manual transfers in one tap. */
private let QUICK_AMOUNTS = [10, 25, 50, 100]

private struct MoveCopy {
    let title: String
    let cta: String
    let sourceLabel: String
    let destLabel: String
}

private func COPY(_ mode: SavingsMoveMode) -> MoveCopy {
    switch mode {
    case .add: return MoveCopy(title: "Add money", cta: "Transfer in", sourceLabel: "From account", destLabel: "To goal")
    case .withdraw: return MoveCopy(title: "Withdraw", cta: "Withdraw", sourceLabel: "From goal", destLabel: "To account")
    case .move: return MoveCopy(title: "Move money", cta: "Move", sourceLabel: "From goal", destLabel: "To goal")
    }
}

struct MoveMoneySheet: View {
    @Environment(SavingsGoalsStore.self) private var savings
    let visible: Bool
    let mode: SavingsMoveMode
    /** Goal the sheet opens on — the goal detail screen passes its own. */
    var goalId: String?
    let onClose: () -> Void

    init(visible: Bool, mode: SavingsMoveMode, goalId: String? = nil, onClose: @escaping () -> Void) {
        self.visible = visible
        self.mode = mode
        self.goalId = goalId
        self.onClose = onClose
    }

    var body: some View {
        let goals = mode == .add ? savings.goals : savings.movableGoals
        Color.clear
            .frame(width: 0, height: 0)
            .rnModal(isPresented: visible, animationType: .slide, onRequestClose: onClose) {
                MoveMoneyContent(mode: mode, goalId: goalId, openGoals: goals, onClose: onClose)
            }
    }
}

private struct MoveMoneyContent: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings

    let mode: SavingsMoveMode
    let onClose: () -> Void

    /// usePlaid() — its own hook state, as each RN call site had.
    @State private var plaid = PlaidLinkModel()
    @State private var selectedGoalId: String?
    @State private var destGoalId: String?
    @State private var amountText = ""
    @State private var submitError: String?
    @State private var busy = false
    @FocusState private var amountFocused: Bool

    /// The OPEN-transition reset: first = goalId ?? goals[0]; dest = first goal that isn't it.
    init(mode: SavingsMoveMode, goalId: String?, openGoals: [SavingsGoal], onClose: @escaping () -> Void) {
        self.mode = mode
        self.onClose = onClose
        let first = goalId ?? openGoals.first?.id
        _selectedGoalId = State(initialValue: first)
        _destGoalId = State(initialValue: openGoals.first { $0.id != first }?.id)
    }

    // MARK: derived (same order as the .tsx)

    private var goals: [SavingsGoal] { mode == .add ? savings.goals : savings.movableGoals }
    private var sourceGoal: SavingsGoal? { goals.first { $0.id == selectedGoalId } }
    private var destGoal: SavingsGoal? { goals.first { $0.id == destGoalId } }

    private var amountDollars: Double {
        let parsed = savingsJSNumber(amountText)
        return parsed.isFinite ? jsRound(parsed * 100) / 100 : 0
    }

    /**
     * The ceiling for this move. For `add` it is the checking balance. For the other two it is the
     * goal's WITHDRAWABLE figure, not its balance — the server refuses to release funds still inside
     * the ACH return window.
     */
    private var availableDollars: Double {
        mode == .add ? (savings.checkingBalance ?? 0) : (sourceGoal?.withdrawable ?? 0)
    }

    private var clearing: Double {
        guard mode != .add, let s = sourceGoal else { return 0 }
        return max(0, s.currentAmount - s.withdrawable)
    }

    private var availableLabel: String? {
        if mode == .add {
            guard let bal = savings.checkingBalance else { return "Link a bank account to transfer money in." }
            return "\(formatCents(savingsDollarsToCents(bal))) in \(savings.checkingLabel ?? "checking")"
        }
        guard let s = sourceGoal else { return nil }
        return "\(formatCents(savingsDollarsToCents(availableDollars))) available in \(s.name)"
    }

    /// Overdraft shows while typing, not only on submit.
    private var liveError: String? {
        guard amountDollars > availableDollars && amountDollars > 0 else { return nil }
        if mode == .add {
            return "Your checking account only has \(formatCents(savingsDollarsToCents(availableDollars))) available."
        }
        guard let s = sourceGoal else { return nil }
        return "\(formatCents(savingsDollarsToCents(availableDollars))) of \(s.name) is available right now."
    }

    private var error: String? { liveError ?? submitError }

    private var canSubmit: Bool {
        guard !busy, amountDollars > 0, liveError == nil, let s = sourceGoal else { return false }
        if mode == .move {
            guard let d = destGoal, d.id != s.id else { return false }
        }
        return mode != .add || savings.checkingBalance != nil
    }

    // MARK: actions

    private func submit() {
        guard let source = sourceGoal, !busy else { return }
        busy = true
        submitError = nil
        let amount = amountDollars
        let dest = destGoal
        Task {
            let result: MoveResult
            switch mode {
            case .add:
                result = await savings.depositToGoal(source.id, amount)
            case .withdraw:
                result = await savings.withdrawFromGoal(source.id, amount)
            case .move:
                guard let dest else {
                    submitError = "Choose a goal to move into."
                    busy = false
                    return
                }
                result = await savings.moveBetweenGoals(source.id, dest.id, amount)
            }
            busy = false
            if !result.ok {
                submitError = result.error
                return
            }
            onClose()
        }
    }

    private func linkBank() {
        // The context re-reads /plaid/balance on refresh, so a freshly linked account shows up
        // without this sheet tracking accounts itself.
        Task { await plaid.openPlaidLink(onSuccess: { _ in onClose() }) }
    }

    // MARK: render

    var body: some View {
        let c = theme.colors
        ZStack(alignment: .bottom) {
            SavingsPressable(action: { if !busy { onClose() } }) {
                c.scrim
            }
            .ignoresSafeArea()

            sheet(c)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .ignoresSafeArea(.container)
        }
        .onAppear { onNextRunLoop { amountFocused = true } }   // autoFocus
        .debugScreenCapture("sheet-move-money-\(mode)", active: true)
    }

    private func sheet(_ c: ThemeColors) -> some View {
        let copy = COPY(mode)
        let white = Color(css: "#FFFFFF")
        let shape = rnRect(topLeading: 26, topTrailing: 26)

        return VStack(alignment: .leading, spacing: 0) {
            rnRect(Radius.pill)
                .fill(c.line2)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 12)

            HStack(alignment: .center, spacing: 0) {
                Text(copy.title)
                    .typeStyle(TypeScale.sectionHeader)
                    .foregroundStyle(c.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                SavingsPressable(hitSlop: 12, disabled: busy, action: onClose) {
                    Ionicon("close", size: 20, color: c.mut)
                }
            }
            .padding(.bottom, 14)

            SavingsCappedScroll(maxHeight: 440) {
                scrollContent(c, copy)
            }

            PressScale(scaleTo: Motion.pressScale, disabled: !canSubmit, action: { submit() }) {
                ZStack {
                    Group {
                        Text(amountDollars > 0 ? "\(copy.cta) \(formatCents(savingsDollarsToCents(amountDollars)))" : copy.cta)
                            .font(.ezer(FontFamily.bold, 14.5))
                            .foregroundStyle(canSubmit ? white : c.mut2)
                    }
                    .cameraDove(busy)
                }
                .padding(.vertical, 15)
                .frame(maxWidth: .infinity, minHeight: Layout.hitTarget)
                .background(rnRect(Radius.button).fill(canSubmit ? c.accent : c.line))
            }
            .padding(.top, 14)
        }
        .padding(.horizontal, Layout.screenX + 1)
        .padding(.top, 10 + 1)
        .padding(.bottom, 34 + 1)
        .background(shape.fill(c.card))
        .overlay(shape.strokeBorder(c.line, lineWidth: 1))
    }

    @ViewBuilder
    private func scrollContent(_ c: ThemeColors, _ copy: MoveCopy) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // --- amount, first: it is what the user came to type ---
            HStack(alignment: .center, spacing: 6) {
                Text("$").font(.ezer(FontFamily.serif, 22)).foregroundStyle(c.mut)
                TextField(
                    "",
                    // Strip anything that is not a numeral or a dot: decimal-pad still admits locale
                    // separators on some keyboards.
                    text: Binding(get: { amountText }, set: { amountText = savingsStripAmount($0); submitError = nil }),
                    prompt: Text("0.00").foregroundStyle(c.mut2)
                )
                .font(.ezer(FontFamily.bold, 26))
                .foregroundStyle(c.ink)
                .keyboardType(.decimalPad)
                .focused($amountFocused)
                .disabled(busy)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)

                // MAX is a withdraw/move affordance. Offering it on `add` would invite emptying
                // checking into savings, the opposite of what the buffer exists to prevent.
                if mode != .add && availableDollars > 0 {
                    SavingsPressable(hitSlop: 8, action: {
                        amountText = String(format: "%.2f", availableDollars)
                        submitError = nil
                    }) {
                        Text("MAX").typeStyle(TypeScale.labelSm).foregroundStyle(c.gold)
                    }
                }
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 1)
            .background(rnRect(Radius.button).fill(c.bg2))
            .overlay(rnRect(Radius.button).strokeBorder(error != nil ? c.red : c.line, lineWidth: 1))

            HStack(alignment: .top, spacing: 8) {
                ForEach(QUICK_AMOUNTS, id: \.self) { q in
                    SavingsPressable(action: {
                        amountText = String(q)
                        submitError = nil
                    }) {
                        Text("$\(q)")
                            .font(.ezer(FontFamily.semibold, 13))
                            .foregroundStyle(c.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 9 + 1)
                            .background(rnRect(Radius.button).fill(c.bg2))
                            .overlay(rnRect(Radius.button).strokeBorder(c.line, lineWidth: 1))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 10)

            if let availableLabel {
                BodyText(availableLabel).padding(.top, 8)
            }

            // Explains the gap between balance and withdrawable.
            if clearing > 0 {
                BodyText("\(formatCents(savingsDollarsToCents(clearing))) more is still clearing and will be available in a few business days.", size: 11.5)
                    .padding(.top, 4)
            }

            // --- source ---
            Label(copy.sourceLabel).padding(.top, 18).padding(.bottom, 8)
            if mode == .add {
                accountRow(c)
            } else {
                goalPicker(c, selectedId: selectedGoalId, onSelect: { id in
                    selectedGoalId = id
                    if mode == .move && id == destGoalId {
                        destGoalId = goals.first { $0.id != id }?.id
                    }
                }, excludeId: nil, showAvailable: true)
            }

            // --- destination ---
            Label(copy.destLabel).padding(.top, 18).padding(.bottom, 8)
            switch mode {
            case .add:
                goalPicker(c, selectedId: selectedGoalId, onSelect: { selectedGoalId = $0 }, excludeId: nil, showAvailable: false)
            case .withdraw:
                accountRow(c)
            case .move:
                if goals.count > 1 {
                    goalPicker(c, selectedId: destGoalId, onSelect: { destGoalId = $0 }, excludeId: selectedGoalId, showAvailable: false)
                } else {
                    Surface {
                        BodyText("Create a second goal to move money between goals.")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14 + 1)
                    }
                }
            }

            if let error {
                Text(error)
                    .font(.ezer(FontFamily.medium, 12))
                    .foregroundStyle(c.red)
                    .padding(.top, 12)
            }

            // Standard-ACH expectation, set before the tap rather than after.
            if mode != .move {
                BodyText(
                    mode == .add
                        ? "Standard transfers take 1–3 business days to clear, and become available to withdraw once they do."
                        : "Standard transfers land in \(savings.checkingLabel ?? "your account") within 1–3 business days. No fee.",
                    size: 11.5
                )
                .padding(.top, 10)
            }
        }
    }

    // MARK: pickers

    private func goalPicker(
        _ c: ThemeColors,
        selectedId: String?,
        onSelect: @escaping (String) -> Void,
        excludeId: String?,
        /** Show the withdrawable figure rather than the balance. */
        showAvailable: Bool
    ) -> some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 8) {
                ForEach(goals.filter { $0.id != excludeId }) { g in
                    let active = g.id == selectedId
                    SavingsPressable(action: {
                        onSelect(g.id)
                        submitError = nil
                    }) {
                        VStack(alignment: .leading, spacing: 4) {
                            Ionicon(g.icon, size: 15, color: Color(css: g.color))
                                .frame(width: 26, height: 26)
                                .background(rnRect(Radius.cellSm).fill(Color(css: g.color + "22")))
                            Text(g.name)
                                .font(.ezer(FontFamily.semibold, 13))
                                .foregroundStyle(c.ink)
                                .lineLimit(1)
                            Text(formatCents(savingsDollarsToCents(showAvailable ? g.withdrawable : g.currentAmount)))
                                .font(.ezer(FontFamily.regular, 11.5))
                                .foregroundStyle(c.mut2)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(11 + 1)
                        .frame(width: 132)
                        .background(rnRect(Radius.chip).fill(active ? c.accSoft : c.bg2))
                        .overlay(rnRect(Radius.chip).strokeBorder(active ? c.accInk : c.line, lineWidth: 1))
                    }
                }
            }
            .padding(.trailing, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func accountRow(_ c: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let label = savings.checkingLabel, !label.isEmpty {
                HStack(alignment: .center, spacing: 11) {
                    Ionicon("business", size: 15, color: c.accInk)
                        .frame(width: 26, height: 26)
                        .background(rnRect(Radius.cellSm).fill(c.card))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(label)
                            .font(.ezer(FontFamily.semibold, 13))
                            .foregroundStyle(c.ink)
                            .lineLimit(1)
                        if let bal = savings.checkingBalance {
                            Text("\(formatCents(savingsDollarsToCents(bal))) available")
                                .font(.ezer(FontFamily.regular, 11.5))
                                .foregroundStyle(c.mut2)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Ionicon("checkmark-circle", size: 18, color: c.accInk)
                }
                .padding(11 + 1)
                .background(rnRect(Radius.chip).fill(c.bg2))
                .overlay(rnRect(Radius.chip).strokeBorder(c.line, lineWidth: 1))
            } else {
                // TODO(native): Plaid LinkKit is not linked (Core/Plaid.swift); openPlaidLink shows the
                // in-app "Bank Linking" alert instead of opening Link.
                SavingsPressable(disabled: plaid.isLoading, action: { linkBank() }) {
                    HStack(alignment: .center, spacing: 7) {
                        Ionicon("add-circle-outline", size: 16, color: c.accInk)
                        Text(plaid.isLoading ? "Opening Plaid…" : "Link a bank account")
                            .font(.ezer(FontFamily.semibold, 13))
                            .foregroundStyle(c.accInk)
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

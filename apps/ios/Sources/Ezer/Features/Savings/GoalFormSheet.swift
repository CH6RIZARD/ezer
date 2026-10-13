// Port of apps/mobile/components/redesign/GoalFormSheet.tsx
//
// EZER Redesign — Goal form sheet
//
// Create a goal, or edit one that exists. Same sheet either way: the fields are identical, and one
// component means a field added to creation cannot go missing from editing.
//
// There is NO auto-save amount or cadence here, by design. The user chooses whether a goal saves
// automatically; the SERVER's engine decides how much. Putting an amount field back would turn the
// feature into the standing order it exists to replace.
//
// `currentAmount` is not editable either. Balances only change through the ledger, so every dollar
// in a goal has a transaction explaining how it got there.
//
// RN structure -> Swift: as in MoveMoneySheet.swift, `.rnModal` (transparent, "slide") presents the
// sheet, and its fields live in the presented content, populated from `goal` when it opens (the
// RN "populate on the OPEN transition" effect), so a sweep landing mid-edit can't reset them.
// KeyboardAvoidingView (padding): the sheet ignores only the container safe area, so SwiftUI lifts
// it above the keyboard.

import SwiftUI

/** Icon set kept small on purpose — a 40-glyph grid is a chore, not a choice. */
private let ICON_CHOICES = [
    "shield-checkmark",
    "airplane",
    "home",
    "car-sport",
    "school",
    "gift",
    "heart",
    "laptop",
    "medkit",
    "flag",
]

/** Targets people actually type, offered as one tap each. */
private let TARGET_PRESETS = [500, 1000, 2500, 5000]

/// `p.toLocaleString('en-US')` -> "1,000".
private let enUSInteger: NumberFormatter = {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "en_US")
    f.numberStyle = .decimal
    return f
}()

/// JS `String(n)` for a dollar figure: 500 -> "500", 12.5 -> "12.5".
private func goalFormJSString(_ n: Double) -> String {
    if n.isFinite && n == n.rounded() && abs(n) < 1e15 { return String(Int64(n)) }
    return "\(n)"
}

struct GoalFormSheet: View {
    @Environment(ThemeStore.self) private var theme
    let visible: Bool
    /** Goal being edited; omit to create a new one. */
    var goal: SavingsGoal?
    let onClose: () -> Void
    var onCreated: ((String) -> Void)?

    init(visible: Bool, goal: SavingsGoal? = nil, onClose: @escaping () -> Void, onCreated: ((String) -> Void)? = nil) {
        self.visible = visible
        self.goal = goal
        self.onClose = onClose
        self.onCreated = onCreated
    }

    var body: some View {
        let accInk = theme.tokens.accInk
        Color.clear
            .frame(width: 0, height: 0)
            .rnModal(isPresented: visible, animationType: .slide, onRequestClose: onClose) {
                GoalFormContent(goal: goal, accInk: accInk, onClose: onClose, onCreated: onCreated)
            }
    }
}

private struct GoalFormContent: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings

    let goal: SavingsGoal?
    let onClose: () -> Void
    let onCreated: ((String) -> Void)?

    @State private var busy = false
    @State private var name: String
    @State private var targetText: String
    @State private var icon: String
    /// CSS colour string (palette entries are compared as strings, as in RN).
    @State private var color: String
    @State private var autoSave: Bool
    @State private var error: String?

    private var isEdit: Bool { goal != nil }

    /// Populate on the OPEN transition.
    init(goal: SavingsGoal?, accInk: String, onClose: @escaping () -> Void, onCreated: ((String) -> Void)?) {
        self.goal = goal
        self.onClose = onClose
        self.onCreated = onCreated
        _name = State(initialValue: goal?.name ?? "")
        _targetText = State(initialValue: goal.map { goalFormJSString($0.targetAmount) } ?? "")
        _icon = State(initialValue: goal?.icon ?? ICON_CHOICES[0])
        _color = State(initialValue: goal?.color ?? accInk)
        _autoSave = State(initialValue: goal.map { $0.autoSave } ?? true)
        _error = State(initialValue: nil)
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            error = "Give the goal a name."
            return
        }
        let targetAmount = savingsJSNumber(savingsStripAmount(targetText))
        if !targetAmount.isFinite || targetAmount <= 0 {
            error = "Set a target greater than $0.00."
            return
        }

        busy = true
        error = nil

        let goal = self.goal
        let icon = self.icon
        let color = self.color
        let autoSave = self.autoSave
        Task {
            // Every write goes to the server and the store re-reads afterwards. Nothing is applied
            // locally first: a goal that appears instantly and then vanishes when the request fails
            // is worse than a moment of latency.
            let res: MoveResult
            if let goal {
                res = await savings.updateGoal(goal.id, name: trimmed, targetAmount: targetAmount, icon: icon, color: color)
            } else {
                res = await savings.addGoal(NewGoalInput(name: trimmed, targetAmount: targetAmount, icon: icon, color: color, autoSave: autoSave))
            }

            // Auto-save is a separate status field server-side, so an edit that changed it needs its
            // own call. Skipped when nothing changed.
            if res.ok, let goal, goal.autoSave != autoSave {
                _ = await savings.setGoalAutoSave(goal.id, autoSave)
            }

            busy = false

            if !res.ok {
                error = res.error
                return
            }
            if goal == nil, let id = res.id { onCreated?(id) }
            onClose()
        }
    }

    // MARK: render

    var body: some View {
        let c = theme.colors
        ZStack(alignment: .bottom) {
            SavingsPressable(action: onClose) {
                c.scrim
            }
            .ignoresSafeArea()

            sheet(c)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .ignoresSafeArea(.container)
        }
        .debugScreenCapture(isEdit ? "sheet-goal-edit" : "sheet-goal-new", active: true)
    }

    private func sheet(_ c: ThemeColors) -> some View {
        let shape = rnRect(topLeading: 26, topTrailing: 26)

        return VStack(alignment: .leading, spacing: 0) {
            rnRect(Radius.pill)
                .fill(c.line2)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 12)

            HStack(alignment: .center, spacing: 0) {
                Text(isEdit ? "Edit goal" : "New goal")
                    .typeStyle(TypeScale.sectionHeader)
                    .foregroundStyle(c.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                SavingsPressable(hitSlop: 12, action: onClose) {
                    Ionicon("close", size: 20, color: c.mut)
                }
            }
            .padding(.bottom, 14)

            SavingsCappedScroll(maxHeight: 460) {
                fields(c)
            }

            PressScale(scaleTo: Motion.pressScale, disabled: busy, action: { save() }) {
                ZStack {
                    if busy {
                        RNActivityIndicator(color: c.mut)
                    } else {
                        Text(isEdit ? "Save changes" : "Create goal")
                            .font(.ezer(FontFamily.bold, 14.5))
                            .foregroundStyle(Color(css: "#FFFFFF"))
                    }
                }
                .padding(.vertical, 15)
                .frame(maxWidth: .infinity, minHeight: Layout.hitTarget)
                .background(rnRect(Radius.button).fill(busy ? c.line : c.accent))
            }
            .padding(.top, 14)
        }
        .padding(.horizontal, Layout.screenX + 1)
        .padding(.top, 10 + 1)
        .padding(.bottom, 34 + 1)
        .background(shape.fill(c.card))
        .overlay(shape.strokeBorder(c.line, lineWidth: 1))
    }

    private func fields(_ c: ThemeColors) -> some View {
        let tint = Color(css: color)
        let palette = [theme.tokens.accInk, theme.tokens.gold, theme.tokens.success, theme.tokens.red, "#2C4A8F"]

        return VStack(alignment: .leading, spacing: 0) {
            // --- identity: icon + name on one line ---
            HStack(alignment: .center, spacing: 11) {
                Ionicon(icon, size: 22, color: tint)
                    .frame(width: 46, height: 46)
                    .background(rnRect(Radius.cell).fill(Color(css: color + "22")))
                TextField(
                    "",
                    text: Binding(get: { name }, set: { name = String($0.prefix(40)); error = nil }),   // maxLength 40
                    prompt: Text("Emergency fund").foregroundStyle(c.mut2)
                )
                .font(.ezer(FontFamily.semibold, 15))
                .foregroundStyle(c.ink)
                .padding(.horizontal, 14 + 1)
                .padding(.vertical, 13 + 1)
                .background(rnRect(Radius.button).fill(c.bg2))
                .overlay(rnRect(Radius.button).strokeBorder(c.line, lineWidth: 1))
                .frame(maxWidth: .infinity)
            }

            Label("Target").padding(.top, 18).padding(.bottom, 8)
            HStack(alignment: .center, spacing: 6) {
                Text("$").font(.ezer(FontFamily.serif, 20)).foregroundStyle(c.mut)
                TextField(
                    "",
                    text: Binding(get: { targetText }, set: { targetText = savingsStripAmount($0); error = nil }),
                    prompt: Text("5,000").foregroundStyle(c.mut2)
                )
                .font(.ezer(FontFamily.bold, 20))
                .foregroundStyle(c.ink)
                .keyboardType(.decimalPad)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 1)
            .background(rnRect(Radius.button).fill(c.bg2))
            .overlay(rnRect(Radius.button).strokeBorder(c.line, lineWidth: 1))

            HStack(alignment: .top, spacing: 8) {
                ForEach(TARGET_PRESETS, id: \.self) { p in
                    SavingsPressable(action: {
                        targetText = String(p)
                        error = nil
                    }) {
                        Text("$\(enUSInteger.string(from: NSNumber(value: p)) ?? String(p))")
                            .font(.ezer(FontFamily.semibold, 12.5))
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

            Label("Icon").padding(.top, 18).padding(.bottom, 8)
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 8) {
                    ForEach(ICON_CHOICES, id: \.self) { ic in
                        let active = ic == icon
                        SavingsPressable(action: { icon = ic }) {
                            Ionicon(ic, size: 18, color: active ? tint : c.mut)
                                .frame(width: 44, height: 44)
                                .background(rnRect(Radius.chip).fill(active ? Color(css: color + "22") : c.bg2))
                                .overlay(rnRect(Radius.chip).strokeBorder(active ? tint : c.line, lineWidth: 1))
                        }
                    }
                }
            }
            .scrollIndicators(.hidden)

            Label("Colour").padding(.top, 18).padding(.bottom, 8)
            HStack(alignment: .top, spacing: 10) {
                ForEach(Array(palette.enumerated()), id: \.offset) { _, swatch in
                    SavingsPressable(action: { color = swatch }) {
                        ZStack {
                            if swatch == color {
                                Ionicon("checkmark", size: 14, color: Color(css: "#FFFFFF"))
                            }
                        }
                        .frame(width: 32, height: 32)
                        .background(rnRect(Radius.pill).fill(Color(css: swatch)))
                        .overlay(rnRect(Radius.pill).strokeBorder(swatch == color ? c.ink : Color(css: "transparent"), lineWidth: 2))
                    }
                }
            }

            // --- automatic saving: one switch, no numbers ---
            HStack(alignment: .center, spacing: 11) {
                Ionicon("sparkles", size: 15, color: c.success)
                    .frame(width: 32, height: 32)
                    .background(rnRect(Radius.cellSm).fill(c.successBg))
                VStack(alignment: .leading, spacing: 0) {
                    Text("Save automatically")
                        .typeStyle(TypeScale.cardTitle)
                        .foregroundStyle(c.ink)
                    BodyText("We work out what you can spare from your checking balance and move it here. You never set an amount.")
                        .rnLineHeight(17, TypeScale.body)
                        .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                RNSwitch(
                    isOn: $autoSave,
                    trackColorFalse: c.line,
                    trackColorTrue: c.accSoft,
                    thumbColor: autoSave ? c.accInk : c.mut2
                )
                .fixedSize()
            }
            .padding(.top, 18)
            .savingsBorderTop(c.line)
            .padding(.top, 20)

            if let error {
                Text(error)
                    .font(.ezer(FontFamily.medium, 12))
                    .foregroundStyle(c.red)
                    .padding(.top, 12)
            }
        }
    }
}

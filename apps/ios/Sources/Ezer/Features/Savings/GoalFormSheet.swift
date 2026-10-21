// Port of apps/mobile/components/redesign/GoalFormSheet.tsx
//
// EZER Redesign — Goal form sheet ("Goal 1a — Centered amount" handoff)
//
// Create a goal, or edit one that exists. Same sheet either way: the fields are identical, and one
// component means a field added to creation cannot go missing from editing.
//
// Layout: the target leads, centred, with presets under it. The name field carries the "look" chip
// (icon + colour, one small picker). Auto-save is a full purple card with its own toggle; while the
// keyboard is up it shrinks to a chip, and Create docks above the decimal pad. Create stays disabled
// until there is a name and a target above $0.
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
// it above the keyboard. RN follows the keyboard's show/hide events; here a focused field IS the
// keyboard being up.

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

/// RN `commas`: "5000" -> "5,000" (digits only).
private func goalCommas(_ s: String) -> String {
    var out = ""
    for (i, ch) in s.enumerated() {
        if i > 0 && (s.count - i) % 3 == 0 { out.append(",") }
        out.append(ch)
    }
    return out
}

/// RN `showAmount`: raw "05000.5" -> "5,000.5" for the big display.
private func goalShowAmount(_ raw: String) -> String {
    if raw.isEmpty { return "" }
    let parts = raw.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
    var i = parts[0]
    while i.count > 1 && i.hasPrefix("0") { i.removeFirst() }
    let int = goalCommas(i.isEmpty ? "0" : i)
    return parts.count > 1 ? "\(int).\(parts[1])" : int
}

/// RN `cleanAmount`: digits, one dot, 7 whole digits, 2 decimals.
private func goalCleanAmount(_ t: String) -> String {
    let s = savingsStripAmount(t)
    guard let dot = s.firstIndex(of: ".") else {
        var int = s
        while int.count > 1 && int.hasPrefix("0") { int.removeFirst() }
        return String(int.prefix(7))
    }
    var int = String(s[..<dot])
    while int.count > 1 && int.hasPrefix("0") { int.removeFirst() }
    int = String(int.prefix(7))
    let dec = String(s[s.index(after: dot)...].filter { $0 != "." }.prefix(2))
    return "\(int.isEmpty ? "0" : int).\(dec)"
}

/// RN `fitSize`: shrink the serif figure so it never runs past `max` pt.
private func goalFitSize(_ txt: String, base: CGFloat = 96, max: CGFloat = 290) -> CGFloat {
    var w: CGFloat = 0
    for ch in txt { w += ch.isNumber ? 0.5 : 0.26 }
    w *= base
    return (w > max ? base * max / w : base).rounded()
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

private enum GoalField: Hashable { case amount, name }

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
    @State private var look = false
    @FocusState private var focus: GoalField?

    private var isEdit: Bool { goal != nil }
    private var kbUp: Bool { focus != nil }
    private var targetAmount: Double { savingsJSNumber(savingsStripAmount(targetText)) }
    private var ok: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && targetAmount.isFinite && targetAmount > 0
    }

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

    private func dismiss() {
        focus = nil
        look = false
    }

    private func save() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            error = "Give the goal a name."
            return
        }
        let targetAmount = self.targetAmount
        if !targetAmount.isFinite || targetAmount <= 0 {
            error = "Set a target greater than $0.00."
            return
        }

        dismiss()
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
        let shape = rnRect(topLeading: 28, topTrailing: 28)

        return VStack(alignment: .leading, spacing: 0) {
            rnRect(2)
                .fill(c.line2)
                .frame(width: 38, height: 4)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 10)

            HStack(alignment: .center, spacing: 0) {
                SavingsPressable(hitSlop: 6, action: onClose) {
                    Ionicon("close", size: 17, color: c.ink)
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(c.bg2))
                        .overlay(Circle().strokeBorder(c.line, lineWidth: 1))
                }
                Text(isEdit ? "Edit goal" : "New goal")
                    .font(.ezer(FontFamily.bold, 16.5))
                    .foregroundStyle(c.ink)
                    .frame(maxWidth: .infinity)
                Color.clear.frame(width: 38, height: 38)
            }

            amount(c)
            presets(c)
            nameField(c)
                .padding(.top, 26)
                .zIndex(1)

            if kbUp {
                autoChip(c)
            } else {
                autoCard(c).padding(.top, 16)
            }

            if let error {
                Text(error)
                    .font(.ezer(FontFamily.medium, 12))
                    .foregroundStyle(c.red)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 12)
            }

            createButton(c)
                .padding(.top, kbUp ? 12 : 20)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8 + 1)
        .padding(.bottom, kbUp ? 12 : 34)
        .contentShape(Rectangle())
        .onTapGesture { dismiss() }
        .background(shape.fill(c.card))
        // RN `borderTopWidth: 1` on a rounded sheet: the line follows the top corners only.
        .overlay(
            shape.strokeBorder(c.line, lineWidth: 1)
                .mask(alignment: .top) { Rectangle().frame(height: 28) }
        )
    }

    // --- target: centred serif figure; an off-screen decimal-pad field takes the typing ---
    private func amount(_ c: ThemeColors) -> some View {
        let shown = goalShowAmount(targetText).isEmpty ? "0" : goalShowAmount(targetText)
        return VStack(spacing: 0) {
            Text("TARGET")
                .font(.ezer(FontFamily.semibold, 11))
                .tracking(0.5)
                .foregroundStyle(c.mut)
                .frame(maxWidth: .infinity)
                .padding(.top, 22)

            HStack(alignment: .center, spacing: 0) {
                Text("$")
                    .font(.ezer(FontFamily.serif, 44))
                    .foregroundStyle(c.mut2)
                    .padding(.trailing, 4)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 14)
                Text(shown)
                    .font(.ezer(FontFamily.serif, goalFitSize(shown)))
                    .tracking(-1)
                    .lineLimit(1)
                    .foregroundStyle(targetText.isEmpty ? c.mut2 : c.ink)
                if focus == .amount {
                    TimelineView(.periodic(from: .now, by: 0.53)) { ctx in
                        rnRect(2)
                            .fill(c.accInk)
                            .frame(width: 3, height: 72)
                            .opacity(Int(ctx.date.timeIntervalSinceReferenceDate / 0.53) % 2 == 0 ? 1 : 0)
                    }
                    .padding(.leading, 4)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: 100)
            .background(
                TextField(
                    "",
                    text: Binding(get: { targetText }, set: { targetText = goalCleanAmount($0); error = nil })
                )
                .keyboardType(.decimalPad)
                .focused($focus, equals: .amount)
                .opacity(0.02)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
                .accessibilityLabel("Target amount")
            )
            .contentShape(Rectangle())
            .onTapGesture {
                look = false
                focus = .amount
            }
            .padding(.top, 6)
        }
    }

    private func presets(_ c: ThemeColors) -> some View {
        HStack(spacing: 8) {
            ForEach(TARGET_PRESETS, id: \.self) { p in
                let active = targetAmount == Double(p)
                SavingsPressable(action: {
                    targetText = String(p)
                    error = nil
                }) {
                    Text("$\(enUSInteger.string(from: NSNumber(value: p)) ?? String(p))")
                        .font(.ezer(FontFamily.semibold, 12.5))
                        .foregroundStyle(active ? c.accInk : c.mut)
                        .padding(.horizontal, 14 + 1)
                        .frame(height: 34)
                        .background(Capsule().fill(active ? c.accSoft : Color.clear))
                        .overlay(Capsule().strokeBorder(active ? Color(css: theme.tokens.accInk + "59") : c.line, lineWidth: 1))
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 14)
    }

    // --- name, carrying the look chip; the picker floats under it ---
    private func nameField(_ c: ThemeColors) -> some View {
        let tint = Color(css: color)
        return HStack(alignment: .center, spacing: 12) {
            SavingsPressable(action: {
                focus = nil
                look.toggle()
            }) {
                Ionicon(icon, size: 21, color: tint)
                    .frame(width: 44, height: 44)
                    .background(rnRect(13).fill(Color(css: color + "22")))
                    .overlay(rnRect(13).strokeBorder(Color(css: color + "66"), lineWidth: 1))
                    .overlay(alignment: .bottomTrailing) {
                        Ionicon("chevron-down", size: 9, color: c.ink)
                            .frame(width: 18, height: 18)
                            .background(Circle().fill(c.line2))
                            .overlay(Circle().strokeBorder(c.bg2, lineWidth: 2))
                            .offset(x: 5, y: 5)
                    }
            }
            .accessibilityLabel("Icon and colour")

            VStack(alignment: .leading, spacing: 2) {
                Text("NAME")
                    .font(.ezer(FontFamily.semibold, 10))
                    .tracking(0.5)
                    .foregroundStyle(c.mut2)
                TextField(
                    "",
                    text: Binding(get: { name }, set: { name = String($0.prefix(40)); error = nil }),   // maxLength 40
                    prompt: Text("Emergency fund").foregroundStyle(c.mut2)
                )
                .font(.ezer(FontFamily.semibold, 17))
                .foregroundStyle(c.ink)
                .tint(c.accInk)
                .autocorrectionDisabled()
                .focused($focus, equals: .name)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 7 + 1)
        .padding(.trailing, 14 + 1)
        .frame(height: 60)
        .background(rnRect(18).fill(c.bg2))
        .overlay(rnRect(18).strokeBorder(focus == .name ? Color(css: theme.tokens.accInk + "8C") : c.line, lineWidth: 1))
        .overlay(alignment: .topLeading) {
            if look { lookPicker(c).offset(y: 68) }
        }
        .onChange(of: focus) { _, f in if f != nil { look = false } }
    }

    private func lookPicker(_ c: ThemeColors) -> some View {
        let tint = Color(css: color)
        let palette = [theme.tokens.accInk, theme.tokens.gold, theme.tokens.success, theme.tokens.red, "#2C4A8F"]
        let cols = Array(repeating: GridItem(.fixed(44), spacing: 8), count: 5)

        return VStack(alignment: .leading, spacing: 0) {
            Text("ICON")
                .font(.ezer(FontFamily.semibold, 10))
                .tracking(0.5)
                .foregroundStyle(c.mut2)
                .padding(.bottom, 10)
            LazyVGrid(columns: cols, alignment: .leading, spacing: 8) {
                ForEach(ICON_CHOICES, id: \.self) { ic in
                    let active = ic == icon
                    SavingsPressable(action: { icon = ic }) {
                        Ionicon(ic, size: 19, color: active ? tint : c.mut)
                            .frame(width: 44, height: 44)
                            .background(rnRect(12).fill(active ? Color(css: color + "22") : Color.clear))
                            .overlay(rnRect(12).strokeBorder(active ? tint : c.line2, lineWidth: 1))
                    }
                }
            }
            .frame(width: 5 * 44 + 4 * 8, alignment: .leading)
            Rectangle().fill(c.line2).frame(height: 1).padding(.top, 14).padding(.bottom, 12)
            Text("COLOUR")
                .font(.ezer(FontFamily.semibold, 10))
                .tracking(0.5)
                .foregroundStyle(c.mut2)
                .padding(.bottom, 10)
            HStack(spacing: 12) {
                ForEach(Array(palette.enumerated()), id: \.offset) { _, swatch in
                    SavingsPressable(action: { color = swatch }) {
                        ZStack {
                            if swatch == color {
                                Ionicon("checkmark", size: 14, color: Color(css: "#FFFFFF"))
                            }
                        }
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color(css: swatch)))
                        .overlay(Circle().strokeBorder(swatch == color ? c.ink : Color.clear, lineWidth: 2))
                    }
                }
            }
        }
        .padding(14 + 1)
        .frame(width: 282, alignment: .leading)
        .background(rnRect(20).fill(c.bg2))
        .overlay(rnRect(20).strokeBorder(c.line2, lineWidth: 1))
        .rnShadow("#000000", opacity: 0.55, radius: 25, y: 24)
    }

    // --- automatic saving: a full card at rest ---
    private func autoCard(_ c: ThemeColors) -> some View {
        let on = autoSave
        let shape = rnRect(22)
        return SavingsPressable(action: { autoSave.toggle() }) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 9) {
                    Ionicon("sparkles", size: 15, color: on ? Color(css: "#FFFFFF") : c.mut)
                        .frame(width: 30, height: 30)
                        .background(rnRect(10).fill(on ? Color(css: "rgba(255,255,255,.14)") : c.card))
                    Text("AUTOMATIC SAVING")
                        .font(.ezer(FontFamily.semibold, 10))
                        .tracking(0.6)
                        .foregroundStyle(on ? Color(css: "rgba(255,255,255,.72)") : c.mut2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Capsule()
                        .fill(on ? c.accInk : Color(css: "rgba(255,255,255,.12)"))
                        .frame(width: 50, height: 30)
                        .overlay(alignment: .leading) {
                            Circle()
                                .fill(on ? Color(css: "#2A0F5C") : c.mut2)
                                .frame(width: 26, height: 26)
                                .rnShadow("#000000", opacity: 0.3, radius: 3, y: 2)
                                .offset(x: on ? 22 : 2)
                        }
                        .animation(.rn(.easeOut, 220), value: on)
                }
                Text("Save automatically")
                    .font(.ezer(FontFamily.serif, 28))
                    .rnLineHeight(31, family: FontFamily.serif, size: 28)
                    .foregroundStyle(on ? Color(css: "#FFFFFF") : c.ink)
                    .padding(.top, 12)
                Text("We work out what you can spare from your checking balance and move it here. You never set an amount.")
                    .font(.ezer(FontFamily.regular, 13))
                    .rnLineHeight(19, family: FontFamily.regular, size: 13)
                    .foregroundStyle(on ? Color(css: "rgba(255,255,255,.8)") : c.mut)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
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
            .overlay(shape.strokeBorder(on ? Color(css: theme.tokens.accInk + "2E") : c.line, lineWidth: 1))
        }
    }

    // --- ...and a chip while typing, so you still see it's on ---
    private func autoChip(_ c: ThemeColors) -> some View {
        let on = autoSave
        return SavingsPressable(action: { autoSave.toggle() }) {
            HStack(spacing: 8) {
                Ionicon("sparkles", size: 14, color: on ? c.accInk : c.mut)
                Text("Saves automatically · \(on ? "On" : "Off")")
                    .font(.ezer(FontFamily.semibold, 12.5))
                    .foregroundStyle(on ? c.accInk : c.mut)
                    .lineLimit(1)
            }
            .padding(.horizontal, 14)
            .frame(height: 34)
            .background(Capsule().fill(on ? c.accSoft : c.bg2))
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12)
    }

    private func createButton(_ c: ThemeColors) -> some View {
        PressScale(scaleTo: Motion.pressScale, disabled: busy || !ok, action: { save() }) {
            ZStack {
                Text(busy ? (isEdit ? "Saving…" : "Creating…") : (isEdit ? "Save changes" : "Create goal"))
                    .font(.ezer(FontFamily.bold, 15.5))
                    .foregroundStyle(ok ? Color(css: "#FFFFFF") : c.mut2)
                    .cameraDove(busy)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(
                Capsule().fill(
                    ok
                        ? LinearGradient.rn(ThemeKeys.ezer, start: UnitPoint(x: 0, y: 0.2), end: UnitPoint(x: 1, y: 0.8))
                        : LinearGradient.rn([c.line, c.line])
                )
            )
            .rnShadow("#6230B8", opacity: ok ? 0.7 : 0, radius: 15, y: 14)
            .opacity(busy ? 0.7 : 1)
        }
    }
}

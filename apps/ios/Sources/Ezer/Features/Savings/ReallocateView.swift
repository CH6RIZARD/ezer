// Port of apps/mobile/app/screens/Reallocate.tsx
//
// EZER Mobile App - Reallocate Screen
// Assign freed money to user's goals (from Saved tab) or other buckets.
//
// Registered route that nothing in the app links to (deep links only). Legacy styling: every Text
// here has no fontFamily, so it is the SYSTEM font; colours are the legacy aliases.

import SwiftUI

/** Selection is either a user goal id or a generic bucket (RN `ReallocateSelection`). */
private enum SavingsReallocateSelection: Equatable {
    case goal(String)
    case bucket(AllocationTarget)
}

private struct SavingsBucketOption {
    let value: AllocationTarget
    let label: String
    let description: String
}

private let BUCKET_OPTIONS: [SavingsBucketOption] = [
    SavingsBucketOption(value: .debt, label: "Debt", description: "Pay down credit cards or loans faster"),
    SavingsBucketOption(value: .investing, label: "Investing", description: "Grow your wealth over time"),
    SavingsBucketOption(value: .subscription, label: "Another Intentional Subscription", description: "Put towards a subscription you actually use"),
]

/// JS `parseInt(s, 10)`: optional leading whitespace and sign, then digits; NaN when there are none.
private func parseIntJS(_ s: String) -> Double {
    var rest = s.drop { $0.isWhitespace }
    var sign = 1.0
    if let f = rest.first, f == "+" || f == "-" {
        sign = f == "-" ? -1 : 1
        rest = rest.dropFirst()
    }
    let digits = rest.prefix { ("0"..."9").contains($0) }
    guard let v = Double(String(digits)) else { return .nan }
    return sign * v
}

struct ReallocateView: View {
    let merchantId: String?
    let amountCents: String?
    let billingInterval: String?

    @Environment(ThemeStore.self) private var theme
    @Environment(SavingsGoalsStore.self) private var savings
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var selected: SavingsReallocateSelection?

    /// parseInt(params.amountCents || '0', 10)
    private var cents: Double { parseIntJS((amountCents ?? "").isEmpty ? "0" : amountCents!) }
    /// params.billingInterval || 'monthly'
    private var interval: String { (billingInterval ?? "").isEmpty ? "monthly" : billingInterval! }

    private func handleCreateGoal() {
        // Nonce param pattern from payin4.tsx: the savings tab stays mounted, so a bare flag would only
        // open the sheet the first time ever.
        router.replace("/(tabs)/savings", ["create": "1", "t": String(Int(nowMs()))])
    }

    private func handleAssign() {
        guard let selected else {
            AppAlert.alert("Select an option", "Please choose where to allocate your freed money.")
            return
        }

        let amountStr = formatCents(cents)

        // A goal allocation is a REAL transfer, not a local note. It can fail, so the success alert
        // only fires once the server has actually taken it.
        switch selected {
        case let .goal(goalId):
            let goal = savings.goals.first { $0.id == goalId }
            Task {
                let res = await savings.depositToGoal(goalId, cents / 100)
                if !res.ok {
                    AppAlert.alert("Could not move that money", res.error)
                    return
                }
                AppAlert.alert(
                    "On its way",
                    "\(amountStr) → \(goal?.name ?? "your goal"). It will show as available once it clears.",
                    [AlertButton("OK") { router.replace("/(tabs)/savings") }]
                )
            }

        case let .bucket(value):
            // The other buckets are guidance, not transfers — there is nowhere to send the money.
            let targetLabel = BUCKET_OPTIONS.first { $0.value == value }?.label ?? value.rawValue
            AppAlert.alert(
                "Noted",
                "\(amountStr)/\(interval == "yearly" ? "yr" : "mo") earmarked for \(targetLabel).",
                [AlertButton("OK") { router.replace("/(tabs)/wallet") }]
            )
        }
    }

    private var intervalLabel: String {
        switch interval {
        case "yearly": return "year"
        case "weekly": return "week"
        default: return "month"
        }
    }

    var body: some View {
        let c = theme.colors
        let goals = savings.goals

        VStack(alignment: .leading, spacing: 0) {
            Button(action: { router.back() }) {
                Text("Back")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(c.text)
            }
            .buttonStyle(TouchableOpacityStyle())
            .padding(.horizontal, 24)
            .padding(.vertical, 12)

            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Reassign the freed money")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(c.text)
                        .padding(.bottom, 24)

                    VStack(alignment: .center, spacing: 0) {
                        Text("You're freeing up")
                            .font(.system(size: 14))
                            .foregroundStyle(c.textSecondary)
                            .padding(.bottom, 8)
                        Text("\(formatCents(cents))/\(intervalLabel)")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(c.success)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .padding(.bottom, 24)

                    // Your goals (from Saved tab)
                    if !goals.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            sectionTitle("Your goals", c)
                            VStack(alignment: .leading, spacing: 12) {
                                ForEach(goals) { goal in
                                    let sel = SavingsReallocateSelection.goal(goal.id)
                                    option(
                                        title: goal.name,
                                        // `$${goal.currentAmount.toFixed(2)} of $${goal.targetAmount.toFixed(2)}`
                                        detail: "$\(String(format: "%.2f", goal.currentAmount)) of $\(String(format: "%.2f", goal.targetAmount))",
                                        active: selected == sel,
                                        c
                                    ) { selected = sel }
                                }
                            }
                        }
                        .padding(.bottom, 20)
                    }

                    // Create a new goal
                    Button(action: { handleCreateGoal() }) {
                        HStack(alignment: .center, spacing: 0) {
                            Ionicon("add", size: 18, color: c.accent)
                                .frame(width: 24, height: 24)
                                .background(Circle().fill(c.background))
                                .padding(.trailing, 12)
                            Text("Create a new goal")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(c.accent)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16 + 2)
                        .background(rnRect(12).fill(c.card))
                        // borderStyle 'dashed': RN iOS dashes are 3 × borderWidth on, 3 × off.
                        .overlay(rnRect(12).strokeBorder(c.border, style: StrokeStyle(lineWidth: 2, dash: [6, 6])))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.7))
                    .padding(.bottom, 24)

                    // Other options
                    VStack(alignment: .leading, spacing: 0) {
                        sectionTitle("Other", c)
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(BUCKET_OPTIONS, id: \.value) { o in
                                let sel = SavingsReallocateSelection.bucket(o.value)
                                option(title: o.label, detail: o.description, active: selected == sel, c) { selected = sel }
                            }
                        }
                    }
                    .padding(.bottom, 32)

                    SavingsLegacyButton(title: "Assign", variant: .success, disabled: selected == nil, onPress: { handleAssign() })
                        .padding(.top, 8)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, insets.bottom + 24)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.top, insets.top)
        .rnScreen()
        .background(c.background.ignoresSafeArea())
    }

    private func sectionTitle(_ s: String, _ c: ThemeColors) -> some View {
        Text(s)
            .font(.system(size: 14, weight: .bold))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(c.textSecondary)
            .padding(.bottom, 12)
    }

    /// A goal / bucket row: radio + title + detail, accent border when selected (TouchableOpacity .7).
    private func option(title: String, detail: String, active: Bool, _ c: ThemeColors, onPress: @escaping () -> Void) -> some View {
        Button(action: onPress) {
            HStack(alignment: .top, spacing: 0) {
                ZStack {
                    if active {
                        Circle().fill(c.accent).frame(width: 12, height: 12)
                    }
                }
                .frame(width: 24, height: 24)
                .overlay(Circle().strokeBorder(active ? c.accent : c.textSecondary, lineWidth: 2))
                .padding(.top, 2)
                .padding(.trailing, 12)

                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(c.text)
                        .padding(.bottom, 4)
                    Text(detail)
                        .font(.system(size: 14))
                        .foregroundStyle(c.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(16 + 2)
            .background(rnRect(12).fill(c.card))
            .overlay(rnRect(12).strokeBorder(active ? c.accent : Color(css: "transparent"), lineWidth: 2))
            .contentShape(Rectangle())
        }
        .buttonStyle(TouchableOpacityStyle(activeOpacity: 0.7))
    }
}

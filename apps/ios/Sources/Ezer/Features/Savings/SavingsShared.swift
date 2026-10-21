// Port of the small pieces the Savings group's files share:
//   `const dollarsToCents = (d: number) => Math.round(d * 100);`   (savings.tsx, GoalDetail.tsx, MoveMoneySheet.tsx)
//   the hero action buttons (`actionSlot`/`actionBtn`/`actionText` in MoneyActions.tsx; the row is MoneyActions.swift)
//   JS Number() / toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) as the .tsx files use them.
//
// Yoga note used throughout this folder: an RN border takes layout space, and padding sits INSIDE it,
// so a 1pt-bordered box with `padding: 18` puts its children 19pt in. Foundation's Surface draws its
// border as an overlay, so every padding inside a bordered box here is written `N + 1`.

import SwiftUI

/** Goals store dollars; formatCents wants cents. One conversion, one place. */
func savingsDollarsToCents(_ d: Double) -> Double { jsRound(d * 100) }

private let savingsMonthDayFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US")
    f.setLocalizedDateFormatFromTemplate("MMMd")
    return f
}()

/// `d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` -> "Aug 2".
func savingsMonthDay(_ d: Date) -> String { savingsMonthDayFormatter.string(from: d) }

/// `s.replace(/[^0-9.]/g, '')`.
func savingsStripAmount(_ s: String) -> String {
    s.filter { $0 == "." || ("0"..."9").contains($0) }
}

/// JS `Number(s)` for a string already stripped to [0-9.]: '' -> 0, '5.' -> 5, '.5' -> 0.5,
/// '.' / '1.2.3' -> NaN.
func savingsJSNumber(_ s: String) -> Double {
    if s.isEmpty { return 0 }
    return Double(s) ?? .nan
}

// MARK: - Pressable

/**
 * RN `<Pressable onPress hitSlop={n} disabled>` with no style function: no visual feedback. The
 * whole box is tappable (RN hit-tests the view's frame, not its ink), and the slop sits inside
 * the label so the Button's own hit shape grows without changing layout.
 */
struct SavingsPressable<Content: View>: View {
    var hitSlop: CGFloat = 0
    var disabled = false
    let action: () -> Void
    let content: Content

    init(hitSlop: CGFloat = 0, disabled: Bool = false, action: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.hitSlop = hitSlop
        self.disabled = disabled
        self.action = action
        self.content = content()
    }

    var body: some View {
        Button(action: action) {
            content.contentShape(Rectangle()).hitSlop(hitSlop)
        }
        .buttonStyle(PlainPressStyle())
        .disabled(disabled)
    }
}

// MARK: - Borders and scroll

extension View {
    /// RN `borderTopWidth: w, borderTopColor: c`: the line takes layout space above the content.
    /// Apply it after the view's own paddingTop and before its marginTop.
    func savingsBorderTop(_ color: Color, _ width: CGFloat = 1) -> some View {
        self.padding(.top, width)
            .overlay(alignment: .top) { Rectangle().fill(color).frame(height: width) }
    }
}

/**
 * RN `<ScrollView style={{ maxHeight: N }} keyboardShouldPersistTaps="handled"
 * showsVerticalScrollIndicator={false}>` inside a sheet whose height follows its content: as tall
 * as the content up to N, scrolling beyond. SwiftUI's ScrollView is greedy, so the content is
 * measured. RN's keyboardDismissMode default is 'none'.
 */
struct SavingsCappedScroll<Content: View>: View {
    let maxHeight: CGFloat
    let content: Content
    @State private var contentHeight: CGFloat = 0

    init(maxHeight: CGFloat, @ViewBuilder content: () -> Content) {
        self.maxHeight = maxHeight
        self.content = content()
    }

    var body: some View {
        ScrollView(.vertical) {
            content
                .frame(maxWidth: .infinity, alignment: .leading)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
        }
        .scrollIndicators(.hidden)
        .scrollDismissesKeyboard(.never)
        .frame(maxHeight: min(contentHeight, maxHeight))
    }
}

// MARK: - Hero actions

/**
 * One of the hero's Add / Withdraw / Move buttons (drawn by MoneyActions, the one row both the Savings tab
 * and the goal screen use). MoneyActions.tsx declares the
 * styles: actionSlot { flex: 1 }; actionBtn { row, centre, gap 6, paddingV 12, paddingH 4,
 * radius.button, minHeight layout.hitTarget }; actionText { bold 13 }. `primary` is the accent
 * "Add" button (#FFFFFF ink); the others are bg2 with a 1pt `line` border and `ink`.
 */
struct SavingsActionButton: View {
    @Environment(ThemeStore.self) private var theme
    let icon: String
    let iconSize: CGFloat
    let title: String
    var primary = false
    var disabled = false
    let action: () -> Void

    var body: some View {
        let c = theme.colors
        let fg = primary ? Color(css: "#FFFFFF") : c.ink
        let border: CGFloat = primary ? 0 : 1
        PressScale(scaleTo: Motion.pressScaleStrong, disabled: disabled, action: action) {
            HStack(alignment: .center, spacing: 6) {
                Ionicon(icon, size: iconSize, color: fg)
                Text(title).font(.ezer(FontFamily.bold, 13)).foregroundStyle(fg)
            }
            .padding(.vertical, 12 + border)
            .padding(.horizontal, 4 + border)
            .frame(maxWidth: .infinity, minHeight: Layout.hitTarget)
            .background(rnRect(Radius.button).fill(primary ? c.accent : c.bg2))
            .overlay {
                if !primary { rnRect(Radius.button).strokeBorder(c.line, lineWidth: 1) }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

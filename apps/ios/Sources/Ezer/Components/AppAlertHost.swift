// Port of apps/mobile/components/AppAlertHost.tsx
//
// In-app replacement for the OS alert dialog. Every AppAlert.alert lands here:
//   · no buttons / one button -> a notice card at the top, in the app's own type and colours,
//     dismissed by a tap or after 5 s (slides from -24 and fades in over 220ms);
//   · two or more buttons     -> a bottom sheet over a rgba(0,0,0,0.45) scrim (the "Cut it" shape);
//     `destructive` fills red, `cancel` is the outline, others fill `accent` (flex 1 : 1.3).
// One at a time (queue). Drawn in its own window ABOVE the passcode lock (OverlayWindows).

import SwiftUI

private let NOTICE_MS: Double = 5000
private let BAD = "fail|could not|couldn|can't|cannot|error|invalid|wrong|denied|unable|not available|too many"

private func isBad(_ s: String?) -> Bool {
    guard let s else { return false }
    return s.range(of: BAD, options: [.regularExpression, .caseInsensitive]) != nil
}

struct AppAlertHost: View {
    @Environment(ThemeStore.self) private var theme
    private var center: AppAlertCenter { AppAlertCenter.shared }

    var body: some View {
        RNRoot {
            ZStack {
                if let current = center.current {
                    if current.buttons.count <= 1 {
                        NoticeCard(alert: current)
                            .id(current.id)
                    } else {
                        AlertSheet(alert: current)
                            .id("sheet")
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .ignoresSafeArea()
        }
        .preferredColorScheme(theme.isDark ? .dark : .light)
    }
}

private struct NoticeCard: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    let alert: AppAlertItem
    @State private var slide: Double = 0

    var body: some View {
        let c = theme.colors
        let bad = isBad(alert.title) || isBad(alert.message)
        VStack(spacing: 0) {
            Button {
                AppAlertCenter.shared.dismiss(alert, pressed: alert.buttons.first)
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Ionicon(bad ? "alert-circle" : "information-circle", size: 22, color: bad ? c.red : c.accInk)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(alert.title)
                            .font(.custom(FontFamily.bold, size: 15))
                            .foregroundStyle(c.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let m = alert.message, !m.isEmpty {
                            Text(m)
                                .font(.custom(FontFamily.regular, size: 13))
                                .foregroundStyle(c.mut)
                                .rnLineHeight(18, family: FontFamily.regular, size: 13)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 3)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .multilineTextAlignment(.leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())
            // RN: the 14 padding is on the card, outside the Pressable row.
            .padding(14)
            .background(RoundedRectangle(cornerRadius: Radius.card, style: .circular).fill(c.card))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .circular).strokeBorder(bad ? c.red : c.line, lineWidth: 1))
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { OverlayWindows.shared.noticeRect = $0 }
            .offset(y: -24 * (1 - slide))
            .opacity(slide)
            .padding(.horizontal, 14)
            .padding(.top, insets.top + 10)
            Spacer(minLength: 0)
        }
        .task(id: alert.id) {
            slide = 0
            withAnimation(.rn(.rnDefault, 220)) { slide = 1 }
            try? await Task.sleep(nanoseconds: UInt64(NOTICE_MS * 1_000_000))
            if !Task.isCancelled, AppAlertCenter.shared.current?.id == alert.id {
                AppAlertCenter.shared.dismiss(alert, pressed: alert.buttons.first)
            }
        }
    }
}

private struct AlertSheet: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    let alert: AppAlertItem
    @State private var shown = false

    var body: some View {
        let c = theme.colors
        let cancel = alert.buttons.first { $0.style == .cancel }
        let actions = alert.buttons.filter { $0.style != .cancel }
        ZStack(alignment: .bottom) {
            Color(css: "rgba(0,0,0,0.45)")
                .contentShape(Rectangle())
                .onTapGesture { AppAlertCenter.shared.dismiss(alert, pressed: cancel) }

            VStack(alignment: .leading, spacing: 0) {
                Capsule().fill(c.line2)
                    .frame(width: 44, height: 5)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 14)
                Text(alert.title)
                    .font(.custom(FontFamily.bold, size: 18))
                    .foregroundStyle(c.ink)
                if let m = alert.message, !m.isEmpty {
                    Text(m)
                        .font(.custom(FontFamily.regular, size: 14))
                        .foregroundStyle(c.mut)
                        .rnLineHeight(20, family: FontFamily.regular, size: 14)
                        .padding(.top, 8)
                }
                ButtonRow(cancel: cancel, actions: actions, alert: alert)
                    .padding(.top, 18)
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
            .padding(.bottom, insets.bottom + 20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .circular).fill(c.card))
            .overlay(UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26, style: .circular).strokeBorder(c.line, lineWidth: 1))
        }
        // Modal animationType="fade": the whole modal cross-dissolves in.
        .opacity(shown ? 1 : 0)
        .onAppear { withAnimation(.easeInOut(duration: 0.3)) { shown = true } }
    }
}

/// Buttons row: gap 8; cancel flex 1, actions flex 1.3 each (RN flexBasis 0 -> exact proportions).
private struct ButtonRow: View {
    @Environment(ThemeStore.self) private var theme
    let cancel: AlertButton?
    let actions: [AlertButton]
    let alert: AppAlertItem

    var body: some View {
        let c = theme.colors
        let flexes: [CGFloat] = (cancel != nil ? [1] : []) + actions.map { _ in 1.3 }
        GeometryReader { g in
            let gaps = CGFloat(max(0, flexes.count - 1)) * 8
            let unit = (g.size.width - gaps) / max(1, flexes.reduce(0, +))
            HStack(spacing: 8) {
                if let cancel {
                    Button { AppAlertCenter.shared.dismiss(alert, pressed: cancel) } label: {
                        Text(cancel.text)
                            .font(.custom(FontFamily.bold, size: 15))
                            .foregroundStyle(c.ink)
                            .frame(width: unit * 1, height: 50)
                            .overlay(Capsule().strokeBorder(c.line2, lineWidth: 1))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(PlainPressStyle())
                }
                ForEach(Array(actions.enumerated()), id: \.offset) { _, b in
                    Button { AppAlertCenter.shared.dismiss(alert, pressed: b) } label: {
                        Text(b.text)
                            .font(.custom(FontFamily.bold, size: 15))
                            .foregroundStyle(Color(css: "#FFFFFF"))
                            .frame(width: unit * 1.3, height: 50)
                            .background(Capsule().fill(b.style == .destructive ? c.red : c.accent))
                            .contentShape(Capsule())
                    }
                    .buttonStyle(PlainPressStyle())
                }
            }
        }
        .frame(height: 50)
    }
}

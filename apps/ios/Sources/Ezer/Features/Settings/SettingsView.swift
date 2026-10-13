// Port of apps/mobile/app/settings.tsx
//
// EZER Redesign — Settings (handoff §7)
//
// Appearance: one three-colour theme pill (Patch 4) — must re-theme every screen, calendar,
// popover and the tab bar, which it does by driving ThemeStore.setMode. Then Account, Linked
// banks, three gold notification toggles, and a red Sign out row.
//
// RN -> Swift notes:
//   · Bordered boxes: Yoga puts borderWidth inside the layout, so a Surface with padding N puts its
//     children N + 1 in. Foundation's Surface draws its border as an overlay, so paddings inside a
//     bordered box are written `N + 1` (same convention as the Savings/Wallet ports).
//   · ThemePill: FlexKey's Reanimated `flex` (1 -> 2) becomes each key's width share of the
//     trough; `raised` (0 -> 1) drives the 2px lift and the shadow cross-fade. Both run the same
//     350ms bezier(0.22, 1, 0.36, 1), as in RN.
//   · The code draws no checkmark and no label inside the pill (CLAUDE.md's "shows a checkmark"
//     is not in settings.tsx); the mode name sits right-aligned above the pill.
//   · The page's sections are split into helper functions only to keep SwiftUI's type-checker
//     fast; the order and spacing are settings.tsx's single column.

import SwiftUI

private let NOTIFS: [(key: String, title: String, sub: String)] = [
    (key: "renewals", title: "Renewal alerts", sub: "3 days before"),
    (key: "trials", title: "Trial warnings", sub: "Before a trial converts"),
    (key: "digest", title: "Weekly digest", sub: "Sunday"),
]

// Patch 4 (Appearance Toggle mock 2b, "raised key"). Shown names map onto the app's ThemeMode
// values ('light' | 'dark' | 'black', CLAUDE.md "three theme modes"): the purple-tinted 'dark'
// theme is "EZER" (owner wants it in caps), true 'black' is "Dark". Colours come from tokens
// (ThemeKeys).
private let THEME_KEYS: [(mode: ThemeMode, key: String, name: String, colors: [String])] = [
    (mode: .light, key: "light", name: "Light", colors: ThemeKeys.light),
    (mode: .dark, key: "ezer", name: "EZER", colors: ThemeKeys.ezer),
    (mode: .black, key: "dark", name: "Dark", colors: ThemeKeys.dark),
]
private let KEY_EASE: RNEasing = .bezier(0.22, 1, 0.36, 1)

/// A CSS `inset X Y BLUR COLOR` box-shadow string as SwiftUI's inner shadow (port map §1.4:
/// radius = blur / 2). Lengths may carry "px".
private func insetShadow(_ css: String) -> ShadowStyle {
    let parts = css.split(separator: " ").map(String.init)   // ["inset", "0", "2px", "4px", "rgba(…)"]
    let n = parts.dropFirst().prefix(3).map { CGFloat(Double($0.replacingOccurrences(of: "px", with: "")) ?? 0) }
    guard parts.count >= 5, n.count == 3 else { return .inner(color: .clear, radius: 0) }
    return .inner(color: Color(css: parts[4]), radius: n[2] / 2, x: n[0], y: n[1])
}

/// The three-key "raised key" theme pill. (RN's FlexKey — one key's animated flex — is the width
/// share each key gets below; flex is layout, so it is animated as the key's frame width.)
private struct ThemePill: View {
    let mode: ThemeMode
    let onChange: (ThemeMode) -> Void

    /// Per key: `flex` 1 -> 2 when active (FlexKey); `raised` 0 -> 1 drives the 2px lift AND the
    /// shadow cross-fade on the inner layers.
    @State private var flex: [Double]
    @State private var raised: [Double]

    init(mode: ThemeMode, onChange: @escaping (ThemeMode) -> Void) {
        self.mode = mode
        self.onChange = onChange
        _flex = State(initialValue: THEME_KEYS.map { $0.mode == mode ? 2 : 1 })
        _raised = State(initialValue: THEME_KEYS.map { $0.mode == mode ? 1 : 0 })
    }

    private func press(_ m: ThemeMode) {
        if m == mode { return }
        // A key press, so impactLight rather than selectionChanged.
        Haptics.impactLight()
        onChange(m)
    }

    var body: some View {
        let isLight = mode == .light
        let troughBg = Color(css: ThemeKeys.trough[mode.rawValue] ?? "")
        let troughInset = insetShadow((isLight ? ThemeKeys.troughInset["light"] : ThemeKeys.troughInset["dark"]) ?? "")

        // styles.trough: row, height 44, radius 999, padding 4, gap 3.
        GeometryReader { geo in
            let gaps = 3 * CGFloat(THEME_KEYS.count - 1)
            let avail = max(0, geo.size.width - gaps)
            let total = max(flex.reduce(0, +), 1)
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(THEME_KEYS.enumerated()), id: \.offset) { i, k in
                    key(i, k)
                        .frame(width: avail * CGFloat(flex[i] / total))
                        .frame(maxHeight: .infinity)
                }
            }
        }
        .padding(4)
        .frame(height: 44)
        .background(Capsule().fill(troughBg.shadow(troughInset)))
        .onChange(of: mode) { _, m in
            withAnimation(.rn(KEY_EASE, 350)) {
                flex = THEME_KEYS.map { $0.mode == m ? 2 : 1 }
                raised = THEME_KEYS.map { $0.mode == m ? 1 : 0 }
            }
        }
    }

    private func key(_ i: Int, _ k: (mode: ThemeMode, key: String, name: String, colors: [String])) -> some View {
        let on = k.mode == mode
        let r = raised[i]
        let face = LinearGradient.rn(k.colors)
        return Button { press(k.mode) } label: {
            // boxShadow itself can't be interpolated, so each key carries BOTH shadows on their own
            // layers and cross-fades them with the same 350ms `raised` value that lifts it: the sunk
            // inset shadow fades out while the glow (key's own colour) and 1px top highlight fade in.
            ZStack {
                // `0 4px 9px -2px glow`: an outer shadow of the face shrunk by the -2 spread. Its
                // shape sits wholly under the opaque face, so only the shadow shows.
                Capsule()
                    .inset(by: 2)
                    .fill(Color(css: "#000000"))
                    .shadow(color: Color(css: ThemeKeys.glow[k.key] ?? ""), radius: 9 / 2, x: 0, y: 4)
                    .opacity(r)
                Capsule().fill(face)
                // 'inset 0 1px 2px rgba(0,0,0,.25)', opacity 1 -> 0.
                Capsule()
                    .fill(face.shadow(insetShadow("inset 0 1px 2px rgba(0,0,0,.25)")))
                    .opacity(1 - r)
                    .allowsHitTesting(false)
                // 'inset 0 1px 0 rgba(255,255,255,.35)' (the glow layer's highlight), opacity 0 -> 1.
                Capsule()
                    .fill(face.shadow(insetShadow("inset 0 1px 0 rgba(255,255,255,.35)")))
                    .opacity(r)
                    .allowsHitTesting(false)
            }
            .offset(y: -2 * r)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            // hitSlop={{ top: 4, bottom: 4 }}
            .padding(.vertical, 4)
            .contentShape(Rectangle())
            .padding(.vertical, -4)
        }
        .buttonStyle(PlainPressStyle())
        .accessibilityLabel("\(k.name) theme")
        .accessibilityAddTraits(on ? [.isButton, .isSelected] : [.isButton])
    }
}

struct SettingsView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var notifs: [String: Bool] = [
        "renewals": true,
        "trials": true,
        "digest": false,
    ]
    // Server-gated until Google verifies gmail.readonly (routes/inbox.ts).
    @State private var inboxEnabled = false
    /// RN's effect ran once per mount; `.task` would re-run each time this screen re-appears.
    @State private var inboxChecked = false

    private func signOut() {
        Task {
            // Awaited: navigating first let the index screen see the still-signed-in session and
            // route to home.
            await auth.logout()
            router.replace("/")
        }
    }

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    header(colors)
                    appearance(colors)
                    account(colors)
                    banks(colors)
                    notifications(colors)
                    signOutRow(colors)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            // RN bounces={false} (overScrollMode="never" is Android-only).
            .rnNoBounce()
        }
        .scrollIndicators(.hidden)
        .background(colors.bg.ignoresSafeArea())
        .rnScreen()
        .task {
            if inboxChecked { return }
            inboxChecked = true
            // utils/inboxScan isInboxScanEnabled() (Features/Settings/InboxScan.swift).
            inboxEnabled = await isInboxScanEnabled()
        }
    }

    private func header(_ colors: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                Ionicon("chevron-back", size: 18, color: colors.ink)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(colors.card))
                    .overlay(Circle().strokeBorder(colors.line, lineWidth: 1))
            }
            Text("Settings")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(colors.ink)
                .padding(.leading, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// SectionHeader with styles.section (marginTop 24, marginBottom 10).
    private func section(_ title: String) -> some View {
        SectionHeader(title)
            .padding(.top, 24)
            .padding(.bottom, 10)
    }

    // --- appearance ---------------------------------------------------------------
    @ViewBuilder
    private func appearance(_ colors: ThemeColors) -> some View {
        section("Appearance")
        // Patch 4 (Appearance Toggle mock 1b): one three-colour pill.
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Spacer(minLength: 0)
            Text(THEME_KEYS.first { $0.mode == theme.mode }?.name ?? "")
                .font(.ezer(FontFamily.regular, 12))
                .foregroundStyle(colors.mut)
        }
        .padding(.bottom, 10)
        ThemePill(mode: theme.mode, onChange: { theme.setMode($0) })
    }

    // --- account ------------------------------------------------------------------
    @ViewBuilder
    private func account(_ colors: ThemeColors) -> some View {
        section("Account")
        Surface {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Email")
                    Text(auth.user?.email ?? "—")
                        .font(.ezer(FontFamily.semibold, 14))
                        .foregroundStyle(colors.ink)
                        .lineLimit(1)
                }
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
                Rectangle().fill(colors.line).frame(height: 1)
                VStack(alignment: .leading, spacing: 4) {
                    Label("Member since")
                    // Real signup date. This was hardcoded to "January 2023" for every user, on an
                    // account page — the one screen where a wrong fact is most obviously a lie.
                    Text(memberSince)
                        .font(.ezer(FontFamily.semibold, 14))
                        .foregroundStyle(colors.ink)
                }
                .padding(.vertical, 13)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 1)
        }

        // Data export and account deletion live on their own screen (AccountView) — it calls
        // GET /account/export and DELETE /account, and DELETE /account revokes every Plaid item
        // before erasing anything. Apple requires in-app account deletion for any app that
        // offers account creation (Guideline 5.1.1(v)).
        navRow(colors, icon: "person-outline", title: "Manage account",
               sub: "Download your data, or delete your account") {
            router.push("/settings/account")
        }
        .padding(.top, 10)
    }

    private var memberSince: String {
        guard let createdAt = auth.user?.createdAt, !createdAt.isEmpty else { return "—" }
        return settingsMonthYear(createdAt)
    }

    // --- linked banks (+ inbox) ---------------------------------------------------
    // Its OWN screen (LinkedBanksView), per the mock's 3a·1 — not inlined here. "Pay in 4 pays
    // from", the connected-banks list and "Connect a bank" all live on the far side of this tap.
    @ViewBuilder
    private func banks(_ colors: ThemeColors) -> some View {
        section("Banks")
        navRow(colors, icon: "card-outline", title: "Linked banks",
               sub: "Pay in 4's account, and every connected bank") {
            router.push("/settings/linked-banks")
        }

        if inboxEnabled {
            section("Inbox")
            navRow(colors, icon: "mail-outline", title: "Connect inbox",
                   sub: "Find subscriptions and trials from your receipts") {
                router.push("/settings/inbox")
            }
        }
    }

    // --- notifications ------------------------------------------------------------
    @ViewBuilder
    private func notifications(_ colors: ThemeColors) -> some View {
        section("Notifications")
        Surface {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(NOTIFS.enumerated()), id: \.offset) { i, n in
                    if i > 0 {
                        Rectangle().fill(colors.line).frame(height: 1)
                    }
                    notifRow(colors, key: n.key, title: n.title, sub: n.sub)
                }
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 1)
        }
    }

    private func notifRow(_ colors: ThemeColors, key: String, title: String, sub: String) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.ezer(FontFamily.semibold, 14))
                    .foregroundStyle(colors.ink)
                BodyText(sub)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            RNSwitch(
                isOn: Binding(
                    get: { notifs[key] ?? false },
                    set: { v in notifs[key] = v }
                ),
                trackColorFalse: colors.line2,
                trackColorTrue: colors.goldBg,
                thumbColor: Color(css: "#FFFFFF")
            )
            .fixedSize()
        }
        .padding(.vertical, 11)
    }

    // --- sign out -----------------------------------------------------------------
    private func signOutRow(_ colors: ThemeColors) -> some View {
        PressScale(action: signOut) {
            Surface {
                HStack(alignment: .center, spacing: 9) {
                    Ionicon("log-out-outline", size: 18, color: colors.red)
                    Text("Sign out")
                        .font(.ezer(FontFamily.bold, 14.5))
                        .foregroundStyle(colors.red)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15 + 1)
                .padding(.horizontal, 1)
            }
        }
        .padding(.top, 22)
    }

    /// styles.connectRow inside a PressScale (Manage account / Linked banks / Connect inbox).
    private func navRow(_ colors: ThemeColors, icon: String, title: String, sub: String, action: @escaping () -> Void) -> some View {
        PressScale(action: action) {
            Surface {
                HStack(alignment: .center, spacing: 12) {
                    // styles.connectIcon: 36×36, radius 18, accSoft.
                    Ionicon(icon, size: 19, color: colors.accInk)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(colors.accSoft))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(title)
                            .font(.ezer(FontFamily.semibold, 14))
                            .foregroundStyle(colors.ink)
                        BodyText(sub)
                            .padding(.top, 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Ionicon("chevron-forward", size: 16, color: colors.mut2)
                }
                .padding(.vertical, 14 + 1)
                .padding(.horizontal, 14 + 1)
            }
        }
    }
}

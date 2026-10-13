// Port of apps/mobile/app/settings/account.tsx
//
// EZER Mobile — Account
//
// Shows the signed-in user, and carries the two rights the published privacy policy promises are
// exercisable "from inside the app, without asking us" (COMPLIANCE-CRITICAL, CLAUDE.md):
//
//   · Download your data   → GET  /account/export   (the server strips passwordHash)
//   · Delete your account  → DELETE /account        (revokes every Plaid item upstream FIRST,
//                                                     server-side, then erases local rows)
//
// Apple also requires in-app account deletion for any app offering account creation (App Store
// Review Guideline 5.1.1(v)). Password change and 2FA are GONE rather than reimplemented: neither
// has a backend, and a control that reports success while doing nothing is worse than none.
//
// This file has no fontFamily anywhere: every Text is the SYSTEM font (port map §1.5), coloured
// with the legacy aliases (background, text, textSecondary, border, danger).

import SwiftUI

struct AccountView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    /// null | 'export' | 'delete'
    @State private var busy: String?

    /**
     * Data portability. The server strips passwordHash before returning, so this is the subject's
     * data and nothing else.
     */
    private func handleExport() {
        busy = "export"
        Task {
            do {
                let res: JSON = try await api.getJSON("/account/export")
                // JSON.stringify(res?.data ?? res, null, 2)
                let payload: JSON
                if let d = res["data"], !d.isNull { payload = d } else { payload = res }
                let json = payload.prettyString()
                // Share.share({ title: 'EZER account data', message: json }) — iOS ignores `title`.
                // RN awaited the sheet before `finally`, so busy clears when it closes.
                shareText(json) { _ in busy = nil }
                return
            } catch {
                AppAlert.alert("Could not export", error.message)
            }
            busy = nil
        }
    }

    /**
     * Deletion is irreversible and it revokes bank connections upstream at Plaid before removing
     * anything locally, so it asks twice and names what goes.
     */
    private func handleDelete() {
        AppAlert.alert(
            "Delete your account?",
            "This removes your account, your linked banks, your subscriptions and your savings goals. It cannot be undone.",
            [
                AlertButton("Cancel", style: .cancel),
                AlertButton("Delete", style: .destructive) {
                    AppAlert.alert(
                        "Are you sure?",
                        "Your bank connections are revoked and your data is erased. There is no way back.",
                        [
                            AlertButton("Cancel", style: .cancel),
                            AlertButton("Delete everything", style: .destructive) {
                                busy = "delete"
                                Task {
                                    do {
                                        try await api.del("/account")
                                        // Clear the local session before navigating, or the app
                                        // would sit on a token for a user that no longer exists.
                                        await auth.logout()
                                        router.replace("/onboarding")
                                    } catch {
                                        busy = nil
                                        AppAlert.alert("Could not delete", error.message)
                                    }
                                }
                            },
                        ]
                    )
                },
            ]
        )
    }

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 0) {
                // Header: row, space-between, centre, padding 24, paddingTop insets.top + 16.
                HStack(alignment: .center, spacing: 0) {
                    Button { router.back() } label: {
                        Ionicon("arrow-back", size: 24, color: colors.text)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(colors.card))
                    }
                    .buttonStyle(PlainPressStyle())
                    Spacer(minLength: 0)
                    Text("Account")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(colors.text)
                    Spacer(minLength: 0)
                    Color.clear.frame(width: 44, height: 0)
                }
                .padding(.top, insets.top + 16)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)

                VStack(alignment: .leading, spacing: 0) {
                    // --- who you actually are ---------------------------------------
                    sectionLabel("Signed in as", colors)

                    VStack(alignment: .leading, spacing: 0) {
                        Text(nonEmpty(auth.user?.name))
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(colors.text)
                        Text(nonEmpty(auth.user?.email))
                            .font(.system(size: 14))
                            .foregroundStyle(colors.textSecondary)
                            .padding(.top, 4)
                    }
                    .padding(16 + 1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .rnBox(bg: colors.card, radius: 12, border: colors.border)
                    .padding(.bottom, 32)

                    // --- rights -----------------------------------------------------
                    sectionLabel("Your data", colors)

                    row(colors,
                        busyNow: busy == "export",
                        icon: "download-outline",
                        tint: colors.text,
                        title: "Download your data",
                        sub: "Everything we hold about you, as a file.",
                        action: handleExport)

                    row(colors,
                        busyNow: busy == "delete",
                        icon: "trash-outline",
                        tint: colors.danger,
                        title: "Delete your account",
                        sub: "Erases your data and disconnects your banks. Permanent.",
                        action: handleDelete)

                    Text("Deleting revokes every bank connection with Plaid before your records are removed, so nothing stays linked to your bank afterwards.")
                        .font(.system(size: 12))
                        .rnLineHeight(18, family: nil, size: 12)
                        .foregroundStyle(colors.textSecondary)
                        .padding(.top, 12)
                        .padding(.bottom, insets.bottom + 40)
                }
                .padding(.horizontal, 24)
            }
        }
        .background(colors.background.ignoresSafeArea())
        .rnScreen()
    }

    /// `user?.x || '—'`
    private func nonEmpty(_ s: String?) -> String {
        guard let s, !s.isEmpty else { return "—" }
        return s
    }

    /// 13 / 700, textSecondary, marginBottom 12, uppercase, letterSpacing 0.5.
    private func sectionLabel(_ text: String, _ colors: ThemeColors) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(colors.textSecondary)
            .padding(.bottom, 12)
    }

    /// rowStyle: row, centre, card bg, padding 16, radius 12, marginBottom 12, 1pt border.
    private func row(_ colors: ThemeColors, busyNow: Bool, icon: String, tint: Color, title: String, sub: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 0) {
                Group {
                    Ionicon(icon, size: 22, color: tint)
                }
                .cameraDove(busyNow)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(tint)
                    Text(sub)
                        .font(.system(size: 13))
                        .foregroundStyle(colors.textSecondary)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
            }
            .padding(16 + 1)
            .rnBox(bg: colors.card, radius: 12, border: colors.border)
        }
        .buttonStyle(PlainPressStyle())
        .disabled(busy != nil)
        .padding(.bottom, 12)
    }
}

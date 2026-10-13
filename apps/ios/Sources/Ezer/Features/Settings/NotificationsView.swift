// Port of apps/mobile/app/settings/notifications.tsx
//
// EZER Mobile App - Notifications Settings. A registered route that Settings does not link to.
// Local state only (nothing is saved or sent, as in the TS). Legacy screen: system font (no
// fontFamily in the TS) + the legacy colour aliases.

import SwiftUI

struct NotificationsView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var pushEnabled = true
    @State private var emailEnabled = true
    @State private var smsEnabled = false
    @State private var trialAlerts = true
    @State private var renewalAlerts = true
    @State private var priceChanges = true

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            VStack(spacing: 0) {
                // header: row, space-between, centre; padding 24, paddingTop insets.top + 16
                HStack(spacing: 0) {
                    Button(action: { router.back() }) {
                        Ionicon("arrow-back", size: 24, color: colors.text)
                            .frame(width: 44, height: 44)
                            .rnBox(bg: colors.card, radius: 22)
                    }
                    .buttonStyle(PlainPressStyle())
                    Spacer(minLength: 0)
                    Text("Notifications")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(colors.text)
                    Spacer(minLength: 0)
                    Color.clear.frame(width: 44, height: 0)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .padding(.top, insets.top + 16)

                VStack(alignment: .leading, spacing: 0) {
                    // Notification Channels
                    VStack(alignment: .leading, spacing: 0) {
                        sectionTitle("Notification Channels")
                        item("notifications", "Push Notifications", "Get alerts on your device", $pushEnabled)
                        item("mail", "Email Notifications", "Receive updates via email", $emailEnabled)
                        item("chatbubble", "SMS Notifications", "Get text messages", $smsEnabled)
                    }
                    .padding(.bottom, 32)

                    // Alert Types
                    VStack(alignment: .leading, spacing: 0) {
                        sectionTitle("Alert Types")
                        item("timer", "Trial Expiration", "24hrs before trial ends", $trialAlerts)
                        item("repeat", "Upcoming Renewals", "3 days before renewal", $renewalAlerts)
                        item("trending-up", "Price Changes", "When subscription prices increase", $priceChanges)
                    }
                    .padding(.bottom, 32)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .background(colors.background.ignoresSafeArea())
        .rnScreen()
    }

    private func sectionTitle(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 16, weight: .bold))
            .tracking(0.5)
            .textCase(.uppercase)
            .foregroundStyle(theme.colors.textSecondary)
            .padding(.bottom, 16)
    }

    /// itemStyle: row, centre, space-between, card bg, padding 16, radius 12, marginBottom 12.
    private func item(_ icon: String, _ title: String, _ subtitle: String, _ isOn: Binding<Bool>) -> some View {
        let colors = theme.colors
        return HStack(alignment: .center, spacing: 0) {
            HStack(alignment: .center, spacing: 0) {
                Ionicon(icon, size: 24, color: colors.text)
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(colors.text)
                        .padding(.bottom, 2)
                    Text(subtitle)
                        .font(.system(size: 13))
                        .foregroundStyle(colors.textSecondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 12)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            RNSwitch(isOn: isOn, trackColorFalse: colors.border, trackColorTrue: colors.accent, thumbColor: Color(css: "#FFFFFF"))
                .fixedSize()
        }
        .padding(16)
        .rnBox(bg: colors.card, radius: 12)
        .padding(.bottom, 12)
    }
}

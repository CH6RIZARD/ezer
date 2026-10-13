// Port of apps/mobile/app/settings/help.tsx
//
// EZER Mobile App - Help Center. A registered route that Settings does not link to (deep link
// only). Legacy screen: system font (no fontFamily anywhere in the TS) + the legacy colour
// aliases (background, card, text, textSecondary, border, accent, shadow).
// LayoutAnimation.Presets.easeInEaseOut (300ms) -> withAnimation(.easeInOut(duration: 0.3)).

import SwiftUI
import UIKit

private struct SettingsHelpTopic {
    let id: String
    let icon: String
    let title: String
    let description: String
    let details: String
}

struct HelpView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var expandedId: String?

    private let HELP_TOPICS: [SettingsHelpTopic] = [
        SettingsHelpTopic(
            id: "1", icon: "card", title: "Managing Your Cards",
            description: "Learn how to add, remove, and manage payment methods",
            details: "EZER connects to your bank accounts via Plaid to automatically detect subscriptions charged to your cards. To add a new card, go to Settings > Connected Accounts and tap \"Connect Bank Account\". You can disconnect any account at any time — your data is encrypted and never shared."
        ),
        SettingsHelpTopic(
            id: "2", icon: "time", title: "Trial Management",
            description: "Keep track of your free trials",
            details: "When EZER detects a free trial, you'll get an alert before it converts to a paid subscription, so you can decide whether to keep it or cancel in time. Navigate to the Alerts tab to see all your active trials."
        ),
        SettingsHelpTopic(
            id: "3", icon: "wallet", title: "Auto-Save Features",
            description: "Understand how automatic savings work",
            details: "When you cancel a subscription, EZER lets you redirect that freed money into savings goals. Go to the Saved tab to create goals like Emergency Fund or Vacation. Subscription roundups are automatically allocated to your chosen goals. You can withdraw your savings anytime from the Withdraw screen."
        ),
        SettingsHelpTopic(
            id: "4", icon: "shield-checkmark", title: "Security & Privacy",
            description: "How we protect your data",
            details: "EZER uses bank-level 256-bit encryption to protect your data. We connect through Plaid, which is used by thousands of financial institutions. We never store your bank login credentials. Your data is encrypted at rest and in transit. You can delete your account and all data at any time from Settings."
        ),
        SettingsHelpTopic(
            id: "5", icon: "link", title: "Bank Connections",
            description: "Connect and manage bank accounts with Plaid",
            details: "EZER uses Plaid to securely connect your bank accounts. Plaid is a trusted financial data platform used by apps like Venmo, Robinhood, and Coinbase. To connect, tap \"Connect Bank Account\" in Settings > Connected Accounts. You'll be redirected to your bank's login page — EZER never sees your password."
        ),
        SettingsHelpTopic(
            id: "6", icon: "document-text", title: "Subscription Tracking",
            description: "How we detect and track your subscriptions",
            details: "EZER analyzes your transaction history to identify recurring charges. We use pattern matching to detect subscriptions even when merchant names vary. The Monthly Burn screen shows your total subscription spending, and the 30-Day Risk screen highlights upcoming charges. Tap any subscription to see its full charge history and manage it."
        ),
    ]

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            VStack(spacing: 0) {
                // header: row, space-between, centre; padding 24, paddingTop insets.top + 16
                HStack(spacing: 0) {
                    Button(action: { router.back() }) {
                        Ionicon("arrow-back", size: 24, color: colors.text)
                            .frame(width: 44, height: 44)
                            .background(
                                rnRect(22).fill(colors.card)
                                    .rnShadow(colors.css("shadow") ?? "transparent", opacity: 0.08, radius: 8, y: 2)
                            )
                    }
                    .buttonStyle(PlainPressStyle())
                    Spacer(minLength: 0)
                    Text("Help Center")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(colors.text)
                    Spacer(minLength: 0)
                    Color.clear.frame(width: 44, height: 0)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .padding(.top, insets.top + 16)

                VStack(alignment: .leading, spacing: 0) {
                    Text("How can we help you?")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(colors.text)
                        .padding(.bottom, 24)

                    ForEach(HELP_TOPICS, id: \.id) { topic in
                        topicCard(topic)
                    }

                    Button(action: handleContactSupport) {
                        HStack(spacing: 8) {
                            Ionicon("mail", size: 20, color: Color(css: "#1F2933"))
                            Text("Contact Support")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(Color(css: "#1F2933"))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .rnBox(bg: colors.accent, radius: 12)
                    }
                    .buttonStyle(PlainPressStyle())
                    .padding(.top, 24)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .background(colors.background.ignoresSafeArea())
        .rnScreen()
    }

    private func topicCard(_ topic: SettingsHelpTopic) -> some View {
        let colors = theme.colors
        let isExpanded = expandedId == topic.id
        return Button(action: { toggleExpand(topic.id) }) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    Ionicon(topic.icon, size: 24, color: colors.accent)
                        .frame(width: 48, height: 48)
                        // colors.accent + '20' (RN string concatenation -> #RRGGBBAA)
                        .rnBox(bg: Color(css: theme.tokens.accent + "20"), radius: 24)
                        .padding(.trailing, 12)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(topic.title)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(colors.text)
                            .padding(.bottom, 4)
                        Text(topic.description)
                            .font(.system(size: 13))
                            .foregroundStyle(colors.textSecondary)
                            .rnLineHeight(18, family: nil, size: 13)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Ionicon(isExpanded ? "chevron-up" : "chevron-down", size: 20, color: colors.textSecondary)
                }
                .padding(16)
                if isExpanded {
                    VStack(alignment: .leading, spacing: 0) {
                        colors.border.frame(height: 1)
                            .padding(.bottom, 12)
                        Text(topic.details)
                            .font(.system(size: 14))
                            .foregroundStyle(colors.text)
                            .rnLineHeight(22, family: nil, size: 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }
            .multilineTextAlignment(.leading)
            // The TS also gives this card shadowOpacity .05 / radius 4 / offset (0,1), but with
            // overflow: 'hidden' — on iOS that is masksToBounds, which clips the layer's own
            // shadow, so RN draws none. Matching what RN draws: no shadow.
            .rnBox(bg: colors.card, radius: 12, clip: true)
        }
        .buttonStyle(PlainPressStyle())
        .padding(.bottom, 12)
    }

    private func handleContactSupport() {
        // Linking.openURL('mailto:support@ezer.app?subject=Help Request'); RN percent-escapes
        // the space when it builds the NSURL, so this is the same URL.
        // UIApplication.open directly, as RN's Linking.openURL does: Foundation's openURL() asks
        // canOpenURL first, which answers false for mailto: unless Info.plist lists it under
        // LSApplicationQueriesSchemes, so the tap would do nothing. open() has no such gate.
        guard let url = URL(string: "mailto:support@ezer.app?subject=Help%20Request") else { return }
        UIApplication.shared.open(url)
    }

    private func toggleExpand(_ id: String) {
        withAnimation(.easeInOut(duration: 0.3)) {
            expandedId = expandedId == id ? nil : id
        }
    }
}

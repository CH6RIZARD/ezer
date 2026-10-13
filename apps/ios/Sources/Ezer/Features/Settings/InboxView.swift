// Port of apps/mobile/app/settings/inbox.tsx
//
// Settings › Inbox — the pre-permission screen Google's restricted-scope review
// expects: says exactly what is read, that it is processed on this phone, and
// that only subscription details are saved, BEFORE the OAuth prompt appears.
// That copy is part of the review, so it is verbatim. The scan itself lives in
// InboxScan.swift (+ InboxExtract.swift). The row on Settings is hidden unless the
// server reports the feature enabled for this account (isInboxScanEnabled():
// INBOX_SCAN_ENABLED / INBOX_SCAN_ALLOWLIST in routes/inbox.ts).
//
// TODO(native): "Connect" needs Google Sign-In / a Microsoft client id (see InboxScan.swift);
// until then a tap ends in RN's own "Scan failed: Missing …" message.

import SwiftUI
import UIKit

struct InboxView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.isScreenFocused) private var focused

    @State private var last: [SettingsInboxProvider: Date] = [:]
    @State private var busy: SettingsInboxProvider?
    @State private var message: String?
    // One task per scan; leaving the screen or disconnecting cancels the
    // in-flight message fetches instead of letting them run to completion.
    @State private var scanTask: Task<Void, Never>?

    private let PRIVACY_URL = "https://ch6rizard.github.io/ezer/privacy.html#email"

    private let PROVIDERS: [(id: SettingsInboxProvider, label: String, icon: String)] = [
        (id: .gmail, label: "Gmail", icon: "logo-google"),
        (id: .outlook, label: "Outlook", icon: "logo-microsoft"),
    ]

    private let POINTS: [(icon: String, line: String)] = [
        (icon: "search-outline", line: "Only emails whose subject mentions a receipt, invoice, subscription, trial, renewal or billing."),
        (icon: "phone-portrait-outline", line: "They are read on this phone. Email text never reaches EZER’s servers."),
        (icon: "list-outline", line: "Only the subscription details are saved: merchant, price, billing cycle, next charge, trial end and cancel link."),
        (icon: "close-circle-outline", line: "No ads, no selling, no people reading your mail, no AI training. Read-only: EZER cannot send, delete or change anything."),
    ]

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical, showsIndicators: false) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    // styles.header
                    HStack(spacing: 0) {
                        PressScale(scaleTo: 0.9, action: { router.back() }) {
                            Ionicon("chevron-back", size: 18, color: colors.ink)
                                .frame(width: 38, height: 38)
                                .rnBox(bg: colors.card, radius: 19, border: colors.line)
                        }
                        Text("Inbox")
                            .typeStyle(TypeScale.screenTitle)
                            .foregroundStyle(colors.ink)
                            .padding(.leading, 12)
                    }

                    SectionHeader("What EZER reads")
                        .padding(.top, 24)
                        .padding(.bottom, 10)
                    Surface {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(0..<POINTS.count, id: \.self) { i in
                                // styles.point
                                HStack(alignment: .top, spacing: 10) {
                                    Ionicon(POINTS[i].icon, size: 17, color: colors.accInk)
                                        .padding(.top, 1)
                                    BodyText(POINTS[i].line)
                                        .rnLineHeight(19, TypeScale.body)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            // Linking.openURL never asks canOpenURL; Foundation's openURL() does, and
                            // that answers false for any scheme not in LSApplicationQueriesSchemes.
                            PressScale(action: { if let u = URL(string: PRIVACY_URL) { UIApplication.shared.open(u) } }) {
                                // styles.link
                                Text("Privacy policy")
                                    .font(.ezer(FontFamily.semibold, 13))
                                    .foregroundStyle(colors.gold)
                                    .padding(.top, 4)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        // Surface's 1px border is an overlay; Yoga puts it inside the padding.
                        .padding(16 + 1)
                    }

                    SectionHeader("Inboxes")
                        .padding(.top, 24)
                        .padding(.bottom, 10)
                    Surface {
                        VStack(spacing: 0) {
                            ForEach(0..<PROVIDERS.count, id: \.self) { i in
                                VStack(spacing: 0) {
                                    if i > 0 { colors.line.frame(height: 1) }
                                    providerRow(PROVIDERS[i])
                                }
                            }
                        }
                        .padding(.horizontal, 14 + 1)
                        .padding(.vertical, 1)
                    }
                    if let message {
                        BodyText(message).padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
        }
        .background(colors.bg.ignoresSafeArea())
        .rnScreen()
        .onChange(of: focused, initial: true) { _, f in if f { load() } }
        .onDisappear { scanTask?.cancel() }
    }

    /// styles.row
    private func providerRow(_ p: (id: SettingsInboxProvider, label: String, icon: String)) -> some View {
        let colors = theme.colors
        let scanned = last[p.id]
        let status: String = busy == p.id
            ? "Working…"
            : scanned.map { "Last scanned \($0.formatted(date: .numeric, time: .omitted))" } ?? "Not connected"
        return HStack(spacing: 12) {
            Ionicon(p.icon, size: 20, color: colors.ink)
            VStack(alignment: .leading, spacing: 0) {
                // styles.kvValue
                Text(p.label)
                    .font(.ezer(FontFamily.semibold, 14))
                    .foregroundStyle(colors.ink)
                BodyText(status)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if scanned != nil {
                PressScale(disabled: busy != nil, action: { disconnect(p.id) }) {
                    // styles.action
                    Text("Disconnect")
                        .font(.ezer(FontFamily.semibold, 13))
                        .foregroundStyle(colors.mut)
                }
            }
            PressScale(disabled: busy != nil, action: { scan(p.id) }) {
                // styles.btn + styles.action
                Text(scanned != nil ? "Scan" : "Connect")
                    .font(.ezer(FontFamily.semibold, 13))
                    .foregroundStyle(colors.ink)
                    // + the 1.5 border, which rnBox overlays but Yoga lays out inside the padding.
                    .padding(.horizontal, 14 + 1.5)
                    .padding(.vertical, 7 + 1.5)
                    .rnBox(radius: Radius.pill, border: colors.line2, borderWidth: 1.5)
                    .opacity(busy != nil ? 0.6 : 1)
            }
        }
        .padding(.vertical, 13)
    }

    // MARK: - Actions

    private func load() {
        var l: [SettingsInboxProvider: Date] = [:]
        l[.gmail] = lastScanAt(.gmail)
        l[.outlook] = lastScanAt(.outlook)
        last = l
    }

    private func scan(_ p: SettingsInboxProvider) {
        busy = p
        message = nil
        scanTask = Task {
            do {
                let r = try await scanInbox(p)
                switch r {
                case .cancelled:
                    message = "No access granted, so nothing was read."
                case let .done(found, created, _):
                    message = found > 0
                        ? "Found \(found) subscription\(found == 1 ? "" : "s") (\(created) new)."
                        : "No new subscriptions found."
                    Task { await data.refresh() }
                }
            } catch {
                message = error.message.isEmpty ? "Scan failed." : "Scan failed: \(error.message)"
            }
            busy = nil
            load()
        }
    }

    private func disconnect(_ p: SettingsInboxProvider) {
        scanTask?.cancel()
        busy = p
        Task {
            await disconnectInbox(p)
            busy = nil
            message = "\(p == .gmail ? "Gmail" : "Outlook") disconnected. Subscriptions already found stay in EZER."
            load()
        }
    }
}

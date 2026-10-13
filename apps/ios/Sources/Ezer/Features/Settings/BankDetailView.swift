// Port of apps/mobile/app/screens/BankDetail.tsx
//
// EZER Redesign — Bank detail (Settings › Linked banks › a bank)
//
// Patch 3 of PATCH-NOTES-early-access-sheet.md (3a·2). Reached by tapping a bank row on
// LinkedBanksView. Three things live here, all real server calls:
//   - Accounts: which ones exist, and "Use for Pay in 4" on the eligible (non-credit) ones that
//     aren't already the funding account (POST /cards/pay-in4-account).
//   - Subscriptions: the per-bank read/don't-read switch (PlaidItem.readForSubscriptions,
//     POST /plaid/items/:id/read-for-subscriptions).
//   - Disconnect: revokes this ONE bank via Plaid (DELETE /plaid/items/:id — the server calls
//     Plaid's itemRemove FIRST), unlike account deletion's revoke-everything.
//
// Bordered boxes: paddings inside are written `N + border` (Yoga lays the border out inside).

import SwiftUI

private func typeLabel(_ subtype: String?) -> String {
    guard let subtype, !subtype.isEmpty else { return "Account" }
    return subtype.prefix(1).uppercased() + subtype.dropFirst()
}

private let motionPress: Double = 0.97

struct BankDetailView: View {
    let itemId: String

    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.isScreenFocused) private var focused

    @State private var item: LinkedBankItem?
    @State private var loading = true
    @State private var busyAccountId: String?
    @State private var readBusy = false
    @State private var disconnecting = false

    init(itemId: String) {
        self.itemId = itemId
    }

    private func load() async {
        let d = await SettingsLinkedBanks.fetchLinkedBanks()
        item = d?.items.first { $0.itemId == itemId }
        loading = false
    }

    private func makePayIn4(_ instrumentId: String) {
        if busyAccountId != nil { return }
        busyAccountId = instrumentId
        Task {
            do {
                try await api.post("/cards/pay-in4-account", ["instrumentId": .string(instrumentId)], timeout: PLAID_TIMEOUT)
            } catch {
                // The row simply won't show the new chip — load() below is the real source of
                // truth and will reflect whatever the server actually did.
            }
            await load()
            busyAccountId = nil
        }
    }

    private func toggleRead(_ enabled: Bool) {
        guard let item, !readBusy else { return }
        readBusy = true
        Task {
            do {
                try await api.post("/plaid/items/\(item.itemId)/read-for-subscriptions", ["enabled": .bool(enabled)], timeout: enabled ? PLAID_TIMEOUT : nil)
            } catch {
                // Best-effort — load() reconciles either way.
            }
            // Promise.all([load(), refreshWallet()])
            async let reloaded: Void = load()
            async let refreshed: Void = data.refresh()
            _ = await (reloaded, refreshed)
            readBusy = false
        }
    }

    private func disconnect() {
        guard let item else { return }
        AppAlert.alert(
            "Disconnect \(item.institutionName ?? "this bank")?",
            item.accounts.contains { $0.isPayIn4 }
                ? "Pay in 4 pays from this bank. Disconnecting it removes your spending power until you pick another account."
                : "This removes the bank's access and stops reading it for subscriptions.",
            [
                AlertButton("Cancel", style: .cancel),
                AlertButton("Disconnect", style: .destructive) {
                    disconnecting = true
                    Task {
                        do {
                            try await api.del("/plaid/items/\(item.itemId)")
                            await data.refresh()
                            router.back()
                        } catch {
                            disconnecting = false
                            AppAlert.alert("Could not disconnect", "Please try again.")
                        }
                    }
                },
            ]
        )
    }

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    header(colors)

                    if loading {
                        DoveLoader()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    } else if let item {
                        content(colors, item)
                    } else {
                        BodyText("This bank is no longer connected.")
                            .padding(.top, 24)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            // RN bounces={false}.
            .rnNoBounce()
        }
        .scrollIndicators(.hidden)
        .background(colors.bg.ignoresSafeArea())
        .rnScreen()
        // useFocusEffect(load)
        .onChange(of: focused, initial: true) { _, f in
            if f { Task { await load() } }
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
            if let item {
                SettingsBankTile(institutionName: item.institutionName, networkArt: item.networkArt, size: 36)
                    .padding(.leading, 12)
            }
            Text(item?.institutionName ?? (loading ? "" : "Bank"))
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(colors.ink)
                .lineLimit(1)
                .padding(.leading, 10)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func content(_ colors: ThemeColors, _ item: LinkedBankItem) -> some View {
        // styles.sinceRow: row, centre, marginTop 8, marginLeft 50.
        HStack(alignment: .center, spacing: 0) {
            Ionicon("lock-closed-outline", size: 13, color: colors.success)
            BodyText("Connected via Plaid · \(settingsMonthYear(item.connectedAt))")
                .padding(.leading, 8)
        }
        .padding(.top, 8)
        .padding(.leading, 50)

        SectionHeader("Accounts")
            .padding(.top, 24)
            .padding(.bottom, 10)
        Surface {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(item.accounts.enumerated()), id: \.element.instrumentId) { i, a in
                    if i > 0 {
                        Rectangle().fill(colors.line).frame(height: 1)
                    }
                    accountRow(colors, a)
                }
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 1)
        }

        SectionHeader("Subscriptions")
            .padding(.top, 24)
            .padding(.bottom, 10)
        Surface {
            // [styles.block, styles.readRow]: paddingH 14, row, centre, gap 12, paddingV 14.
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Read this bank for subscriptions")
                        .font(.ezer(FontFamily.semibold, 14))
                        .foregroundStyle(colors.ink)
                    BodyText(item.readForSubscriptions
                             ? "Ezer reads charges on these accounts to find recurring payments."
                             : "Connected for Pay in 4 only. Turn on to find subscriptions here too.")
                        .rnLineHeight(17, TypeScale.body)
                        .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    RNSwitch(
                        isOn: Binding(
                            get: { item.readForSubscriptions },
                            set: { v in toggleRead(v) }
                        ),
                        trackColorFalse: colors.line2,
                        trackColorTrue: colors.accInk,
                        thumbColor: Color(css: "#FFFFFF")
                    )
                    .fixedSize()
                    .disabled(readBusy)
                }
                .cameraDove(readBusy)
            }
            .padding(.horizontal, 14 + 1)
            .padding(.vertical, 14 + 1)
        }

        if item.accounts.contains(where: { $0.isPayIn4 }) {
            BodyText("Pay in 4 pays from this bank. Disconnecting it removes your spending power until you pick another account.", size: 11.5)
                .rnLineHeight(16, family: FontFamily.regular, size: 11.5)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 14)
        }
        PressScale(scaleTo: motionPress, disabled: disconnecting, action: disconnect) {
            // styles.disconnect: height 52, radius.buttonLg, 1.5 line2 border, row centre, gap 8.
            HStack(alignment: .center, spacing: 8) {
                Group {
                    Ionicon("unlink-outline", size: 18, color: colors.red)
                    Text("Disconnect \(item.institutionName ?? "bank")")
                        .font(.ezer(FontFamily.bold, 15))
                        .foregroundStyle(colors.red)
                }
                .cameraDove(disconnecting)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .overlay(rnRect(Radius.buttonLg).strokeBorder(colors.line2, lineWidth: 1.5))
            .contentShape(rnRect(Radius.buttonLg))
            .opacity(disconnecting ? 0.6 : 1)
        }
        .padding(.top, 14)
    }

    private func accountRow(_ colors: ThemeColors, _ a: LinkedBankAccount) -> some View {
        // styles.accountRow: row, centre, gap 12, paddingVertical 13.
        HStack(alignment: .center, spacing: 12) {
            Ionicon(a.type == "card" ? "card-outline" : "business-outline", size: 19, color: colors.mut)
            VStack(alignment: .leading, spacing: 0) {
                Text(a.displayName)
                    .font(.ezer(FontFamily.semibold, 14))
                    .foregroundStyle(colors.ink)
                    .lineLimit(1)
                BodyText("\(typeLabel(a.subtype)) · •••• \(a.last4)")
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if a.isPayIn4 {
                // styles.chip: paddingH 8, paddingV 4, radius.pill, goldSoft.
                Text("PAY IN 4")
                    .typeStyle(TypeScale.labelSm)
                    .foregroundStyle(colors.gold)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(colors.goldSoft))
            } else if a.eligibleForPayIn4 {
                Button { makePayIn4(a.instrumentId) } label: {
                    Group {
                        Text("Use for Pay in 4")
                            .font(.ezer(FontFamily.semibold, 12))
                            .foregroundStyle(colors.gold)
                    }
                    .cameraDove(busyAccountId == a.instrumentId)
                    .opacity(busyAccountId == a.instrumentId ? 0.6 : 1)
                }
                .buttonStyle(PlainPressStyle())
                .disabled(busyAccountId == a.instrumentId)
            }
        }
        .padding(.vertical, 13)
    }
}

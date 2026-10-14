// Port of apps/mobile/app/settings/linked-banks.tsx
//
// EZER Redesign — Settings › Linked banks (3a·1 of PATCH-NOTES-early-access-sheet.md's Patch 3)
//
// Its OWN screen, reached by tapping "Linked banks" on the main Settings list — NOT inlined into
// SettingsView. The mock's 3a·1 has its own back-arrow header ("‹ Linked banks").
//
// Turn 3 model (Patch 3): Pay in 4 has exactly ONE funding account (User.payIn4InstrumentId, set
// via the picker sheet below or auto-picked by trustScoring.ts's resolvePayIn4Instrument the first
// time an assessment runs). Every OTHER linked bank is read for subscriptions unless the user
// turned that off for it specifically (PlaidItem.readForSubscriptions, flipped on BankDetail).
//
// Bordered boxes: paddings inside are written `N + border` (Yoga lays the border out inside).

import SwiftUI

struct LinkedBanksView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(DataStore.self) private var data
    @Environment(\.safeInsets) private var insets
    @Environment(\.isScreenFocused) private var focused

    @State private var connectBank = ConnectBank()
    @State private var linkedBanks: LinkedBanksData?
    @State private var loadingBanks = true
    @State private var payIn4LimitCents: Int?
    @State private var pickerOpen = false

    private func loadLinkedBanks() async {
        // Promise.all([fetchLinkedBanks(), getSpendingPowerOutcome()])
        let banks = await SettingsLinkedBanks.fetchLinkedBanks()
        let outcome = await CardDesignStore.loadSpendingPowerOutcome()
        linkedBanks = banks
        payIn4LimitCents = outcome?.status == .approved ? outcome?.limitCents : nil
        loadingBanks = false
    }

    var body: some View {
        let colors = theme.colors
        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    header(colors)

                    SectionHeader("Pay in 4 pays from")
                        .padding(.top, 24)
                        .padding(.bottom, 10)
                    payIn4Card(colors)
                    BodyText("Installments are pulled from this account. Changing it re-checks your spending power.", size: 11.5)
                        .rnLineHeight(16, family: FontFamily.regular, size: 11.5)
                        .padding(.top, 8)

                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        SectionHeader("Connected banks")
                        Spacer(minLength: 0)
                        if let lb = linkedBanks, !lb.items.isEmpty {
                            BodyText("\(lb.items.count) connected")
                        }
                    }
                    .padding(.top, 24)
                    .padding(.bottom, 10)
                    banksList(colors)

                    SettingsPayIn4AccountPicker(
                        visible: pickerOpen,
                        data: linkedBanks,
                        onClose: { pickerOpen = false },
                        onSaved: { Task { await loadLinkedBanks() } }
                    )

                    // Same flow as the dashboard call-out, so linking behaves identically wherever
                    // it starts: Link -> exchange -> sync -> refresh.
                    connectButton(colors)
                        .padding(.top, 16)

                    if let err = connectBank.error {
                        BodyText(err, color: colors.red)
                            .padding(.top, 8)
                    }
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
        // useFocusEffect(loadLinkedBanks)
        .onChange(of: focused, initial: true) { _, f in
            if f { Task { await loadLinkedBanks() } }
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
            Text("Linked banks")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(colors.ink)
                .padding(.leading, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // --- "Pay in 4 pays from" ---------------------------------------------------------
    @ViewBuilder
    private func payIn4Card(_ colors: ThemeColors) -> some View {
        if loadingBanks {
            VStack(alignment: .leading, spacing: 10) {
                DoveLoader()
                Skeleton(h: 96, r: 18)
                Skeleton(w: 120, h: 16).padding(.top, 14)
                SkeletonRows(count: 2)
            }
        } else {
            let p4Item = linkedBanks?.items.first { SettingsLinkedBanks.payIn4AccountFor($0) != nil }
            let p4Account = p4Item.flatMap { SettingsLinkedBanks.payIn4AccountFor($0) }
            if let p4Item, let p4Account {
                Button { pickerOpen = true } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        // styles.p4Head: row, centre, gap 12.
                        HStack(alignment: .center, spacing: 12) {
                            SettingsBankTile(institutionName: p4Item.institutionName, networkArt: p4Item.networkArt, size: 40)
                            VStack(alignment: .leading, spacing: 0) {
                                Text("\(p4Item.institutionName ?? "") · \(p4Account.displayName)")
                                    .font(.ezer(FontFamily.semibold, 14))
                                    .foregroundStyle(colors.ink)
                                    .lineLimit(1)
                                Text("•••• \(p4Account.last4)")
                                    .font(.ezer(FontFamily.regular, 12))
                                    .foregroundStyle(colors.mut)
                                    .padding(.top, 2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Text("Change")
                                .font(.ezer(FontFamily.semibold, 13))
                                .foregroundStyle(colors.gold)
                        }
                        if let limit = payIn4LimitCents {
                            // styles.p4Footer: row, baseline, space-between, marginTop 12,
                            // paddingTop 12, borderTopWidth 1 goldLine.
                            HStack(alignment: .firstTextBaseline, spacing: 0) {
                                BodyText("Spending power from this account", size: 12.5)
                                Spacer(minLength: 0)
                                Text(formatCents(limit))
                                    .font(.ezer(FontFamily.serif, 26))
                                    .foregroundStyle(colors.gold)
                            }
                            .padding(.top, 12 + 1)
                            .overlay(alignment: .top) { Rectangle().fill(colors.goldLine).frame(height: 1) }
                            .padding(.top, 12)
                        }
                    }
                    .padding(14 + 1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // LinearGradient goldTile, start {0,0} end {1,1}; styles.p4Card radius.cardLg,
                    // 1pt goldLine border.
                    .background(rnRect(Radius.cardLg).fill(LinearGradient.rn(colors.goldTile, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))))
                    .overlay(rnRect(Radius.cardLg).strokeBorder(colors.goldLine, lineWidth: 1))
                }
                .buttonStyle(PlainPressStyle())
            } else {
                Button { pickerOpen = true } label: {
                    // styles.p4Empty: row, centre, gap 12, radius.cardLg, 1.5 dashed goldLine, padding 16.
                    HStack(alignment: .center, spacing: 12) {
                        Ionicon("card-outline", size: 20, color: colors.gold)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("No account chosen")
                                .font(.ezer(FontFamily.semibold, 14))
                                .foregroundStyle(colors.ink)
                            BodyText("Pick a checking account · sets your spending power")
                                .padding(.top, 2)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Ionicon("chevron-forward", size: 16, color: colors.mut2)
                    }
                    .padding(16 + 1.5)
                    // RN iOS draws a dashed border with dash = gap = 3 × borderWidth.
                    .overlay(rnRect(Radius.cardLg).strokeBorder(colors.goldLine, style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5])))
                    .contentShape(rnRect(Radius.cardLg))
                }
                .buttonStyle(PlainPressStyle())
            }
        }
    }

    // --- "Connected banks" --------------------------------------------------------------
    @ViewBuilder
    private func banksList(_ colors: ThemeColors) -> some View {
        if !loadingBanks && (linkedBanks == nil || linkedBanks?.items.isEmpty == true) {
            Surface {
                BodyText("No accounts linked yet. Connect one below and your cards will appear here.")
                    .padding(16 + 1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if let lb = linkedBanks {
            Surface {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(lb.items.enumerated()), id: \.element.itemId) { i, item in
                        if i > 0 {
                            Rectangle().fill(colors.line).frame(height: 1)
                        }
                        bankRow(colors, item)
                    }
                }
                .padding(.horizontal, 14 + 1)
                .padding(.vertical, 1)
            }
        }
    }

    private func bankRow(_ colors: ThemeColors, _ item: LinkedBankItem) -> some View {
        let p4 = SettingsLinkedBanks.payIn4AccountFor(item)
        let accountsLine = item.accounts.map { "\($0.displayName) •\($0.last4)" }.joined(separator: " · ")
        let read = item.readForSubscriptions
        let name = item.institutionName ?? ""
        return PressScale(scaleTo: 0.99, action: {
            router.push("/screens/BankDetail", ["itemId": item.itemId])
        }) {
            // styles.bankRow: row, centre, gap 12, paddingVertical 13.
            HStack(alignment: .center, spacing: 12) {
                SettingsBankTile(institutionName: item.institutionName, networkArt: item.networkArt)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .center, spacing: 8) {
                        Text(name.isEmpty ? "Bank" : name)
                            .font(.ezer(FontFamily.semibold, 14))
                            .foregroundStyle(colors.ink)
                            .lineLimit(1)
                        if p4 != nil {
                            // styles.chip: paddingH 7, paddingV 3, radius.pill, goldSoft.
                            Text("PAY IN 4")
                                .typeStyle(TypeScale.labelSm)
                                .foregroundStyle(colors.gold)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(colors.goldSoft))
                        }
                    }
                    BodyText(accountsLine.isEmpty ? "Linked account" : accountsLine, lines: 1)
                        .padding(.top, 2)
                    HStack(alignment: .center, spacing: 5) {
                        Ionicon(read ? "eye-outline" : "eye-off-outline", size: 12, color: read ? colors.accInk : colors.mut)
                        Text(read ? "Read for subscriptions" : "Not read for subscriptions")
                            .font(.ezer(FontFamily.medium, 11.5))
                            .foregroundStyle(read ? colors.accInk : colors.mut)
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Ionicon("chevron-forward", size: 16, color: colors.mut2)
            }
            .padding(.vertical, 13)
            .contentShape(Rectangle())
        }
    }

    // --- Connect a bank -------------------------------------------------------------------
    private func connectButton(_ colors: ThemeColors) -> some View {
        let busy = connectBank.busy
        return PressScale(disabled: busy, action: {
            Task { await connectBank.connect(data: data, onDone: { Task { await loadLinkedBanks() } }) }
        }) {
            // styles.connectBtn: height 52, radius.buttonLg, 1.5 line2 border, row centre, gap 8.
            HStack(alignment: .center, spacing: 8) {
                Ionicon(busy ? "sync-outline" : "add", size: 18, color: colors.ink)
                Text(busy ? (connectBank.label ?? "") : "Connect a bank")
                    .font(.ezer(FontFamily.bold, 15))
                    .foregroundStyle(colors.ink)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .overlay(rnRect(Radius.buttonLg).strokeBorder(colors.line2, lineWidth: 1.5))
            .contentShape(rnRect(Radius.buttonLg))
            .opacity(busy ? 0.7 : 1)
        }
    }
}

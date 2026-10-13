// Port of apps/mobile/components/redesign/PayIn4AccountPicker.tsx
//
// EZER Redesign — Pay in 4 account picker sheet (Patch 3, 3a·3)
//
// "Change" on Settings' "Pay in 4 pays from" card opens this. A radio list of every eligible
// (non-credit) linked account across every connected bank, plus "Connect a new bank" for someone
// who wants to fund Pay in 4 from an account they haven't linked yet. Saving calls
// POST /cards/pay-in4-account, which sets User.payIn4InstrumentId AND re-runs the real assessment
// against it server-side (trustScoring.ts) — this sheet shows that re-check happening, it doesn't
// compute anything itself.
//
// RN <Modal transparent animationType="slide"> -> Foundation's .rnModal(.slide). The component's
// state (pending, saving, the connect-bank hook) lives on the outer view, which stays mounted on
// LinkedBanksView like the RN component did; the sheet content is a plain function of it.
// Bordered boxes: paddings inside are written `N + border` (Yoga lays the border out inside).

import SwiftUI

struct SettingsPayIn4AccountPicker: View {
    @Environment(DataStore.self) private var dataStore

    let visible: Bool
    let data: LinkedBanksData?
    let onClose: () -> Void
    /** Called after a successful save, so the caller can refetch. */
    let onSaved: () -> Void

    @State private var connectBank = ConnectBank()
    @State private var pending: String?
    @State private var saving = false

    init(visible: Bool, data: LinkedBanksData?, onClose: @escaping () -> Void, onSaved: @escaping () -> Void) {
        self.visible = visible
        self.data = data
        self.onClose = onClose
        self.onSaved = onSaved
    }

    /// `type Row = LinkedBankAccount & { bankName; networkArt }`
    fileprivate struct Row: Identifiable {
        let account: LinkedBankAccount
        let bankName: String?
        let networkArt: String?
        var id: String { account.instrumentId }
    }

    private var rows: [Row] {
        (data?.items ?? []).flatMap { item in
            item.accounts
                .filter { $0.eligibleForPayIn4 }
                .map { Row(account: $0, bankName: item.institutionName, networkArt: item.networkArt) }
        }
    }

    private var changed: Bool { pending != data?.payIn4InstrumentId }

    private func handleSave() {
        guard changed, let instrumentId = pending, !saving else {
            onClose()
            return
        }
        saving = true
        Task {
            do {
                let res: JSON = try await api.post("/cards/pay-in4-account", ["instrumentId": .string(instrumentId)], timeout: PLAID_TIMEOUT)
                // const payload = res?.data ?? res
                let payload: JSON
                if let d = res["data"], !d.isNull { payload = d } else { payload = res }
                let status = CardDesignStore.mapServerStatus(payload["status"]?.stringValue) ?? .approved
                // typeof payload?.limitCents === 'number' ? payload.limitCents : null
                let limitCents = payload["limitCents"]?.intValue
                let outcome = CardAccessOutcome(status: status, limitCents: limitCents, joinedAt: toISOString(Date()))
                CardDesignStore.saveSpendingPowerOutcome(outcome)
                CardDesignStore.mirrorServerAccessOutcome(outcome)
            } catch {
                // Best-effort mirror — the server-side change already landed even if this local
                // cache update fails; onSaved()'s refetch is the real source of truth either way.
            }
            saving = false
            onSaved()
            onClose()
        }
    }

    private func handleConnectNew() {
        Task { await connectBank.connect(data: dataStore, onDone: onSaved) }
    }

    /// useEffect(() => { if (visible) setPending(data?.payIn4InstrumentId ?? null) }, [visible, id])
    private func syncPending() {
        if visible { pending = data?.payIn4InstrumentId }
    }

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .rnModal(isPresented: visible, animationType: .slide, onRequestClose: onClose) {
                SettingsPayIn4PickerSheet(
                    rows: rows,
                    pending: pending,
                    saving: saving,
                    changed: changed,
                    connectBusy: connectBank.busy,
                    connectLabel: connectBank.label,
                    onClose: onClose,
                    onPick: { pending = $0 },
                    onConnectNew: handleConnectNew,
                    onSave: handleSave
                )
            }
            .onChange(of: visible, initial: true) { _, _ in syncPending() }
            .onChange(of: data?.payIn4InstrumentId) { _, _ in syncPending() }
    }
}

private struct SettingsPayIn4PickerSheet: View {
    @Environment(ThemeStore.self) private var theme

    let rows: [SettingsPayIn4AccountPicker.Row]
    let pending: String?
    let saving: Bool
    let changed: Bool
    let connectBusy: Bool
    let connectLabel: String?
    let onClose: () -> Void
    let onPick: (String) -> Void
    let onConnectNew: () -> Void
    let onSave: () -> Void

    /// ScrollView maxHeight 360: as tall as its content up to 360 (SwiftUI's ScrollView is greedy).
    @State private var contentHeight: CGFloat = 0

    var body: some View {
        let colors = theme.colors
        ZStack(alignment: .bottom) {
            // <Pressable style={absoluteFill} onPress={saving ? undefined : onClose}> scrim
            colors.scrim
                .contentShape(Rectangle())
                .onTapGesture { if !saving { onClose() } }

            // styles.sheetWrap: flex 1, justifyContent flex-end, pointerEvents box-none.
            VStack(alignment: .leading, spacing: 0) {
                // styles.grabber: 40×4, radius 2, line2, centred, marginBottom 24.
                rnRect(2)
                    .fill(colors.line2)
                    .frame(width: 40, height: 4)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 24)

                Text("PAY IN 4")
                    .font(.ezer(FontFamily.semibold, 11))
                    .tracking(0.5)
                    .textCase(.uppercase)
                    .foregroundStyle(colors.mut)
                Text("Which account pays the installments?")
                    .font(.ezer(FontFamily.serif, 32))
                    .tracking(-0.4)
                    .rnLineHeight(36, family: FontFamily.serif, size: 32)
                    .foregroundStyle(colors.ink)
                    .padding(.top, 8)
                BodyText("Checking or savings only. Your spending power is worked out from this account\u{2019}s deposits and balance.")
                    .rnLineHeight(19, TypeScale.body)
                    .padding(.top, 10)

                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(rows) { row in
                            accountRow(colors, row)
                        }
                        connectNewRow(colors)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
                }
                .scrollIndicators(.hidden)
                .frame(height: min(contentHeight, 360))
                .padding(.top, 18)

                Text(changed
                     ? "Switching accounts re-runs the spending-power check (a soft check, no effect on your credit score)."
                     : "Credit cards can't fund Pay in 4, so they're not listed.")
                    .font(.ezer(FontFamily.regular, 11))
                    .rnLineHeight(16, family: FontFamily.regular, size: 11)
                    .foregroundStyle(colors.mut3)
                    .padding(.top, 14)

                PressScale(scaleTo: Motion.pressScale, disabled: saving, action: onSave) {
                    // styles.cta: height 56, radius.pill, ink, centred.
                    ZStack {
                        if saving {
                            RNActivityIndicator(color: Color(css: "#FFFFFF"))
                        } else {
                            Text(changed ? "Save · re-check spending power" : "Keep current account")
                                .font(.ezer(FontFamily.bold, 15))
                                .foregroundStyle(Color(css: "#FFFFFF"))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background(Capsule().fill(colors.ink))
                    .opacity(saving ? 0.6 : 1)
                }
                .padding(.top, 18)
            }
            // styles.sheet: radius 28 on top, paddingH 24, paddingTop 12, paddingBottom 34.
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 34)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(rnRect(topLeading: 28, topTrailing: 28).fill(colors.card))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }

    private func accountRow(_ colors: ThemeColors, _ row: SettingsPayIn4AccountPicker.Row) -> some View {
        let on = row.id == pending
        let bankName = row.bankName ?? ""
        return Button { onPick(row.id) } label: {
            // styles.row: row, centre, gap 12, paddingV 13, paddingH 14, radius 16, border 1.5.
            HStack(alignment: .center, spacing: 12) {
                // styles.radio: 22×22, radius 11, border 1.5.
                ZStack {
                    if on {
                        Ionicon("checkmark", size: 13, color: Color(css: "#FFFFFF"))
                    }
                }
                .frame(width: 22, height: 22)
                .background(Circle().fill(on ? colors.gold : Color(css: "transparent")))
                .overlay(Circle().strokeBorder(on ? colors.gold : colors.line2, lineWidth: 1.5))

                SettingsBankTile(institutionName: row.bankName, networkArt: row.networkArt, size: 30)

                VStack(alignment: .leading, spacing: 0) {
                    Text(bankName.isEmpty ? row.account.displayName : "\(bankName) · \(row.account.displayName)")
                        .font(.ezer(FontFamily.semibold, 14))
                        .foregroundStyle(colors.ink)
                        .lineLimit(1)
                    Text("•••• \(row.account.last4)")
                        .font(.ezer(FontFamily.regular, 12))
                        .foregroundStyle(colors.mut)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 13 + 1.5)
            .padding(.horizontal, 14 + 1.5)
            .rnBox(bg: on ? colors.goldSoft : colors.bg2, radius: 16, border: on ? colors.gold : colors.line, borderWidth: 1.5)
        }
        .buttonStyle(PlainPressStyle())
        .disabled(saving)
    }

    private func connectNewRow(_ colors: ThemeColors) -> some View {
        Button(action: onConnectNew) {
            HStack(alignment: .center, spacing: 12) {
                Ionicon("add", size: 18, color: colors.mut)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 0) {
                    Text(connectBusy ? (connectLabel ?? "") : "Connect a new bank")
                        .font(.ezer(FontFamily.semibold, 14))
                        .foregroundStyle(colors.mut)
                    Text("Via Plaid · read for subscriptions by default")
                        .font(.ezer(FontFamily.regular, 12))
                        .foregroundStyle(colors.mut2)
                        .padding(.top, 2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 13 + 1.5)
            .padding(.horizontal, 14 + 1.5)
            // styles.rowDashed: RN iOS dashes are dash = gap = 3 × borderWidth.
            .overlay(rnRect(16).strokeBorder(colors.line2, style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5])))
            .contentShape(rnRect(16))
        }
        .buttonStyle(PlainPressStyle())
        .disabled(connectBusy || saving)
    }
}

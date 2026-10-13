// Typed wrappers for every endpoint the RN app calls (spec/api.md §4, 42 routes).
// Each throws APIError exactly like api.ts; callers keep the RN code's own try/catch shape.
// The generic api.get/post/patch/del remain available for anything not listed.
//
//   let summary = try await api.homeSummary()           // HomeSummary?
//   let banks = try await api.linkedBanks()              // LinkedBanksData?
//   let r = try await api.accessList(mode: "plaid", designId: nil)

import Foundation

extension APIClient {
    // MARK: Auth (§3) — 1-6

    func signup(email: String, password: String, name: String, dateOfBirth: String) async throws -> AuthSessionResponse? {
        let r: Envelope<AuthSessionResponse> = try await post("/auth/signup", [
            "email": .string(email), "password": .string(password), "name": .string(name), "dateOfBirth": .string(dateOfBirth),
        ])
        return r.data
    }

    func login(email: String, password: String) async throws -> AuthSessionResponse? {
        let r: Envelope<AuthSessionResponse> = try await post("/auth/login", ["email": .string(email), "password": .string(password)])
        return r.data
    }

    /// Bodyless: no Content-Type is sent.
    func session() async throws -> SessionInfo? {
        let r: Envelope<SessionInfo> = try await post("/auth/session")
        return r.data
    }

    /// provider: "google" | "apple" | "microsoft". payload: { idToken } or Apple's { identityToken, email?, fullName? }.
    func oauthComplete(provider: String, payload: JSON) async throws -> AuthSessionResponse? {
        let r: Envelope<AuthSessionResponse> = try await post("/auth/oauth/\(provider)/complete", payload)
        return r.data
    }

    // MARK: Dashboard — 7-13

    func homeSummary() async throws -> HomeSummary? {
        let r: Envelope<HomeSummary> = try await get("/home/summary")
        return r.data
    }

    func risks(days: Int = 30) async throws -> [RiskItem] {
        let r: ListEnvelope<RiskItem> = try await get("/risks?days=\(days)")
        return r.data
    }

    func subscriptions() async throws -> [Subscription] {
        let r: ListEnvelope<Subscription> = try await get("/subscriptions")
        return r.data
    }

    /// `id` is a Subscription.id (not a merchant id). 404 "Subscription not found".
    func subscriptionDetail(id: String) async throws -> SubscriptionDetail? {
        let r: Envelope<SubscriptionDetail> = try await get("/subscriptions/\(encodeURIComponent(id))")
        return r.data
    }

    func walletInstruments() async throws -> [FundingInstrument] {
        let r: ListEnvelope<FundingInstrument> = try await get("/wallet/instruments")
        return r.data
    }

    func instrumentSummary(id: String, range: String = "last30") async throws -> InstrumentSummary? {
        let r: Envelope<InstrumentSummary> = try await get("/wallet/instruments/\(id)/summary?range=\(range)")
        return r.data
    }

    /// `range == "custom"` needs both dates (Date.toISOString values) or the server 500s.
    func instrumentMerchants(id: String, range: String = "last30", startDate: String? = nil, endDate: String? = nil) async throws -> MerchantsResponse {
        let qs: String
        if range == "custom", let startDate, let endDate {
            qs = "range=custom&startDate=\(encodeURIComponent(startDate))&endDate=\(encodeURIComponent(endDate))"
        } else {
            qs = "range=\(range)"
        }
        return try await get("/wallet/instruments/\(id)/merchants?\(qs)")
    }

    // MARK: Plaid — 14-21

    func createLinkToken() async throws -> String? {
        let r: Envelope<LinkTokenResponse> = try await post("/plaid/create-link-token")
        return r.data?.linkToken
    }

    func exchangePublicToken(publicToken: String, institutionId: String, institutionName: String, accounts: JSON? = nil, purpose: String? = nil) async throws -> ExchangeResult? {
        var body: [String: JSON] = [
            "publicToken": .string(publicToken),
            "institutionId": .string(institutionId),
            "institutionName": .string(institutionName),
        ]
        if let accounts { body["accounts"] = accounts }
        if let purpose { body["purpose"] = .string(purpose) }
        let r: Envelope<ExchangeResult> = try await post("/plaid/exchange-public-token", .object(body), timeout: PLAID_TIMEOUT)
        return r.data
    }

    /// 404 "No linked bank accounts found" is normal when nothing is linked.
    func plaidSync() async throws -> PlaidSyncResult? {
        let r: Envelope<PlaidSyncResult> = try await post("/plaid/sync", timeout: PLAID_TIMEOUT)
        return r.data
    }

    /// 404 = no bank linked yet.
    func plaidBalance() async throws -> PlaidBalance? {
        let r: Envelope<PlaidBalance> = try await get("/plaid/balance")
        return r.data
    }

    func plaidAccounts() async throws -> [PlaidItemAccounts] {
        let r: ListEnvelope<PlaidItemAccounts> = try await get("/plaid/accounts")
        return r.data
    }

    func linkedBanks() async throws -> LinkedBanksData? {
        let r: Envelope<LinkedBanksData> = try await get("/plaid/linked-banks")
        return r.data
    }

    /// `itemId` = LinkedBankItem.itemId. Turning reading ON triggers a (slow) sync.
    func setReadForSubscriptions(itemId: String, enabled: Bool) async throws -> ReadForSubscriptionsResult? {
        let r: Envelope<ReadForSubscriptionsResult> = try await post(
            "/plaid/items/\(itemId)/read-for-subscriptions", ["enabled": .bool(enabled)], timeout: enabled ? PLAID_TIMEOUT : nil)
        return r.data
    }

    func disconnectBank(itemId: String) async throws -> DisconnectBankResult? {
        let r: Envelope<DisconnectBankResult> = try await del("/plaid/items/\(itemId)")
        return r.data
    }

    // MARK: Cards — 22-26

    /// Prefer CardDesignStore.saveCardDesign (local-first). Returns the server id.
    func saveCardDesign(finish: String, strokes: [CardStroke], updatedAt: String?) async throws -> String? {
        var body: [String: JSON] = ["finish": .string(finish), "strokes": JSON(encoding: strokes)]
        if let updatedAt { body["updatedAt"] = .string(updatedAt) }
        let r: Envelope<IdResult> = try await post("/cards/designs", .object(body))
        return r.data?.id
    }

    /// mode: "plaid" | "waitlist". Never send a `local_…` designId (send nil).
    func accessList(mode: String, designId: String?) async throws -> AccessListResult? {
        let r: Envelope<AccessListResult> = try await post(
            "/cards/access-list", ["mode": .string(mode), "designId": .from(designId)], timeout: mode == "plaid" ? PLAID_TIMEOUT : nil)
        return r.data
    }

    func accessListRecord() async throws -> AccessListRecord? {
        let r: Envelope<AccessListRecord> = try await get("/cards/access-list")
        return r.data
    }

    /// Picks the Pay in 4 funding account and re-runs the assessment (slow).
    func setPayIn4Account(instrumentId: String) async throws -> AccessListResult? {
        let r: Envelope<AccessListResult> = try await post("/cards/pay-in4-account", ["instrumentId": .string(instrumentId)], timeout: PLAID_TIMEOUT)
        return r.data
    }

    func highnoteCard() async throws -> HighnoteCardView? {
        let r: Envelope<HighnoteCardView> = try await get("/cards/highnote")
        return r.data
    }

    // MARK: Savings — 27-36 (CENTS on the wire; SavingsGoalsStore is the dollar boundary)

    func savingsGoals() async throws -> [SavingsWireGoal] {
        let r: ListEnvelope<SavingsWireGoal> = try await get("/savings/goals")
        return r.data
    }

    func createSavingsGoal(_ body: JSON) async throws -> String? {
        let r: Envelope<IdResult> = try await post("/savings/goals", body)
        return r.data?.id
    }

    func updateSavingsGoal(id: String, _ body: JSON) async throws {
        try await patch("/savings/goals/\(id)", body)
    }

    func depositToGoal(id: String, amountCents: Int) async throws -> SavingsTransferResult? {
        let r: Envelope<SavingsTransferResult> = try await post("/savings/goals/\(id)/deposit", ["amountCents": .int(amountCents)])
        return r.data
    }

    func withdrawFromGoal(id: String, amountCents: Int, speed: String = "STANDARD") async throws -> SavingsTransferResult? {
        let r: Envelope<SavingsTransferResult> = try await post("/savings/goals/\(id)/withdraw", ["amountCents": .int(amountCents), "speed": .string(speed)])
        return r.data
    }

    func moveBetweenGoals(fromGoalId: String, toGoalId: String, amountCents: Int) async throws -> SavingsTransferResult? {
        let r: Envelope<SavingsTransferResult> = try await post("/savings/transfer", [
            "fromGoalId": .string(fromGoalId), "toGoalId": .string(toGoalId), "amountCents": .int(amountCents),
        ])
        return r.data
    }

    func savingsSettings() async throws -> SavingsWireSettings? {
        let r: Envelope<SavingsWireSettings> = try await get("/savings/settings")
        return r.data
    }

    func updateSavingsSettings(_ body: JSON) async throws -> SavingsWireSettings? {
        let r: Envelope<SavingsWireSettings> = try await patch("/savings/settings", body)
        return r.data
    }

    func sweepPreview() async throws -> SavingsWirePreview? {
        let r: Envelope<SavingsWirePreview> = try await get("/savings/sweep/preview")
        return r.data
    }

    func savingsTransfers() async throws -> [SavingsWireTransfer] {
        let r: ListEnvelope<SavingsWireTransfer> = try await get("/savings/transfers")
        return r.data
    }

    // MARK: Account — 37-40

    /// GDPR/CCPA export, opaque: the pretty-printed `data` (RN: JSON.stringify(res.data, null, 2)).
    func accountExport() async throws -> JSON {
        let r = try await getJSON("/account/export")
        return r["data"] ?? .null
    }

    /// Irreversible. Revokes every Plaid item server-side FIRST (CLAUDE.md).
    func deleteAccount() async throws -> AccountDeleteResult? {
        let r: Envelope<AccountDeleteResult> = try await del("/account")
        return r.data
    }

    func devStatus() async throws -> DevStatus? {
        let r: Envelope<DevStatus> = try await get("/account/dev-status")
        return r.data
    }

    func devUnlock(code: String) async throws -> DevUnlockResult? {
        let r: Envelope<DevUnlockResult> = try await post("/account/dev-unlock", ["code": .string(code)])
        return r.data
    }

    // MARK: Inbox scan — 41-42

    func inboxScanEnabled() async throws -> Bool {
        let r: Envelope<InboxScanEnabled> = try await get("/inbox-scan/enabled")
        return r.data?.enabled ?? false
    }

    func postDetectedSubscriptions(_ items: [DetectedSubscriptionInput]) async throws -> DetectedResult? {
        let r: Envelope<DetectedResult> = try await post("/subscriptions/detected", ["items": JSON(encoding: items)])
        return r.data
    }
}

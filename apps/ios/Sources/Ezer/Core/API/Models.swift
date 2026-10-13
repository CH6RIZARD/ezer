// Port of apps/mobile/types/index.ts (the types the running app references) and the response
// shapes of every endpoint in spec/api.md (contexts/DataContext.tsx, utils/linkedBanks.ts,
// utils/SavingsGoalsContext.tsx, utils/cardDesignStore.ts, app/(tabs)/payin4.tsx ...).
//
// Field names = JSON keys = the RN property names. Dates the RN code keeps as strings stay
// Strings here (dueDate, renewalDate, ...): date-only values are LOCAL days, parse them with
// parseLocalDay(), never with an ISO8601 (UTC) parser. Full timestamps: parseISODate().
// Every model decodes leniently (Lenient.swift): missing / null / mistyped fields take a default
// and bad array elements are skipped, so one odd row can't blank a screen.

import Foundation

// MARK: - types/index.ts

enum CardBrand: String, Codable, Sendable { case Visa, Mastercard, Amex, Discover, Bank, Unknown }
enum BillingInterval: String, Codable, Sendable { case monthly, yearly, weekly, unknown }
enum SubscriptionStatus: String, Codable, Sendable { case active, trial, canceled, paused }
enum AllocationTarget: String, Codable, Sendable { case savings, debt, investing, subscription }
enum PremiumStatus: String, Codable, Sendable { case loading, trial, expired, premium }

/// types/index.ts SubscriptionCharge (used by calculations.ts's lifetime / history helpers).
struct SubscriptionCharge: Codable, Hashable, Sendable {
    var id: String
    var merchantId: String
    var merchantName: String
    var amountCents: Int
    var currency: String
    var billingInterval: BillingInterval
    var chargeTimestamp: Date
    var fundingInstrumentId: String
    var inferenceSource: String
    var confidenceScore: Double
    var evidenceRef: String?
}

// MARK: - Auth (§3)

/// POST /auth/login, /auth/signup, /auth/oauth/<p>/complete — `data`.
struct AuthSessionResponse: Codable, Hashable, Sendable {
    var token: String
    var userId: String
    var email: String
    var name: String?
    var provider: String?
}
extension AuthSessionResponse {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        token = c.str("token"); userId = c.str("userId"); email = c.str("email")
        name = c.strOpt("name"); provider = c.strOpt("provider")
    }
}

/// POST /auth/session — `data`.
struct SessionInfo: Codable, Hashable, Sendable {
    var userId: String
    var email: String
    var authProviders: [String]
}
extension SessionInfo {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        userId = c.str("userId"); email = c.str("email"); authProviders = c.strList("authProviders")
    }
}

// MARK: - Dashboard (DataContext.tsx)

/// GET /home/summary
struct HomeSummary: Codable, Hashable, Sendable {
    var monthlyBurnRate: Int   // cents
    var next30DayRisk: Int     // cents
    var silentSubscriptionsCount: Int
    var totalSubscriptions: Int
    var activeTrials: Int
}
extension HomeSummary {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        monthlyBurnRate = c.int("monthlyBurnRate"); next30DayRisk = c.int("next30DayRisk")
        silentSubscriptionsCount = c.int("silentSubscriptionsCount")
        totalSubscriptions = c.int("totalSubscriptions"); activeTrials = c.int("activeTrials")
    }
}

/// GET /risks?days=30 — one element.
struct RiskItem: Codable, Hashable, Sendable, Identifiable {
    var id: String
    /// 'trial' | 'renewal'
    var type: String
    var merchantName: String
    var logo: String?
    var amountCents: Int
    /// ISO timestamp; its DATE part is the meaning -> parseLocalDay(dueDate).
    var dueDate: String
    var daysUntilDue: Int
    var subscriptionId: String
    var trialId: String?
}
extension RiskItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); type = c.str("type"); merchantName = c.str("merchantName"); logo = c.strOpt("logo")
        amountCents = c.int("amountCents"); dueDate = c.str("dueDate"); daysUntilDue = c.int("daysUntilDue")
        subscriptionId = c.str("subscriptionId"); trialId = c.strOpt("trialId")
    }
}

/// GET /wallet/instruments — one element (DataContext's FundingInstrument + the extra row fields).
struct FundingInstrument: Codable, Hashable, Sendable, Identifiable {
    var id: String
    /// 'card' | 'bank'
    var type: String
    var displayName: String
    var brand: String
    var last4: String
    var issuerColorHint: String?
    /// Bank logo: a data: URI (Plaid) or a favicon URL.
    var networkArt: String?
    /// RESERVED: issuer-approved network-token art. Nothing populates it yet (CLAUDE.md).
    var networkTokenArtUri: String?
    /// The BANK's name ("PNC Bank"), distinct from displayName (the account's nickname).
    var institutionName: String?
    /// UI grouping label only — 'pay_in_4' when linked from Spending Power's "Connect a new bank".
    var purpose: String?
    var isDefault: Bool
    var plaidAccountId: String?
    /// 'checking' | 'savings' | 'credit card' ...
    var subtype: String?
    /// EZER's PlaidItem.id.
    var itemId: String?
}
extension FundingInstrument {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); type = c.str("type"); displayName = c.str("displayName"); brand = c.str("brand")
        last4 = c.str("last4"); issuerColorHint = c.strOpt("issuerColorHint"); networkArt = c.strOpt("networkArt")
        networkTokenArtUri = c.strOpt("networkTokenArtUri"); institutionName = c.strOpt("institutionName")
        purpose = c.strOpt("purpose"); isDefault = c.bool("isDefault"); plaidAccountId = c.strOpt("plaidAccountId")
        subtype = c.strOpt("subtype"); itemId = c.strOpt("itemId")
    }
}

struct TopMerchant: Codable, Hashable, Sendable {
    var merchantId: String
    var merchantName: String
    var logo: String?
    var drainedAmountCents: Int
}
extension TopMerchant {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        merchantId = c.str("merchantId"); merchantName = c.str("merchantName"); logo = c.strOpt("logo")
        drainedAmountCents = c.int("drainedAmountCents")
    }
}

/// GET /wallet/instruments/:id/summary?range= (defined in DataContext; no screen calls it).
struct InstrumentSummary: Codable, Hashable, Sendable {
    var id: String
    var type: String
    var displayName: String
    var brand: String
    var last4: String
    var networkArt: String?
    var issuerColorHint: String?
    var isDefault: Bool
    var drainedAmountCents: Int
    var activeSubscriptionsCount: Int
    var topMerchants: [TopMerchant]
}
extension InstrumentSummary {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); type = c.str("type"); displayName = c.str("displayName"); brand = c.str("brand")
        last4 = c.str("last4"); networkArt = c.strOpt("networkArt"); issuerColorHint = c.strOpt("issuerColorHint")
        isDefault = c.bool("isDefault"); drainedAmountCents = c.int("drainedAmountCents")
        activeSubscriptionsCount = c.int("activeSubscriptionsCount"); topMerchants = c.list("topMerchants")
    }
}

/// GET /wallet/instruments/:id/merchants — one `data` element.
struct MerchantCharge: Codable, Hashable, Sendable {
    /// Null when this merchant has no active/trial Subscription row (e.g. since cancelled).
    var subscriptionId: String?
    var merchantId: String
    var merchantName: String
    var logo: String?
    var chargeCount: Int
    var totalDrainedCents: Int
    var monthlyEquivalentCents: Int
    /// 'monthly' | 'yearly' | 'weekly' | 'unknown'
    var billingInterval: String
    /// 'high' | 'medium' | 'low'
    var confidenceBadge: String
    var confidenceScore: Double
}
extension MerchantCharge {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        subscriptionId = c.strOpt("subscriptionId"); merchantId = c.str("merchantId"); merchantName = c.str("merchantName")
        logo = c.strOpt("logo"); chargeCount = c.int("chargeCount"); totalDrainedCents = c.int("totalDrainedCents")
        monthlyEquivalentCents = c.int("monthlyEquivalentCents"); billingInterval = c.str("billingInterval", "unknown")
        confidenceBadge = c.str("confidenceBadge", "low"); confidenceScore = c.dbl("confidenceScore")
    }
}

/// A recurring charge projected inside the range that hasn't posted yet.
struct PredictedCharge: Codable, Hashable, Sendable {
    var merchantId: String
    var merchantName: String
    var logo: String?
    var amountCents: Int
    var predictedDate: String
}
extension PredictedCharge {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        merchantId = c.str("merchantId"); merchantName = c.str("merchantName"); logo = c.strOpt("logo")
        amountCents = c.int("amountCents"); predictedDate = c.str("predictedDate")
    }
}

/// The whole /wallet/instruments/:id/merchants body: `data` plus the TOP-LEVEL `predicted`.
struct MerchantsResponse: Decodable, Sendable {
    var data: [MerchantCharge]
    var predictedItems: [PredictedCharge]
    var predictedTotalCents: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        data = c.list("data")
        let p = c.obj("predicted", PredictedBlock.self)
        predictedItems = p?.items ?? []
        predictedTotalCents = p?.totalCents ?? 0
    }

    private struct PredictedBlock: Decodable {
        var items: [PredictedCharge]
        var totalCents: Int
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: AnyKey.self)
            items = c.list("items"); totalCents = c.int("totalCents")
        }
    }
}

/// GET /subscriptions — one element (the fields DataContext's Subscription declares).
struct Subscription: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var merchantId: String
    var merchantName: String
    var logo: String?
    /// 'active' | 'trial' | 'canceled' | 'paused'
    var status: String
    /// 'monthly' | 'yearly' | 'weekly' | 'unknown'
    var cadence: String
    var renewalDate: String?
    var startedAt: String
    /// Recurring price; optional because the API does not always send one.
    var amountCents: Int?
    /// Plaid-supplied domain — feeds cancellation auto-discovery.
    var website: String?
    /// A curated real cancellation URL from the merchant's playbook.
    var cancellationUrl: String?
}
extension Subscription {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); merchantId = c.str("merchantId"); merchantName = c.str("merchantName"); logo = c.strOpt("logo")
        status = c.str("status"); cadence = c.str("cadence", "unknown"); renewalDate = c.strOpt("renewalDate")
        startedAt = c.str("startedAt"); amountCents = c.intOpt("amountCents"); website = c.strOpt("website")
        cancellationUrl = c.strOpt("cancellationUrl")
    }
}

struct PriceHistoryRow: Codable, Hashable, Sendable {
    var id: String
    var subscriptionId: String
    /// "YYYY-MM" (a string, not a date).
    var month: String
    var amountCents: Int
    var createdAt: String
}
extension PriceHistoryRow {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); subscriptionId = c.str("subscriptionId"); month = c.str("month")
        amountCents = c.int("amountCents"); createdAt = c.str("createdAt")
    }
}

struct ChargeFundingInstrument: Codable, Hashable, Sendable {
    var displayName: String
    var brand: String
    var last4: String
}
extension ChargeFundingInstrument {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        displayName = c.str("displayName"); brand = c.str("brand"); last4 = c.str("last4")
    }
}

struct SubscriptionDetailCharge: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var amountCents: Int
    var chargeTimestamp: String
    var fundingInstrument: ChargeFundingInstrument?
}
extension SubscriptionDetailCharge {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); amountCents = c.int("amountCents"); chargeTimestamp = c.str("chargeTimestamp")
        fundingInstrument = c.obj("fundingInstrument")
    }
}

/// GET /subscriptions/:id
struct SubscriptionDetail: Codable, Hashable, Sendable {
    var id: String
    var merchantId: String
    var merchantName: String
    var logo: String?
    var website: String?
    var status: String
    var cadence: String
    var renewalDate: String?
    var startedAt: String
    var cancellationUrl: String?
    var cancellationDifficulty: Int
    /// "Easy" | "Medium" | "Hard" | "Very Hard" | "Extreme"
    var difficultyLabel: String
    /// Newest first.
    var charges: [SubscriptionDetailCharge]
    /// ALL months, month DESC.
    var priceHistory: [PriceHistoryRow]
    var lifetimeCostCents: Int
    var investmentOpportunityCostCents: Int
}
extension SubscriptionDetail {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); merchantId = c.str("merchantId"); merchantName = c.str("merchantName"); logo = c.strOpt("logo")
        website = c.strOpt("website"); status = c.str("status"); cadence = c.str("cadence", "unknown")
        renewalDate = c.strOpt("renewalDate"); startedAt = c.str("startedAt"); cancellationUrl = c.strOpt("cancellationUrl")
        cancellationDifficulty = c.int("cancellationDifficulty", 3); difficultyLabel = c.str("difficultyLabel")
        charges = c.list("charges"); priceHistory = c.list("priceHistory")
        lifetimeCostCents = c.int("lifetimeCostCents"); investmentOpportunityCostCents = c.int("investmentOpportunityCostCents")
    }
}

// MARK: - Plaid

/// POST /plaid/create-link-token
struct LinkTokenResponse: Codable, Hashable, Sendable { var linkToken: String }
extension LinkTokenResponse {
    init(from decoder: Decoder) throws { linkToken = try decoder.container(keyedBy: AnyKey.self).str("linkToken") }
}

/// POST /plaid/exchange-public-token — itemId is PLAID's item_id (not usable with /plaid/items/:id).
struct ExchangeResult: Codable, Hashable, Sendable {
    var itemId: String
    var institutionName: String
}
extension ExchangeResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        itemId = c.str("itemId"); institutionName = c.str("institutionName")
    }
}

struct ReauthItem: Codable, Hashable, Sendable {
    var plaidItemId: String
    var institutionName: String?
    /// Plaid error_code, e.g. "ITEM_LOGIN_REQUIRED".
    var reason: String
}
extension ReauthItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        plaidItemId = c.str("plaidItemId"); institutionName = c.strOpt("institutionName"); reason = c.str("reason")
    }
}

/// POST /plaid/sync (404 "No linked bank accounts found" is a NORMAL state).
struct PlaidSyncResult: Codable, Hashable, Sendable {
    var newSubscriptionsDetected: Int
    var itemsNeedingReauth: [ReauthItem]
}
extension PlaidSyncResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        newSubscriptionsDetected = c.int("newSubscriptionsDetected"); itemsNeedingReauth = c.list("itemsNeedingReauth")
    }
}

struct PlaidBalanceAccount: Codable, Hashable, Sendable {
    var accountId: String
    var name: String
    var mask: String?
    /// "depository" | "credit" | "loan" | "investment" | ...
    var type: String
    var subtype: String?
    var institutionName: String?
    var availableCents: Int
    var currentCents: Int
    var isoCurrencyCode: String
}
extension PlaidBalanceAccount {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        accountId = c.str("accountId"); name = c.str("name"); mask = c.strOpt("mask"); type = c.str("type")
        subtype = c.strOpt("subtype"); institutionName = c.strOpt("institutionName")
        availableCents = c.int("availableCents"); currentCents = c.int("currentCents")
        isoCurrencyCode = c.str("isoCurrencyCode", "USD")
    }
}

/// GET /plaid/balance (404 = no bank yet).
struct PlaidBalance: Codable, Hashable, Sendable {
    var accounts: [PlaidBalanceAccount]
    var checkingAccountId: String?
    var checkingAvailableCents: Int?
}
extension PlaidBalance {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        accounts = c.list("accounts"); checkingAccountId = c.strOpt("checkingAccountId")
        checkingAvailableCents = c.intOpt("checkingAvailableCents")
    }
}

struct PlaidItemAccount: Codable, Hashable, Sendable {
    var id: String
    var name: String
    var mask: String?
    var type: String
    var subtype: String?
    var institutionId: String
    var institutionName: String
}
extension PlaidItemAccount {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.strOpt("account_id") ?? c.str("id"); name = c.str("name"); mask = c.strOpt("mask"); type = c.str("type")
        subtype = c.strOpt("subtype"); institutionId = c.str("institutionId"); institutionName = c.str("institutionName")
    }
}

/// GET /plaid/accounts — one element (no screen uses it).
struct PlaidItemAccounts: Codable, Hashable, Sendable {
    /// PLAID item_id (not usable with /plaid/items/:id).
    var itemId: String
    var institutionName: String?
    var institutionId: String?
    var accounts: [PlaidItemAccount]
    var lastSyncAt: String?
}
extension PlaidItemAccounts {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        itemId = c.str("itemId"); institutionName = c.strOpt("institutionName"); institutionId = c.strOpt("institutionId")
        accounts = c.list("accounts"); lastSyncAt = c.strOpt("lastSyncAt")
    }
}

/// GET /plaid/linked-banks (types are utils/linkedBanks.ts's — Settings' LinkedBanks.swift reuses
/// these and must not redeclare them).
struct LinkedBankAccount: Codable, Hashable, Sendable, Identifiable {
    var instrumentId: String
    var displayName: String
    var last4: String
    var subtype: String?
    /// 'bank' = depository (checking/savings), 'card' = credit. Only 'bank' can fund Pay in 4.
    var type: String
    var isPayIn4: Bool
    var eligibleForPayIn4: Bool
    var id: String { instrumentId }
}
extension LinkedBankAccount {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        instrumentId = c.str("instrumentId"); displayName = c.str("displayName"); last4 = c.str("last4")
        subtype = c.strOpt("subtype"); type = c.str("type"); isPayIn4 = c.bool("isPayIn4")
        eligibleForPayIn4 = c.bool("eligibleForPayIn4")
    }
}

struct LinkedBankItem: Codable, Hashable, Sendable, Identifiable {
    /// EZER's PlaidItem.id — the id for /plaid/items/:id.
    var itemId: String
    var institutionName: String?
    var connectedAt: String
    var readForSubscriptions: Bool
    var networkArt: String?
    var issuerColorHint: String?
    var accounts: [LinkedBankAccount]
    var id: String { itemId }
}
extension LinkedBankItem {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        itemId = c.str("itemId"); institutionName = c.strOpt("institutionName"); connectedAt = c.str("connectedAt")
        readForSubscriptions = c.bool("readForSubscriptions", true); networkArt = c.strOpt("networkArt")
        issuerColorHint = c.strOpt("issuerColorHint"); accounts = c.list("accounts")
    }
}

struct LinkedBanksData: Codable, Hashable, Sendable {
    var payIn4InstrumentId: String?
    var items: [LinkedBankItem]
}
extension LinkedBanksData {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        payIn4InstrumentId = c.strOpt("payIn4InstrumentId"); items = c.list("items")
    }
}

/// POST /plaid/items/:id/read-for-subscriptions
struct ReadForSubscriptionsResult: Codable, Hashable, Sendable {
    var readForSubscriptions: Bool
    var newSubscriptionsDetected: Int?
}
extension ReadForSubscriptionsResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        readForSubscriptions = c.bool("readForSubscriptions"); newSubscriptionsDetected = c.intOpt("newSubscriptionsDetected")
    }
}

/// DELETE /plaid/items/:id
struct DisconnectBankResult: Codable, Hashable, Sendable {
    var disconnected: Bool
    var payIn4Cleared: Bool
}
extension DisconnectBankResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        disconnected = c.bool("disconnected"); payIn4Cleared = c.bool("payIn4Cleared")
    }
}

// MARK: - Cards

/// `{ id }` — POST /cards/designs, POST /savings/goals, PATCH /savings/goals/:id.
struct IdResult: Codable, Hashable, Sendable { var id: String }
extension IdResult {
    init(from decoder: Decoder) throws { id = try decoder.container(keyedBy: AnyKey.self).str("id") }
}

/// POST /cards/access-list and POST /cards/pay-in4-account — `data`.
/// waitlist: { status: "waitlist" }; plaid: { status: "approved_pending_issuance" | "suspended", limitCents, trustScore }.
struct AccessListResult: Codable, Hashable, Sendable {
    var status: String
    var limitCents: Int?
    var trustScore: Int?
}
extension AccessListResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        status = c.str("status"); limitCents = c.intOpt("limitCents"); trustScore = c.intOpt("trustScore")
    }
}

/// GET /cards/access-list — `data` (null when never assessed / anonymous).
struct AccessListRecord: Codable, Hashable, Sendable {
    /// "approved_pending_issuance" | "waitlist" | "suspended" | legacy "manual_review"
    var status: String
    /// Absent when null or 0.
    var limitCents: Int?
    var joinedAt: String?
}
extension AccessListRecord {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        status = c.str("status"); limitCents = c.intOpt("limitCents"); joinedAt = c.strOpt("joinedAt")
    }
}

struct HighnoteCard: Codable, Hashable, Sendable {
    var last4: String
    /// "M/YY", e.g. "9/29"
    var expiry: String
    var network: String
    var state: String
}
extension HighnoteCard {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        last4 = c.str("last4"); expiry = c.str("expiry"); network = c.str("network"); state = c.str("state")
    }
}

struct HighnotePlan: Codable, Hashable, Sendable {
    var totalCents: Int
    var perPaymentCents: Int
    var paid: Int
    var count: Int
    var dueDates: [String]
}
extension HighnotePlan {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        totalCents = c.int("totalCents"); perPaymentCents = c.int("perPaymentCents"); paid = c.int("paid")
        count = c.int("count", 4); dueDates = c.strList("dueDates")
    }
}

/// GET /cards/highnote — the user's Highnote TEST card ("none" | "pending" | "ready").
struct HighnoteCardView: Codable, Hashable, Sendable {
    var status: String
    var card: HighnoteCard?
    var limitCents: Int?
    var plans: [HighnotePlan]?
}
extension HighnoteCardView {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        status = c.str("status", "none"); card = c.obj("card"); limitCents = c.intOpt("limitCents")
        plans = c.raw("plans") == nil ? nil : c.list("plans")
    }
}

// MARK: - Savings (wire types: integer CENTS; SavingsGoalsStore converts to dollars)

/// `rule` on a goal.
struct SavingsRule: Codable, Hashable, Sendable {
    /// "FIXED" | "ADAPTIVE"
    var mode: String
    var cadence: String
    var fixedAmountCents: Int?
    var maxPeriodCents: Int?
    var aggressiveness: Double
}
extension SavingsRule {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        mode = c.str("mode"); cadence = c.str("cadence"); fixedAmountCents = c.intOpt("fixedAmountCents")
        maxPeriodCents = c.intOpt("maxPeriodCents"); aggressiveness = c.dbl("aggressiveness", 0.5)
    }
}

/// GET /savings/goals — one element (SavingsGoalsContext's WireGoal).
struct SavingsWireGoal: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    var targetCents: Int
    var targetDate: String?
    var priority: Int
    /// 'ACTIVE' | 'PAUSED' | 'COMPLETE' | 'CLOSED'
    var status: String
    var fundedCents: Int
    var withdrawableCents: Int
    var rule: SavingsRule?
}
extension SavingsWireGoal {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); name = c.str("name"); targetCents = c.int("targetCents"); targetDate = c.strOpt("targetDate")
        priority = c.int("priority", 100); status = c.str("status", "ACTIVE"); fundedCents = c.int("fundedCents")
        withdrawableCents = c.int("withdrawableCents"); rule = c.obj("rule")
    }
}

/// GET / PATCH /savings/settings (WireSettings).
struct SavingsWireSettings: Codable, Hashable, Sendable {
    var minCheckingCents: Int
    var maxWeeklyCents: Int
    var pausedUntil: String?
    var consecutiveFailures: Int
}
extension SavingsWireSettings {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        minCheckingCents = c.int("minCheckingCents"); maxWeeklyCents = c.int("maxWeeklyCents")
        pausedUntil = c.strOpt("pausedUntil"); consecutiveFailures = c.int("consecutiveFailures")
    }
}

/// GET /savings/sweep/preview (WirePreview) — both shapes in one struct.
struct SavingsWirePreview: Codable, Hashable, Sendable {
    var periodKey: String
    var wouldSweep: Bool
    var reason: String?
    var amountCents: Int?
    var projectedLowCents: Int?
    var activeGoals: Int?
}
extension SavingsWirePreview {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        periodKey = c.str("periodKey"); wouldSweep = c.bool("wouldSweep"); reason = c.strOpt("reason")
        amountCents = c.intOpt("amountCents"); projectedLowCents = c.intOpt("projectedLowCents"); activeGoals = c.intOpt("activeGoals")
    }
}

/// GET /savings/transfers — one element (WireTransfer).
struct SavingsWireTransfer: Codable, Hashable, Sendable, Identifiable {
    var id: String
    var goalId: String?
    /// 'DEBIT' (bank -> EZER) | 'CREDIT' (EZER -> bank)
    var direction: String
    var amountCents: Int
    var status: String
    var settlesAt: String?
    var createdAt: String
}
extension SavingsWireTransfer {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        id = c.str("id"); goalId = c.strOpt("goalId"); direction = c.str("direction"); amountCents = c.int("amountCents")
        status = c.str("status"); settlesAt = c.strOpt("settlesAt"); createdAt = c.str("createdAt")
    }
}

/// POST /savings/goals/:id/deposit, /withdraw, /savings/transfer — `data`.
struct SavingsTransferResult: Codable, Hashable, Sendable {
    var transferId: String
    var settlesAt: String?
}
extension SavingsTransferResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        transferId = c.str("transferId"); settlesAt = c.strOpt("settlesAt")
    }
}

// MARK: - Account

/// GET /account/dev-status
struct DevStatus: Codable, Hashable, Sendable { var devUnlocked: Bool }
extension DevStatus {
    init(from decoder: Decoder) throws { devUnlocked = try decoder.container(keyedBy: AnyKey.self).bool("devUnlocked") }
}

/// POST /account/dev-unlock
struct DevUnlockResult: Codable, Hashable, Sendable { var unlockedUntil: String }
extension DevUnlockResult {
    init(from decoder: Decoder) throws { unlockedUntil = try decoder.container(keyedBy: AnyKey.self).str("unlockedUntil") }
}

/// DELETE /account
struct AccountDeleteResult: Codable, Hashable, Sendable {
    var deleted: Bool
    var plaidItemsRevoked: Int
}
extension AccountDeleteResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        deleted = c.bool("deleted"); plaidItemsRevoked = c.int("plaidItemsRevoked")
    }
}

// MARK: - Inbox scan

/// GET /inbox-scan/enabled
struct InboxScanEnabled: Codable, Hashable, Sendable { var enabled: Bool }
extension InboxScanEnabled {
    init(from decoder: Decoder) throws { enabled = try decoder.container(keyedBy: AnyKey.self).bool("enabled") }
}

/// One item of POST /subscriptions/detected. ONLY these derived fields — never a subject, body,
/// sender or token (privacy policy + Google's scope review depend on it; CLAUDE.md).
struct DetectedSubscriptionInput: Codable, Hashable, Sendable {
    var merchant: String
    var amountCents: Int?
    var currency: String?
    /// 'monthly' | 'yearly' | 'weekly' | 'unknown'
    var cadence: String
    var nextChargeDate: String?
    var trialEndsAt: String?
    var cancelUrl: String?
    /// 'gmail' | 'outlook'
    var source: String
    var confidence: Double

    /// Encodes nulls explicitly, like JSON.stringify.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: AnyKey.self)
        try c.encode(merchant, forKey: AnyKey("merchant"))
        try c.encode(amountCents, forKey: AnyKey("amountCents"))
        try c.encode(currency, forKey: AnyKey("currency"))
        try c.encode(cadence, forKey: AnyKey("cadence"))
        try c.encode(nextChargeDate, forKey: AnyKey("nextChargeDate"))
        try c.encode(trialEndsAt, forKey: AnyKey("trialEndsAt"))
        try c.encode(cancelUrl, forKey: AnyKey("cancelUrl"))
        try c.encode(source, forKey: AnyKey("source"))
        try c.encode(confidence, forKey: AnyKey("confidence"))
    }
}

/// POST /subscriptions/detected — `data`.
struct DetectedResult: Codable, Hashable, Sendable {
    var created: Int
    var updated: Int
}
extension DetectedResult {
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AnyKey.self)
        created = c.int("created"); updated = c.int("updated")
    }
}

// MARK: - Dates

private let isoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
private let isoPlain = ISO8601DateFormatter()

/// `new Date(iso)` for a full server timestamp ("2026-10-12T16:45:16.528Z"). nil when unparsable.
/// For DATE-ONLY meanings (renewal/due dates) use parseLocalDay instead.
func parseISODate(_ s: String) -> Date? {
    isoFrac.date(from: s) ?? isoPlain.date(from: s)
}

/// `date.toISOString()` — UTC with milliseconds, e.g. "2026-10-12T16:45:16.528Z".
func toISOString(_ d: Date) -> String {
    isoFrac.string(from: d)
}

/// Date.now() in milliseconds.
func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

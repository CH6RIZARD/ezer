// Port of apps/mobile/utils/SavingsGoalsContext.tsx
//
// A CLIENT of `/savings/*` (the server holds the real ledger). UNITS: the API speaks integer CENTS
// on the wire, always; this store converts once, at the boundary, and exposes DOLLARS. Every
// conversion in the app lives here. Goal icon/colour are device-local (`@ezer_goal_appearance_v1`),
// falling back to FALLBACK_ICONS[hashIndex(id)] and the theme's accInk.
//
//   @Environment(SavingsGoalsStore.self) private var savings
//   savings.goals / savings.preview / savings.checkingBalance / savings.totalSaved
//   let res = await savings.depositToGoal(id, 25)   // res.ok / res.error
//
// Mounted at the root because Home, Wallet (SubscriptionDetail) and Savings all read it.
// Re-fetches when the app returns to the foreground, debounced to once per 30 000ms.

import Foundation
import Observation

struct SavingsGoal: Hashable, Sendable, Identifiable {
    var id: String
    var name: String
    /** DOLLARS. */
    var targetAmount: Double
    /** DOLLARS, derived from the ledger server-side. */
    var currentAmount: Double
    /** DOLLARS available now — excludes funds inside the ACH return window. */
    var withdrawable: Double
    /// Ionicons name.
    var icon: String
    /// CSS colour string.
    var color: String
    /** True when the sweep feeds this goal (server status ACTIVE). */
    var autoSave: Bool
    /// 'ACTIVE' | 'PAUSED' | 'COMPLETE' | 'CLOSED'
    var status: String
}

/// 'transfer' | 'withdraw' | 'move'
enum SavingsTxType: String, Sendable { case transfer, withdraw, move }

struct SavingsTransaction: Hashable, Sendable, Identifiable {
    var id: String
    var type: SavingsTxType
    var goalId: String?
    /** Always POSITIVE. `type` carries the direction. */
    var amountDollars: Double
    var date: Date
    var status: String
    /** True until the ACH return window has elapsed. */
    var pending: Bool
}

/// One subscription feeding Subscription savings. DOLLARS, like the rest of this file.
struct PoolSource: Hashable, Sendable, Identifiable {
    var subscriptionId: String
    var merchantName: String
    /// 'HALF' | 'MATCH' — what each charge moves into Subscription savings.
    var mode: String
    /// 'ACTIVE' | 'PAUSED' | 'ENDED'
    var status: String
    /// What the next charge moves (HALF = half the charge, MATCH = all of it).
    var perCharge: Double
    /// On settled transfers.
    var saved: Double
    /// On transfers still clearing.
    var pending: Double
    /// Accrued from charges, waiting for the weekly sweep.
    var queued: Double
    /// saved + pending + queued: what this source has put toward the goal. No ACH processor exists
    /// yet, so `saved` stays 0 and this is the figure to show.
    var total: Double
    var logo: String?
    var renewalDate: String?
    var charges: Int
    var startedAt: String
    var endedAt: String?
    var id: String { subscriptionId }
}

/// The ONE subscription-savings goal (PATCH-NOTES-subscription-savings.md). nil until the first
/// source is enabled, and whenever the API cannot say.
struct SubscriptionPool: Hashable, Sendable {
    var goalId: String
    /// DOLLARS: the pool's ledger balance plus its sources' pending + queued. The ledger holds the
    /// settled sweeps AND whatever was moved in or withdrawn (Withdraw / Move treat the pool like any
    /// goal), so the sources' `saved` is already in it. Until ACH exists the ledger is 0 and this is
    /// pending + queued.
    var saved: Double
    /// DOLLARS every ACTIVE source moves on its next charge, summed.
    var perCycle: Double
    var sources: [PoolSource]
    var recent: [PoolRecent]
}

/// One charge-driven save. DOLLARS.
struct PoolRecent: Hashable, Sendable, Identifiable {
    var id: String
    var subscriptionId: String
    var merchantName: String
    var amount: Double
    /// 'queued' | 'pending' | 'saved'
    var state: String
    var date: Date?
}

/// { ok: true; id? } | { ok: false; error }
struct MoveResult: Sendable {
    let ok: Bool
    let id: String?
    let error: String?
    static func success(_ id: String? = nil) -> MoveResult { MoveResult(ok: true, id: id, error: nil) }
    static func failure(_ error: String) -> MoveResult { MoveResult(ok: false, id: nil, error: error) }
}

struct AutoSaveSettings: Hashable, Sendable {
    /** False when the server has the sweep paused. */
    var enabled: Bool
    /** DOLLARS — the floor the sweep never goes below. */
    var bufferDollars: Double
    /** DOLLARS — weekly ceiling the server enforces. */
    var weeklyCapDollars: Double
}

struct SweepPreview: Hashable, Sendable {
    /** DOLLARS the server would move now; 0 when it would skip. */
    var amountDollars: Double
    var wouldSweep: Bool
    /** True when we could not reach the preview endpoint ("we could not check", not "nothing"). */
    var unknown: Bool
    /** Server's machine-readable reason, e.g. ITEM_NEEDS_REAUTH. */
    var reason: String?
    /** Human sentence for that reason, resolved here so screens stay dumb. */
    var explanation: String
    var activeGoals: Int
}

struct NewGoalInput: Sendable {
    var name: String
    var targetAmount: Double
    var icon: String?
    var color: String?
    var autoSave: Bool?
    /** Save this many dollars every month (FIXED/MONTHLY rule). nil = adaptive. */
    var monthlyAmount: Double?

    init(name: String, targetAmount: Double, icon: String? = nil, color: String? = nil, autoSave: Bool? = nil, monthlyAmount: Double? = nil) {
        self.name = name; self.targetAmount = targetAmount; self.icon = icon; self.color = color
        self.autoSave = autoSave; self.monthlyAmount = monthlyAmount
    }
}

private func toDollars(_ cents: Int) -> Double { Double(cents) / 100 }
/// Math.round(dollars * 100). Non-finite / absurd input becomes 0 instead of trapping in Int(_:)
/// (RN sent null for Infinity/NaN; the server rejects both with the same 400).
private func toCents(_ dollars: Double) -> Int {
    let c = jsRound(dollars * 100)
    return c.isFinite && abs(c) < 9e15 ? Int(c) : 0
}

/** Appearance the server does not store. */
private let APPEARANCE_KEY = "@ezer_goal_appearance_v1"
private struct Look: Codable, Hashable { var icon: String?; var color: String? }

let FALLBACK_ICONS = [
    "shield-checkmark",
    "airplane",
    "home",
    "car-sport",
    "school",
    "gift",
    "heart",
    "laptop",
    "medkit",
    "flag",
]

/** Stable per-goal index, so the same goal keeps the same look everywhere. */
func hashIndex(_ id: String, _ buckets: Int) -> Int {
    var h: UInt32 = 0
    for unit in id.utf16 { h = h &* 31 &+ UInt32(unit) } // (h * 31 + charCode) >>> 0
    return Int(h % UInt32(buckets))
}

/**
 * Turn a server reason code into something a person can act on.
 */
private func explainReason(_ reason: String?, _ wouldSweep: Bool, _ amountCents: Int, _ hasBank: Bool) -> String {
    if wouldSweep && amountCents > 0 { return "" }
    switch reason {
    case "ITEM_NEEDS_REAUTH":
        return hasBank
            ? "We have lost the connection to your bank. Reconnect it to start saving again."
            : "Connect your bank and we will start putting money aside for you."
    case "NO_FUNDING_SOURCE":
        return "Link a bank account and we will start putting money aside for you."
    case "PAUSED":
        return "Automatic saving is paused. Resume it whenever you are ready."
    case "ALREADY_RUN":
        return "Already saved this week. We look again next week."
    case "WEEKLY_CAP_REACHED":
        return "You have hit your weekly saving cap. It resets next week."
    case "BELOW_BUFFER", "INSUFFICIENT_FUNDS":
        return "Your balance is at or below the buffer you set, so we are skipping this one."
    case "NO_ACTIVE_GOALS":
        return "Turn on automatic saving for a goal and we will start moving money into it."
    default:
        return "Nothing to move right now. We check again each week."
    }
}

/**
 * Classify a Transfer row for the activity feed. An internal goal-to-goal move is the ONLY transfer
 * created already-SETTLED with a same-day `settlesAt`.
 */
private func classify(_ t: SavingsWireTransfer) -> SavingsTxType {
    if t.direction == "CREDIT" { return .withdraw }
    if t.status == "SETTLED", let s = t.settlesAt, let settles = parseISODate(s), let created = parseISODate(t.createdAt), settles <= created {
        return .move
    }
    return .transfer
}

private let EMPTY_PREVIEW = SweepPreview(amountDollars: 0, wouldSweep: false, unknown: false, reason: nil, explanation: "", activeGoals: 0)

/** What we show when the preview call itself did not come back. */
private let UNKNOWN_PREVIEW = SweepPreview(
    amountDollars: 0, wouldSweep: false, unknown: true, reason: nil,
    explanation: "We could not check your next save just now. Pull down to try again.", activeGoals: 0
)

@Observable
@MainActor
final class SavingsGoalsStore {
    @ObservationIgnored private let auth: AuthStore
    @ObservationIgnored private let theme: ThemeStore

    private var wireGoals: [SavingsWireGoal] = []
    private var wirePool: SubscriptionPoolWire?
    private var transfers: [SavingsWireTransfer] = []
    private var settings: SavingsWireSettings?
    private(set) var preview: SweepPreview = EMPTY_PREVIEW
    private var checkingCents: Int?
    /** Institution + mask for display, or nil. */
    private(set) var checkingLabel: String?
    private var appearance: [String: Look] = [:]

    /** True once the first load has completed (success or failure). */
    private(set) var hydrated = false
    private(set) var isLoading = false
    /** Set when the last refresh failed — screens must not show stale zeros silently. */
    private(set) var error: String?

    @ObservationIgnored private var refreshSeq = 0
    @ObservationIgnored private var lastRefresh: Double = 0

    init(auth: AuthStore, theme: ThemeStore) {
        self.auth = auth
        self.theme = theme
        appearance = KV.getJSON(APPEARANCE_KEY, as: [String: Look].self) ?? [:]
    }

    /** No session: screens show the signed-out state rather than empty figures. */
    var isSignedOut: Bool { !auth.isAuthenticated }

    /** DOLLARS in the linked checking account; nil until Plaid is linked. */
    var checkingBalance: Double? { checkingCents.map(toDollars) }

    private func saveAppearance(_ goalId: String, icon: String?, color: String?) {
        var look = appearance[goalId] ?? Look()
        if let icon { look.icon = icon }
        if let color { look.color = color }
        appearance[goalId] = look
        KV.setJSON(APPEARANCE_KEY, appearance)
    }

    // --- load ---

    func refresh() async {
        refreshSeq += 1
        let seq = refreshSeq
        if !auth.isAuthenticated {
            wireGoals = []; wirePool = nil; transfers = []; settings = nil; preview = EMPTY_PREVIEW
            checkingCents = nil; checkingLabel = nil; error = nil; hydrated = true
            return
        }

        isLoading = true

        // allSettled, NOT all: a flaky balance call must not blank the goals.
        async let g = settle { try await api.savingsGoals() }
        async let s = settle { try await api.savingsSettings() }
        async let p = settle { try await api.sweepPreview() }
        async let t = settle { try await api.savingsTransfers() }
        async let b = settle { try await api.plaidBalance() }
        async let sp = settle { try await api.subscriptionPool() }
        let (goalsRes, settingsRes, previewRes, transfersRes, balanceRes, poolRes) = await (g, s, p, t, b, sp)

        // A newer refresh (or a logout) owns the state now — drop this snapshot.
        if seq != refreshSeq { return }

        if case let .success(v) = goalsRes { wireGoals = v }
        if case let .success(v) = settingsRes { settings = v }
        if case let .success(v) = transfersRes { transfers = v }
        // Any failure (a 404 before the API ships the route included) is "no pool", never an error.
        if case let .success(v) = poolRes { wirePool = v } else { wirePool = nil }

        // Resolved BEFORE the preview copy: whether a bank exists changes which sentence is true.
        var hasBank = false
        if case let .success(bal) = balanceRes {
            hasBank = !(bal?.accounts ?? []).isEmpty
            checkingCents = bal?.checkingAvailableCents
            let acct = (bal?.accounts ?? []).first { $0.type == "depository" && $0.subtype == "checking" }
            checkingLabel = acct.map { "\($0.institutionName ?? "null") •••• \($0.mask ?? "null")" }
        } else {
            // A 404 here just means "no bank linked yet", which is a normal state.
            checkingCents = nil
            checkingLabel = nil
        }

        if case let .success(pv?) = previewRes {
            let cents = pv.amountCents ?? 0
            let willSweep = pv.wouldSweep && cents > 0
            let text = explainReason(pv.reason, pv.wouldSweep, cents, hasBank)
            preview = SweepPreview(
                amountDollars: toDollars(cents),
                wouldSweep: willSweep,
                unknown: false,
                reason: pv.reason,
                // `|| fallback`: the one path that returns '' must not leak an empty sentence.
                explanation: text.isEmpty ? "We check again each week." : text,
                activeGoals: pv.activeGoals ?? 0
            )
        } else {
            preview = UNKNOWN_PREVIEW
        }

        // Only the goals call failing is worth surfacing — silence would read as "no savings".
        if case .failure = goalsRes { error = "Could not load your savings." } else { error = nil }

        isLoading = false
        hydrated = true
    }

    /// RN AppState 'active' -> refresh, debounced (iOS fires `active` on every incidental foreground).
    func appBecameActive() {
        if nowMs() - lastRefresh > 30_000 {
            lastRefresh = nowMs()
            Task { await refresh() }
        }
    }

    // --- derived ---

    var goals: [SavingsGoal] {
        let accInk = theme.tokens.accInk
        return wireGoals.filter { $0.status != "CLOSED" && $0.kind != "SUBSCRIPTION_POOL" }.map { g in
            let look = appearance[g.id] ?? Look()
            return SavingsGoal(
                id: g.id,
                name: g.name,
                targetAmount: toDollars(g.targetCents),
                currentAmount: toDollars(g.fundedCents),
                withdrawable: toDollars(g.withdrawableCents),
                icon: look.icon ?? FALLBACK_ICONS[hashIndex(g.id, FALLBACK_ICONS.count)],
                color: look.color ?? accInk,
                autoSave: g.status == "ACTIVE",
                status: g.status
            )
        }
    }

    /// What Withdraw and Move pick from: `goals` plus the subscription pool (last, "Subscription
    /// savings", its ledger figures). PATCH-NOTES-subscription-savings.md: "Withdraw / Move
    /// (MoveMoneySheet) treat it like any goal": same server calls. Not for Add: the pool fills from
    /// charges. Last, so the sheet still opens on a standard goal.
    var movableGoals: [SavingsGoal] {
        let standard = goals
        guard let p = wireGoals.first(where: { $0.kind == "SUBSCRIPTION_POOL" && $0.status != "CLOSED" }) else {
            return standard
        }
        return standard + [SavingsGoal(
            id: p.id,
            name: "Subscription savings",
            targetAmount: 0,
            currentAmount: toDollars(p.fundedCents),
            withdrawable: toDollars(p.withdrawableCents),
            icon: "repeat", // the Savings tab's pool row mark
            color: theme.tokens.success,
            autoSave: p.status == "ACTIVE",
            status: p.status
        )]
    }

    var transactions: [SavingsTransaction] {
        transfers.map { t in
            SavingsTransaction(
                id: t.id,
                type: classify(t),
                goalId: t.goalId,
                amountDollars: toDollars(t.amountCents),
                date: parseISODate(t.createdAt) ?? Date(timeIntervalSince1970: 0),
                status: t.status,
                // Money is pending until it settles.
                pending: t.status != "SETTLED"
            )
        }
    }

    var autoSave: AutoSaveSettings {
        let paused: Bool = {
            guard let p = settings?.pausedUntil, let d = parseISODate(p) else { return false }
            return d > Date()
        }()
        return AutoSaveSettings(
            enabled: !paused,
            bufferDollars: toDollars(settings?.minCheckingCents ?? 0),
            weeklyCapDollars: toDollars(settings?.maxWeeklyCents ?? 0)
        )
    }

    /// STANDARD goals live in `goals`; the subscription pool renders separately.
    var pool: SubscriptionPool? {
        guard let w = wirePool, let goal = w.goal else { return nil }
        func totalCents(_ s: SubscriptionPoolWire.Source) -> Int { s.savedCents + s.pendingCents + s.queuedCents }
        return SubscriptionPool(
            goalId: goal.id,
            saved: toDollars((goal.fundedCents ?? 0) + w.sources.reduce(0) { $0 + $1.pendingCents + $1.queuedCents }),
            perCycle: toDollars(w.sources.filter { $0.status == "ACTIVE" }.reduce(0) { $0 + $1.perChargeCents }),
            sources: w.sources.map { s in
                PoolSource(
                    subscriptionId: s.subscriptionId,
                    merchantName: s.merchantName,
                    mode: s.mode,
                    status: s.status,
                    perCharge: toDollars(s.perChargeCents),
                    saved: toDollars(s.savedCents),
                    pending: toDollars(s.pendingCents),
                    queued: toDollars(s.queuedCents),
                    total: toDollars(totalCents(s)),
                    logo: s.logo,
                    renewalDate: s.renewalDate,
                    charges: s.charges,
                    startedAt: s.startedAt,
                    endedAt: s.endedAt
                )
            },
            recent: w.recent.map { r in
                PoolRecent(
                    id: r.id, subscriptionId: r.subscriptionId, merchantName: r.merchantName,
                    amount: toDollars(r.amountCents), state: r.state, date: parseISODate(r.createdAt)
                )
            }
        )
    }

    /// The pool counts through `pool.saved` (its ledger balance plus what is still on its way), so its
    /// own row is left out of `listed`: nothing counts twice.
    var totalSaved: Double {
        let listed = wireGoals.filter { $0.kind != "SUBSCRIPTION_POOL" }.reduce(0) { $0 + $1.fundedCents }
        return toDollars(listed) + (pool?.saved ?? 0)
    }

    var savedThisMonth: Double {
        let now = jsParts(Date())
        return toDollars(transfers.filter { t in
            guard t.direction == "DEBIT", let d = parseISODate(t.createdAt) else { return false }
            let p = jsParts(d)
            return p.month == now.month && p.year == now.year
        }.reduce(0) { $0 + $1.amountCents })
    }

    var averageSave: Double {
        let ins = transfers.filter { $0.direction == "DEBIT" }
        if ins.isEmpty { return 0 }
        return toDollars(Int(jsRound(Double(ins.reduce(0) { $0 + $1.amountCents }) / Double(ins.count))))
    }

    func transactionsForGoal(_ goalId: String) -> [SavingsTransaction] {
        transactions.filter { $0.goalId == goalId }
    }

    // --- mutations: every one re-reads from the server (balances are ledger-derived) ---

    /** Turn an API error into copy, without leaking a stack trace to the user. */
    private func fail(_ err: Error, _ fallback: String) -> MoveResult {
        let msg = err.message
        if msg.contains("INSUFFICIENT_WITHDRAWABLE") {
            return .failure("Some of that money is still clearing. Try again once it has settled.")
        }
        if msg.contains("SAME_GOAL") { return .failure("Pick a different goal.") }
        if msg.contains("GOAL_CLOSED") || msg.contains("DESTINATION_CLOSED") {
            return .failure("That goal is closed.")
        }
        return .failure(msg.isEmpty ? fallback : msg)
    }

    func addGoal(_ input: NewGoalInput) async -> MoveResult {
        do {
            var body: [String: JSON] = ["name": .string(input.name), "targetCents": .int(toCents(input.targetAmount))]
            if let m = input.monthlyAmount, m != 0 {
                body["mode"] = "FIXED"
                body["cadence"] = "MONTHLY"
                body["fixedAmountCents"] = .int(toCents(m))
            }
            let id = try await api.createSavingsGoal(.object(body))
            if let id, input.icon != nil || input.color != nil {
                saveAppearance(id, icon: input.icon, color: input.color)
            }
            // A new goal defaults to ACTIVE server-side; only switching auto-save OFF needs a call.
            if let id, input.autoSave == false {
                try await api.updateSavingsGoal(id: id, ["status": "PAUSED"])
            }
            await refresh()
            return .success(id)
        } catch {
            return fail(error, "Could not create that goal.")
        }
    }

    func updateGoal(_ id: String, name: String? = nil, targetAmount: Double? = nil, icon: String? = nil, color: String? = nil) async -> MoveResult {
        do {
            var body: [String: JSON] = [:]
            if let name { body["name"] = .string(name) }
            if let targetAmount { body["targetCents"] = .int(toCents(targetAmount)) }
            if !body.isEmpty { try await api.updateSavingsGoal(id: id, .object(body)) }
            if icon != nil || color != nil { saveAppearance(id, icon: icon, color: color) }
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not save those changes.")
        }
    }

    func closeGoal(_ id: String) async -> MoveResult {
        do {
            try await api.updateSavingsGoal(id: id, ["status": "CLOSED"])
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not close that goal.")
        }
    }

    func setGoalAutoSave(_ id: String, _ on: Bool) async -> MoveResult {
        do {
            try await api.updateSavingsGoal(id: id, ["status": .string(on ? "ACTIVE" : "PAUSED")])
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not change that setting.")
        }
    }

    func depositToGoal(_ id: String, _ amountDollars: Double) async -> MoveResult {
        if !(amountDollars > 0) { return .failure("Enter an amount above $0.00.") }
        do {
            _ = try await api.depositToGoal(id: id, amountCents: toCents(amountDollars))
            await refresh()
            return .success()
        } catch {
            return fail(error, "That transfer did not go through.")
        }
    }

    func withdrawFromGoal(_ id: String, _ amountDollars: Double) async -> MoveResult {
        if !(amountDollars > 0) { return .failure("Enter an amount above $0.00.") }
        do {
            _ = try await api.withdrawFromGoal(id: id, amountCents: toCents(amountDollars), speed: "STANDARD")
            await refresh()
            return .success()
        } catch {
            return fail(error, "That withdrawal did not go through.")
        }
    }

    func moveBetweenGoals(_ fromId: String, _ toId: String, _ amountDollars: Double) async -> MoveResult {
        if !(amountDollars > 0) { return .failure("Enter an amount above $0.00.") }
        do {
            _ = try await api.moveBetweenGoals(fromGoalId: fromId, toGoalId: toId, amountCents: toCents(amountDollars))
            await refresh()
            return .success()
        } catch {
            return fail(error, "That move did not go through.")
        }
    }

    func setBuffer(_ dollars: Double) async -> MoveResult {
        do {
            // The server rejects anything under $10 — overdraft protection, not a preference.
            let cents = max(1000, toCents(dollars))
            _ = try await api.updateSavingsSettings(["minCheckingCents": .int(cents)])
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not update your buffer.")
        }
    }

    func setAutoSaveEnabled(_ on: Bool) async -> MoveResult {
        do {
            // "Paused" server-side is a date, not a flag. A far-future date pauses it; null resumes it.
            let pausedUntil: JSON = on ? .null : .string(toISOString(Date(timeIntervalSinceNow: 365 * 24 * 3600)))
            _ = try await api.updateSavingsSettings(["pausedUntil": pausedUntil])
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not change that setting.")
        }
    }

    // --- subscription savings (one goal, many sources) ---

    /// Add (or switch / resume) a subscription as a source of Subscription savings.
    /// mode: 'HALF' | 'MATCH'.
    func setSubscriptionSaving(_ subscriptionId: String, _ mode: String) async -> MoveResult {
        do {
            try await api.setSubscriptionPoolSource(subscriptionId: subscriptionId, mode: mode)
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not turn on saving for that subscription.")
        }
    }

    func pauseSubscriptionSaving(_ subscriptionId: String) async -> MoveResult {
        await setSourceStatus(subscriptionId, "PAUSED")
    }

    func resumeSubscriptionSaving(_ subscriptionId: String) async -> MoveResult {
        await setSourceStatus(subscriptionId, "ACTIVE")
    }

    private func setSourceStatus(_ subscriptionId: String, _ status: String) async -> MoveResult {
        do {
            try await api.setSubscriptionPoolSourceStatus(subscriptionId: subscriptionId, status: status)
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not change that setting.")
        }
    }

    /// Ends the source. The money it already moved stays in the goal.
    func stopSubscriptionSaving(_ subscriptionId: String) async -> MoveResult {
        do {
            try await api.endSubscriptionPoolSource(subscriptionId: subscriptionId)
            await refresh()
            return .success()
        } catch {
            return fail(error, "Could not stop saving from that subscription.")
        }
    }
}

// Port of apps/mobile/contexts/DataContext.tsx
//
// Dashboard data. refresh() fetches /home/summary, /risks?days=30, /wallet/instruments and
// /subscriptions with allSettled semantics: each slice on its own merit, a failed call keeps its
// last real answer; all 4 failed with 401/403 -> wipe (the figures must not outlive the session);
// an outage keeps the last figures. Merchant names prettified ONCE here. The last complete answer
// is saved as a snapshot (`@ezer_data_snapshot`, stamped with the user id) and painted at cold
// start. An hourly background POST /plaid/sync (throttled via `@ezer_last_bg_sync`) waits for the
// passcode (LockWarm). NO demo fallback, ever (CLAUDE.md: demoData.ts is deleted).
//
//   @Environment(DataStore.self) private var data
//   data.subscriptions / data.risks / data.instruments / data.homeSummary
//   data.isLoading / data.error / data.isEmpty / data.isReady
//   await data.refresh()
//   let r = await data.getMerchants(id, "custom", (startDate: s, endDate: e))  // r.merchants / r.predicted / r.ok

import Foundation
import Observation

@Observable
@MainActor
final class DataStore {
    private(set) var homeSummary: HomeSummary?
    private(set) var risks: [RiskItem] = []
    private(set) var instruments: [FundingInstrument] = []
    private(set) var subscriptions: [Subscription] = []
    private(set) var isLoading = false
    private(set) var error: String?
    /// True when the user has no connected accounts yet ("connect a bank" state).
    private(set) var isEmpty = false
    /// Something real to show: the snapshot is painted, or a refresh has settled. LockGate holds
    /// its EZER fade until then.
    private(set) var isReady = false

    @ObservationIgnored private let auth: AuthStore
    @ObservationIgnored private var refreshSeq = 0
    @ObservationIgnored private var snap: Snapshot?

    private static let LAST_BG_SYNC_KEY = "@ezer_last_bg_sync"
    // An hour is enough to pick up same-day activity without calling Plaid on every relaunch.
    private static let BG_SYNC_THROTTLE_MS: Double = 60 * 60 * 1000
    private static let SNAPSHOT_KEY = "@ezer_data_snapshot"

    /// The RN snapshot shape: {homeSummary, risks, instruments, subscriptions, userId}.
    private struct Snapshot: Codable {
        var homeSummary: HomeSummary?
        var risks: [RiskItem]
        var instruments: [FundingInstrument]
        var subscriptions: [Subscription]
        var userId: String

        init(homeSummary: HomeSummary?, risks: [RiskItem], instruments: [FundingInstrument], subscriptions: [Subscription], userId: String) {
            self.homeSummary = homeSummary; self.risks = risks; self.instruments = instruments
            self.subscriptions = subscriptions; self.userId = userId
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: AnyKey.self)
            homeSummary = c.obj("homeSummary"); risks = c.list("risks"); instruments = c.list("instruments")
            subscriptions = c.list("subscriptions"); userId = c.str("userId")
        }
    }

    private struct SliceData {
        var homeSummary: HomeSummary?
        var risks: [RiskItem]
        var instruments: [FundingInstrument]
        var subscriptions: [Subscription]
    }

    init(auth: AuthStore) {
        self.auth = auth
        // Read at init, in parallel with auth restoring the session, so it is in memory when the
        // user id arrives and the dashboard's first render has figures.
        if let raw = FileStore.get(Self.SNAPSHOT_KEY), let data = raw.data(using: .utf8) {
            snap = try? JSONDecoder().decode(Snapshot.self, from: data)
        }
    }

    private static func hasData(_ instruments: [FundingInstrument], _ subscriptions: [Subscription]) -> Bool {
        !instruments.isEmpty || !subscriptions.isEmpty
    }

    private func setEmptyState(error: String? = nil, isEmpty: Bool, isReady: Bool) {
        homeSummary = nil; risks = []; instruments = []; subscriptions = []
        isLoading = false; self.error = error; self.isEmpty = isEmpty; self.isReady = isReady
    }

    func refresh() async {
        refreshSeq += 1
        let seq = refreshSeq
        // No session means nothing to fetch; `isEmpty` drives the "connect an account" state.
        if !auth.isAuthenticated {
            setEmptyState(isEmpty: true, isReady: true)
            return
        }
        let userId = auth.user?.id

        isLoading = true
        error = nil
        // What is on screen now (possibly the hydrated snapshot): a failed call keeps it.
        let last = SliceData(homeSummary: homeSummary, risks: risks, instruments: instruments, subscriptions: subscriptions)

        // allSettled, NOT all: a single flaky endpoint must not wipe the whole dashboard.
        async let s = settle { try await api.homeSummary() }
        async let r = settle { try await api.risks(days: 30) }
        async let i = settle { try await api.walletInstruments() }
        async let u = settle { try await api.subscriptions() }
        let (summaryRes, risksRes, instrumentsRes, subsRes) = await (s, r, i, u)

        // A newer refresh (or a logout) owns the state now — drop this snapshot.
        if seq != refreshSeq { return }

        var failures: [Error] = []
        for case let .failure(e) in [summaryRes.map { _ in () }, risksRes.map { _ in () }, instrumentsRes.map { _ in () }, subsRes.map { _ in () }] {
            failures.append(e)
        }

        if failures.count == 4 {
            // Everything failed: almost always an unreachable API or a dead session.
            let message = failures.first?.message ?? "Could not reach EZER"
            print("[DataContext] refresh failed:", message)
            // The server refused the session: the figures must not outlive it, on screen or on disk.
            if failures.allSatisfy({ $0.httpStatus == 401 || $0.httpStatus == 403 }) {
                snap = nil
                FileStore.remove(Self.SNAPSHOT_KEY)
                setEmptyState(error: message, isEmpty: true, isReady: true)
                return
            }
            // An outage: keep the last real figures — offline with a snapshot must not read as
            // "connect an account".
            isLoading = false
            error = message
            isEmpty = !Self.hasData(last.instruments, last.subscriptions)
            isReady = true
            return
        }

        if !failures.isEmpty {
            print("[DataContext] partial refresh;", failures.count, "of 4 calls failed:", failures.map { $0.message }.joined(separator: ", "))
        }

        // Names shown to the user are prettified ONCE here.
        func pretty<T>(_ xs: [T], _ kp: WritableKeyPath<T, String>) -> [T] {
            xs.map { var x = $0; x[keyPath: kp] = prettyMerchantName(x[keyPath: kp]); return x }
        }
        // valueOf(r, empty, kept): fulfilled -> data ?? empty; rejected -> kept.
        let summary: HomeSummary?
        switch summaryRes {
        case let .success(v): summary = v
        case .failure: summary = last.homeSummary
        }
        let data = SliceData(
            homeSummary: summary,
            risks: (try? risksRes.get()).map { pretty($0, \.merchantName) } ?? last.risks,
            instruments: (try? instrumentsRes.get()) ?? last.instruments,
            subscriptions: (try? subsRes.get()).map { pretty($0, \.merchantName) } ?? last.subscriptions
        )
        rememberMerchantWebsites(data.subscriptions)

        homeSummary = data.homeSummary
        risks = data.risks
        instruments = data.instruments
        subscriptions = data.subscriptions
        isLoading = false
        // A kept slice is stale: say so rather than pass the mix off as current.
        error = failures.isEmpty ? nil : (failures.first?.message ?? "Some data could not be refreshed")
        isEmpty = !Self.hasData(data.instruments, data.subscriptions)
        isReady = true

        // Only a complete server answer is saved as the snapshot.
        if let userId, failures.isEmpty {
            let snapshot = Snapshot(homeSummary: data.homeSummary, risks: data.risks, instruments: data.instruments, subscriptions: data.subscriptions, userId: userId)
            snap = snapshot
            if let enc = try? JSONEncoder().encode(snapshot), let str = String(data: enc, encoding: .utf8) {
                FileStore.set(Self.SNAPSHOT_KEY, str)
            }
        }
    }

    func getInstrumentSummary(_ id: String, range: String = "last30") async -> InstrumentSummary? {
        // No demo substitute: an unreachable summary shows nothing.
        try? await api.instrumentSummary(id: id, range: range)
    }

    /// `ok: false` flags a swallowed failure so it is never cached as a genuine "$0".
    func getMerchants(_ id: String, _ range: String = "last30", _ customDates: (startDate: String, endDate: String)? = nil) async -> (merchants: [MerchantCharge], predicted: [PredictedCharge], ok: Bool) {
        do {
            let res = try await api.instrumentMerchants(
                id: id,
                range: range,
                startDate: range == "custom" ? customDates?.startDate : nil,
                endDate: range == "custom" ? customDates?.endDate : nil
            )
            return (res.data, res.predictedItems, true)
        } catch {
            return ([], [], false)
        }
    }

    // MARK: - The load effect (RN useEffect on [isAuthenticated, authLoading, userId])

    /// Paint the last good dashboard before the network answers.
    private func hydrate() {
        guard let userId = auth.user?.id, let s = snap, s.userId == userId, !Self.hasData(instruments, subscriptions) else { return }
        let today = Calendar.current.startOfDay(for: Date())
        // daysUntilDue was computed by the server on the day of the snapshot: recount it, and drop
        // what has already passed.
        let freshRisks: [RiskItem] = s.risks.compactMap { r in
            guard let due = parseLocalDay(r.dueDate) else { return nil }
            var x = r
            x.daysUntilDue = Int(jsRound(due.timeIntervalSince(today) / 86400))
            return x.daysUntilDue >= 0 ? x : nil
        }
        rememberMerchantWebsites(s.subscriptions)
        homeSummary = s.homeSummary
        risks = freshRisks
        instruments = s.instruments
        subscriptions = s.subscriptions
        isLoading = true
        error = nil
        isEmpty = !Self.hasData(s.instruments, s.subscriptions)
        isReady = true
    }

    /// Run from the root with `.task(id: AuthKey)`: task cancellation is RN's `cancelled` flag.
    func authChanged() async {
        // Auth is still restoring the session: not signed out (keep the snapshot), not signed in.
        if auth.isLoading { return }

        if !auth.isAuthenticated {
            // Signed out, or the stored session was rejected.
            snap = nil
            FileStore.remove(Self.SNAPSHOT_KEY)
        } else {
            hydrate()
        }

        await refresh()
        if Task.isCancelled || !auth.isAuthenticated { return }

        let last = KV.get(Self.LAST_BG_SYNC_KEY).flatMap(Double.init)
        let due = last == nil || nowMs() - last! > Self.BG_SYNC_THROTTLE_MS
        if !due { return }
        KV.set(Self.LAST_BG_SYNC_KEY, String(Int(nowMs())))
        // Not while the keypad is up: the sync's reply re-renders every mounted screen.
        await LockWarm.shared.wait()
        if Task.isCancelled { return }
        do {
            // 404s harmlessly when nothing is linked yet.
            try await api.post("/plaid/sync", timeout: PLAID_TIMEOUT)
            if !Task.isCancelled { await refresh() }
        } catch {
            // Next app open past the throttle window retries.
        }
    }
}

// Port of apps/mobile/utils/PremiumContext.native.tsx
//
// Freemium state: 'loading' | 'trial' | 'expired' | 'premium'. A local 7-day trial from
// `@ezer_trial_start_date`; `GET /account/dev-status` is checked before the trial timer (a server
// dev-unlock persists across restarts); `redeemDevCode` -> `POST /account/dev-unlock`.
//
// TODO(native SDK): RevenueCat is not linked (see RevenueCatConfig). purchasePremium /
// restorePurchases return false, exactly as the RN context does when the SDK is unavailable.
// The RN context re-ran the trial/dev check on every sign-in only through RevenueCat's logIn;
// without the SDK that re-check is done directly on user change (userChanged), so a dev unlock is
// honoured after sign-in rather than only after the next cold start.
//
//   @Environment(PremiumStore.self) private var premium
//   premium.status == .expired ; premium.daysRemaining ; await premium.redeemDevCode(code)

import Foundation
import Observation

@Observable
@MainActor
final class PremiumStore {
    private(set) var status: PremiumStatus = .loading
    private(set) var trialEndDate: Date?
    private(set) var daysRemaining = 0
    private(set) var isLoading = true
    /** True when RevenueCat's native SDK is configured. Never, in this build. */
    let isPurchaseNativeAvailable = false

    init() {
        print("[Premium] RevenueCat unavailable — using local trial")
        Task { await loadTrialState() }
    }

    /// Called from the root when the signed-in user id changes.
    func userChanged() async { await loadTrialState() }

    private func loadTrialState() async {
        defer { isLoading = false }
        // A dev-unlock persists server-side, so it is checked before the local trial timer. This
        // 401s harmlessly without a session — "not applicable yet", not an error.
        if let dev = try? await api.devStatus(), dev.devUnlocked {
            status = .premium
            return
        }

        let key = RevenueCatConfig.ASYNC_STORAGE_KEYS.TRIAL_START_DATE
        let days = RevenueCatConfig.TRIAL_DURATION_DAYS
        if let trialStart = KV.get(key), let startDate = parseISODate(trialStart) {
            let endDate = Calendar.current.date(byAdding: .day, value: days, to: startDate) ?? startDate
            let msRemaining = endDate.timeIntervalSinceNow * 1000
            let remaining = Int(ceil(msRemaining / (1000 * 60 * 60 * 24)))
            trialEndDate = endDate
            daysRemaining = max(0, remaining)
            status = remaining > 0 ? .trial : .expired
        } else {
            let now = Date()
            KV.set(key, toISOString(now))
            trialEndDate = Calendar.current.date(byAdding: .day, value: days, to: now)
            daysRemaining = days
            status = .trial
        }
    }

    func isPremium() -> Bool { status == .premium }
    func isTrialActive() -> Bool { status == .trial }
    func canAccessFeature() -> Bool { status == .trial || status == .premium }

    /// TODO(native SDK): RevenueCat. Without it RN returned false here too.
    func purchasePremium() async -> Bool { false }

    /// TODO(native SDK): RevenueCat. Without it RN returned false here too.
    func restorePurchases() async -> Bool { false }

    /** Server-checked private bypass. nil on success (status is already premium), else the error. */
    func redeemDevCode(_ code: String) async -> String? {
        do {
            _ = try await api.devUnlock(code: code)
            status = .premium
            return nil
        } catch {
            return error.message.isEmpty ? "Could not verify that code. Try again." : error.message
        }
    }

    /** DEV only: cycle through states for testing. */
    func devCycleStatus() {
        guard __DEV__ else { return }
        let states: [PremiumStatus] = [.trial, .expired, .premium]
        let idx = states.firstIndex(of: status) ?? -1
        let next = states[(idx + 1) % states.count]
        print("[Premium DEV] Cycling status: \(status.rawValue) → \(next.rawValue)")
        status = next
        if next == .trial { daysRemaining = RevenueCatConfig.TRIAL_DURATION_DAYS }
    }
}

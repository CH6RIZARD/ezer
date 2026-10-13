// Port of apps/mobile/utils/usePremiumGate.ts
//
// One modifier instead of the same effect copied into every gated tab: when the trial has EXPIRED
// (not 'loading' — that would bounce everyone to the paywall for a frame on every cold start) and
// the lock is open, present the Paywall (RN: router.replace('/screens/Paywall')). Module-level
// debounce: every mounted tab fires within the same tick, and only the first may navigate.
//
//   HomeView body ... .premiumGate()      // Home, Wallet, Alerts

import SwiftUI

@MainActor private var lastRedirectAt: Double = 0

private struct PremiumGateModifier: ViewModifier {
    @Environment(PremiumStore.self) private var premium
    @Environment(Router.self) private var router
    // Held while the passcode lock is up: on iOS a Paywall presented then would land ABOVE the lock.
    @Environment(\.lockOpen) private var unlocked

    func body(content: Content) -> some View {
        content
            .onChange(of: GateKey(status: premium.status, unlocked: unlocked), initial: true) { _, key in
                guard key.status == .expired, key.unlocked, !isLoosePreviewMode() else { return }
                let now = nowMs()
                if now - lastRedirectAt < 1000 { return }
                lastRedirectAt = now
                router.replace("/screens/Paywall")
            }
    }

    private struct GateKey: Equatable {
        let status: PremiumStatus
        let unlocked: Bool
    }
}

extension View {
    /// RN `usePremiumGate()`.
    func premiumGate() -> some View { modifier(PremiumGateModifier()) }
}

// Port of apps/mobile/app/index.tsx (Onboarding owns this file; ported by Foundation because the
// shell cannot start without it — 38 lines, nothing to add).
//
// Pure auth gate: never renders its own sign-in UI, only redirects. Signed in with onboarding done
// -> the dashboard; otherwise -> onboarding, which owns the whole first run. There is no state this
// screen is meant to be seen in: plain background only (LockGate draws the wordmark).

import SwiftUI

struct IndexGate: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router

    private struct Key: Equatable {
        let isLoading: Bool
        let isAuthenticated: Bool
        let hasCompletedOnboarding: Bool
    }

    var body: some View {
        theme.colors.background
            .ignoresSafeArea()
            .onChange(of: Key(isLoading: auth.isLoading, isAuthenticated: auth.isAuthenticated, hasCompletedOnboarding: auth.hasCompletedOnboarding), initial: true) { _, k in
                if k.isLoading { return }
                if k.isAuthenticated && k.hasCompletedOnboarding {
                    router.replace("/(tabs)/home")
                    return
                }
                router.replace("/onboarding")
            }
    }
}

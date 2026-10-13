// Port of apps/mobile/utils/useCardFlowStatus.ts
//
// =============================================================================
// EZER — Card Studio flow status
//
// Answers exactly one question for the Home entry tile: has this user already
// saved a design AND been through approval to a terminal state? If so, "Get
// your physical card" should open the finished-design review
// (PhysicalCardReview), not dump them back into the blank/edit designer
// they already finished with.
//
// Refreshes on focus, not just on mount — Home stays mounted underneath the
// designer/approval stack, so returning to it after finishing the flow must
// pick up the new state without a full app restart.
// =============================================================================
//
// RN hook -> an @Observable model owned by HomeView (`@State private var cardFlow =
// HomeCardFlowStatus()`). The hook's two triggers are kept:
//   useEffect(refresh, [refresh])  -> mounted() / unmounted()      (onAppear / onDisappear)
//   useFocusEffect(refresh)        -> focusChanged(_:)             (\.isScreenFocused)
// Each run gets an `alive` token that its cleanup clears, exactly like the hook's closure.

import Foundation
import Observation

@Observable
@MainActor
final class HomeCardFlowStatus {
    private(set) var hasCompletedFlow = false
    // Home's Spending Power tile needs the actual outcome, not just whether
    // the flow finished — "assessed, no limit yet" and "never assessed at
    // all" were rendering identically (both a bare "—"), which read as the
    // tile being permanently broken to anyone who had actually gone through
    // approval and landed on manual_review.
    private(set) var access: CardAccessOutcome?

    @ObservationIgnored private var alive: Set<Int> = []
    @ObservationIgnored private var nextRun = 0
    @ObservationIgnored private var mountRun: Int?
    @ObservationIgnored private var focusRun: Int?

    /// useEffect(refresh, [refresh]) — runs on mount, cleaned up on unmount.
    func mounted() {
        cancel(mountRun)
        mountRun = refresh()
    }

    func unmounted() {
        cancel(mountRun)
        mountRun = nil
        cancel(focusRun)
        focusRun = nil
    }

    /// useFocusEffect(refresh) — runs on every focus, cleaned up on blur.
    func focusChanged(_ focused: Bool) {
        cancel(focusRun)
        focusRun = focused ? refresh() : nil
    }

    private func cancel(_ run: Int?) {
        if let run { alive.remove(run) }
    }

    /// The hook's `refresh`: starts one run and returns its token (the cleanup sets alive = false).
    private func refresh() -> Int {
        nextRun += 1
        let run = nextRun
        alive.insert(run)
        Task { @MainActor in
            let design = CardDesignStore.loadCardDesign()
            let localOutcome = CardDesignStore.getCardAccessOutcome()
            guard self.alive.contains(run) else { return }

            // Local storage is the fast path, but it is only a mirror of a decision
            // the server already made — a reinstall, a cleared app, or a second
            // device wipes it while the real outcome still sits in Postgres. Before
            // this fallback, that meant Home's Spending Power tile went right back
            // to "not yet assessed" for someone who had already connected a bank
            // and gotten a real answer: the assessment theatre would run again,
            // finish, and the tile still wouldn't show anything. Only worth the
            // network call when local storage came back genuinely empty.
            var outcome = localOutcome
            if outcome == nil {
                outcome = await CardDesignStore.fetchServerAccessOutcome()
                guard self.alive.contains(run) else { return }
                if let outcome { CardDesignStore.mirrorServerAccessOutcome(outcome) }
            }

            let completed = design != nil && outcome != nil
            if self.hasCompletedFlow != completed { self.hasCompletedFlow = completed }
            // Same outcome → same state. This runs on EVERY focus of Home,
            // and a fresh value each time re-rendered the whole Home tree
            // (calendar included) on every tab switch back to it.
            // Changing nothing must render nothing.
            if self.access != outcome { self.access = outcome }
        }
        return run
    }
}

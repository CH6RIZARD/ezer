// Port of apps/mobile/components/LockGate.tsx
//
// Passcode lock drawn above the whole app, in its own window (OverlayWindows: RN used
// FullWindowOverlay, a subview of the key window above presented sheets), so locking never touches
// navigation: whatever screen was open is still there, with its state, when the layer lifts.
//
//   cold start, passcode set     EZER fades in once (dove flight) → keypad → (EZER breathing while
//                                auth/data are still loading) → app
//   leaving the app              covered at once (app switcher, first frames back), then on return:
//                                the app again if away under 60s, else the keypad
//   signed in, no passcode       required "Set a passcode"
//   signed out                   nothing; any stored passcode is deleted
//
// The 60s grace only applies while the process lives: a cold start always asks. Two clocks, BOTH
// must say "under the grace" (monotonic can't be moved by the device clock; wall counts sleep and a
// negative reading means the clock was set back).
//
// The sheet's opacity (`layer`) is put back to 1 inside move() whenever a covering phase is chosen,
// never after an 'open' (CLAUDE.md "Lock screen").
//
// Feature code reads the two contexts:
//   @Environment(\.lockOpen)  — LockOpenContext: false while the lock is up
//   @Environment(\.lockWarm)  — LockWarmContext: true once the code is accepted (or none)

import SwiftUI
import UIKit

enum LockPhase: Equatable, Sendable {
    case cover   // nothing decided yet, or the app is away: an opaque EZER screen
    case intro   // the one EZER fade-in before the keypad
    case locked
    case loading // unlocked, but auth or data still on their way
    case setup
    case open
}

private let SMALL_MARK: CGFloat = 96 // header wordmark width
private let FADE_MS: Double = 900 // the breathing half-cycle
/** Bank linking and the photo picker leave the app on Android; give them longer. */
private let IN_APP_FLOW_GRACE_MS: Double = 10 * 60_000

@Observable
@MainActor
final class LockGateModel {
    /// undefined -> .unknown (not read yet), null -> .none.
    enum InfoState: Equatable { case unknown, none, some(PasscodeInfo) }

    private(set) var phase: LockPhase = .cover
    private(set) var info: InfoState = .unknown
    /// The sheet's opacity.
    private(set) var layer: Double = 1
    /// The wordmark's opacity.
    private(set) var mark: Double = 0.3
    /// The keypad's opacity.
    private(set) var pad: Double = 0
    private(set) var message: String?
    private(set) var lockedUntil: Double = 0
    private(set) var now: Double = nowMs()
    /// Re-keys the sheet each time the app comes back (RN remounted its overlay).
    private(set) var overlayKey = 0
    /// The intro waits for its two images, the word and the flight's sprite sheet, decoded: on a cold
    /// start (above all the first after an install) decoding them took longer than the fade, so the
    /// fade ran on an empty screen and the dove first appeared already landing. Held at most 1.5s, so
    /// a failed load never keeps the keypad back.
    private(set) var introReady = false
    private var cycleDone = false

    var locked: Bool { phase != .open }
    var warm: Bool { phase == .open || phase == .loading }
    var showMark: Bool { phase == .cover || phase == .intro || phase == .loading }
    var waitSecs: Int { max(0, Int(ceil((lockedUntil - now) / 1000))) }
    var passcodeLength: Int { if case let .some(i) = info { return i.len }; return 4 }

    @ObservationIgnored private let auth: AuthStore
    @ObservationIgnored private let data: DataStore
    @ObservationIgnored private let router: Router
    @ObservationIgnored private var started = false
    @ObservationIgnored private var leftAt: (mono: Double, wall: Double)?
    // Taken when the app LEAVES: Plaid's onSuccess can land before the app is active again.
    @ObservationIgnored private var leftInFlow = false
    @ObservationIgnored private var resumeTo: LockPhase = .open
    @ObservationIgnored private var markTask: Task<Void, Never>?
    @ObservationIgnored private var cycleTask: Task<Void, Never>?
    @ObservationIgnored private var tickTask: Task<Void, Never>?
    @ObservationIgnored private var markGen = 0
    @ObservationIgnored private var lifting = false
    @ObservationIgnored private var unsubscribe: (() -> Void)?
    /// iOS posts didBecomeActive at launch too; RN's AppState only reported 'active' after a leave.
    @ObservationIgnored private var hasLeft = false

    init(auth: AuthStore, data: DataStore, router: Router) {
        self.auth = auth
        self.data = data
        self.router = router
        OverlayWindows.shared.setLockVisible(true)
    }

    // MARK: phase plumbing

    /// RN setPhase: a no-op when unchanged; otherwise the phase-keyed effects run.
    private func setPhase(_ next: LockPhase) {
        guard next != phase else { return }
        phase = next
        phaseEffects()
    }

    /// Writes the phase WITH its side effects; the layer is back to 1 for every covering phase.
    private func move(_ next: LockPhase) {
        if next == .open || next == .loading { markLockWarm() }
        if next != .open { withoutAnimation { layer = 1 } }
        setPhase(next)
    }

    private func phaseEffects() {
        OverlayWindows.shared.setLockVisible(phase != .open)
        lifting = false

        // A keyboard left open in a sheet sits in its own window ABOVE the lock. Blur it.
        if phase != .open { dismissKeyboard() }

        // Unlocked: one full EZER breath (up and back down), then in.
        cycleTask?.cancel()
        if phase == .loading {
            cycleDone = false
            cycleTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: UInt64(FADE_MS * 2 * 1_000_000))
                guard let self, !Task.isCancelled else { return }
                self.cycleDone = true
                self.evaluate()
            }
        }

        runMarkAnimation()

        if phase == .locked || phase == .setup {
            withoutAnimation { pad = 0 }
            onNextRunLoop {
                withAnimation(.rn(.rnDefault, 260)) { self.pad = 1 }
            }
        }

        // A stored lockout (from before a restart): refresh the clock with it.
        if phase == .locked, case let .some(i) = info, i.lockedUntil != 0 {
            now = nowMs()
            setLockedUntil(i.lockedUntil)
        }

        evaluate()
    }

    private func runMarkAnimation() {
        markTask?.cancel()
        markGen += 1
        let gen = markGen
        switch phase {
        case .intro:
            // Nothing to see until the images are decoded (setIntroReady re-runs this).
            guard introReady else {
                withoutAnimation { mark = 0 }
                return
            }
            withoutAnimation { mark = 0.3 }
            onNextRunLoop {
                guard gen == self.markGen else { return }
                withAnimation(.rn(.rnDefault, FADE_MS), completionCriteria: .logicallyComplete) {
                    self.mark = 1
                } completion: {
                    if gen == self.markGen && self.phase == .intro { self.setPhase(.locked) }
                }
            }
        case .cover, .loading:
            // Loading starts dim so its one cycle is a full rise and fall.
            if phase == .loading { withoutAnimation { mark = 0.3 } }
            markTask = Task { [weak self] in
                await Task.yield()
                while !Task.isCancelled {
                    guard let self else { return }
                    withAnimation(.rn(.rnDefault, FADE_MS)) { self.mark = 1 }
                    try? await Task.sleep(nanoseconds: UInt64(FADE_MS * 1_000_000))
                    if Task.isCancelled { return }
                    withAnimation(.rn(.rnDefault, FADE_MS)) { self.mark = 0.3 }
                    try? await Task.sleep(nanoseconds: UInt64(FADE_MS * 1_000_000))
                }
            }
        default:
            break
        }
    }

    private func setLockedUntil(_ v: Double) {
        lockedUntil = v
        tickTask?.cancel()
        // Tick the "try again in" countdown while a lockout runs.
        guard v > nowMs() else { return }
        tickTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self, !Task.isCancelled else { return }
                self.now = nowMs()
                if nowMs() >= self.lockedUntil { return }
            }
        }
    }

    // MARK: cold start + app state

    /// Called once from the root when the app starts.
    func start() {
        guard !started else { return }
        started = true

        // Unreadable or corrupt: fail closed. Only "Forgot passcode" (sign out) gets past it.
        let stored: PasscodeInfo?
        do { stored = try getPasscodeInfo() } catch { stored = PasscodeInfo(len: 4, lockedUntil: 0) }
        info = stored.map { .some($0) } ?? .none
        if stored == nil { markLockWarm() } else { waitForIntroImages() }
        setPhase(stored != nil ? .intro : .open)

        unsubscribe = onPasscodeChange { [weak self] next in
            guard let self else { return }
            self.info = next.map { .some($0) } ?? .none
            if next == nil { self.setPhase(.open) }
            self.evaluate()
        }

        let nc = NotificationCenter.default
        nc.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.appLeft() }
        }
        nc.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.appLeft() }
        }
        nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.appBecameActive() }
        }
    }

    /// RN's wordLoaded/doveLoaded (Image onLoad) plus the 1.5s cap.
    private func waitForIntroImages() {
        // DoveFlight's reduced-motion path draws the perched dove instead of the sheet.
        let dove: DoveImages.Name = UIAccessibility.isReduceMotionEnabled ? .perch : .sheet
        Task { [weak self] in
            let images = DoveImages.shared
            let word = await images.load(.wordmark)
            if await images.load(dove) && word { self?.setIntroReady() }
        }
        Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            self?.setIntroReady()
        }
    }

    private func setIntroReady() {
        guard !introReady else { return }
        introReady = true
        if phase == .intro { runMarkAnimation() }
    }

    private func markLeft() {
        if leftAt == nil {
            leftAt = (monotonicMs(), nowMs())
            leftInFlow = inAppFlowActive()
        }
    }

    /// 'inactive' (app switcher, before its snapshot) or 'background': cover NOW. Only an unlocked
    /// app earns the grace window.
    private func appLeft() {
        hasLeft = true
        let p = phase
        if case .some = info, p == .open || p == .loading {
            markLeft()
            resumeTo = p
            move(.cover)
        }
    }

    private func appBecameActive() {
        guard hasLeft else { return }
        hasLeft = false
        overlayKey += 1
        guard let left = leftAt else { return }
        let mono = monotonicMs() - left.mono
        let wall = nowMs() - left.wall
        leftAt = nil
        if phase != .cover { return }
        let grace = leftInFlow ? IN_APP_FLOW_GRACE_MS : LOCK_GRACE_MS
        move(mono < grace && wall >= 0 && wall < grace ? resumeTo : .locked)
    }

    /// Every way INTO the app goes through here: an unlock or a lift that finishes while the app is
    /// away becomes an ordinary "left while open", so the grace check still runs on return.
    private func enter(_ next: LockPhase) {
        if appIsActive { return move(next) }
        markLeft()
        resumeTo = next
        move(.cover)
    }

    // MARK: effects keyed on auth / data (call evaluate() when they change)

    func evaluate() {
        // Signed out: the passcode belonged to that session. Cleared HERE, after the session is gone.
        if !auth.isLoading && !auth.isAuthenticated && info != .unknown {
            if case .some = info {
                clearPasscode()
                return
            } else if phase != .open {
                setPhase(.open)
                return
            }
        }

        // Signed in with no passcode: required. Onboarding asks first; this catches the rest.
        if !auth.isLoading && auth.isAuthenticated && auth.hasCompletedOnboarding && info == .none && phase == .open {
            move(.setup) // through move(): the layer may still be 0 from a lift
            return
        }

        // Loading: one full breath, longer only if auth or the first data are still out.
        if phase == .loading && cycleDone && !auth.isLoading {
            if !auth.isAuthenticated || data.isReady { lift() }
        }
    }

    // MARK: actions

    func lift() {
        guard !lifting else { return }
        lifting = true
        let from = phase
        withAnimation(.rn(.rnDefault, 220), completionCriteria: .logicallyComplete) {
            layer = 0
        } completion: {
            // Only if nothing re-locked or covered the app during the fade.
            if self.phase == from { self.enter(.open) }
        }
    }

    func unlock(_ code: String) async -> Bool {
        switch verifyPasscode(code) {
        case .ok:
            message = nil
            setLockedUntil(0)
            enter(.loading)
            return true
        case let .failed(until, attemptsLeft):
            now = nowMs()
            setLockedUntil(until)
            message = until > nowMs()
                ? nil
                : "Wrong passcode. \(attemptsLeft) \(attemptsLeft == 1 ? "try" : "tries") left before a short lockout."
            return false
        }
    }

    func forgot() {
        let text = "You will be signed out. Sign back in to set a new passcode."
        AppAlert.alert("Forgot your passcode?", text, [
            AlertButton("Cancel", style: .cancel),
            AlertButton("Sign out", style: .destructive) { [weak self] in
                guard let self else { return }
                Task {
                    await self.auth.logout()
                    self.router.replace("/onboarding")
                }
            },
        ])
    }
}

/// Wraps the navigation stack (RN: <LockGate>{Stack}</LockGate>) and provides the two contexts.
/// Screen readers must not reach the app under the lock.
struct LockGate<Content: View>: View {
    @Environment(LockGateModel.self) private var lock
    @ViewBuilder var content: Content

    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        content
            .environment(\.lockWarm, lock.warm)
            .environment(\.lockOpen, !lock.locked)
            .accessibilityHidden(lock.locked)
    }
}

/// The lock window's root (OverlayWindows).
struct LockSheetRoot: View {
    @Environment(LockGateModel.self) private var lock
    @Environment(ThemeStore.self) private var theme

    var body: some View {
        RNRoot {
            LockSheet()
                .id(lock.overlayKey)
        }
        .preferredColorScheme(theme.isDark ? .dark : .light)
    }
}

private struct LockSheet: View {
    @Environment(LockGateModel.self) private var lock
    @Environment(ThemeStore.self) private var theme
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win

    var body: some View {
        let colors = theme.colors
        // The approved render's proportions: the word is 0.517 of the screen width.
        let bigMark = jsRound(Double(win.width) * 0.517)
        ZStack {
            colors.bg
            if lock.showMark {
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    // Intro: only the word fades; the dove flies in at full strength and lands on
                    // the R as the fade ends. Loading (after the passcode): the word breathes and the
                    // dove flaps above the R. Covering: the whole mark, dove included, breathes.
                    // The doves are overlays (RN: absolute children), so only the word sizes the box.
                    DoveMark(width: bigMark, perched: lock.phase == .cover)
                        .opacity(lock.mark)
                        .overlay(alignment: .topLeading) {
                            if lock.phase == .loading {
                                DoveHover(width: bigMark)
                            }
                            if lock.phase == .intro {
                                DoveFlight(width: bigMark, duration: FADE_MS, play: lock.introReady)
                            }
                        }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, insets.top)
            } else {
                Group {
                    if lock.phase == .setup {
                        PasscodeSetup(palette: PadPalette(colors), header: AnyView(smallMark)) { lock.lift() }
                    } else {
                        PasscodePad(
                            palette: PadPalette(colors),
                            title: "Enter your passcode",
                            length: lock.passcodeLength,
                            message: lock.waitSecs > 0 ? "Too many tries. Try again in \(lock.waitSecs)s." : lock.message,
                            disabled: lock.waitSecs > 0,
                            footer: AnyView(
                                Button { lock.forgot() } label: {
                                    Text("Forgot passcode?")
                                        .font(.custom(FontFamily.semibold, size: 14))
                                        .foregroundStyle(colors.mut)
                                }
                                .buttonStyle(PlainPressStyle())
                                .hitSlop(10)
                            ),
                            header: AnyView(smallMark),
                            onSubmit: { await lock.unlock($0) }
                        )
                    }
                }
                .opacity(lock.pad)
                .debugScreenCapture(lock.phase == .setup ? "lock-setup" : "lock-keypad")
            }
        }
        .opacity(lock.layer)
        .ignoresSafeArea()
        .accessibilityAddTraits(.isModal)
    }

    /// The perched dove rises 0.36 of the word's width above it.
    private var smallMark: some View {
        DoveMark(width: SMALL_MARK)
            .padding(.top, ceil(SMALL_MARK * 0.36))
            .padding(.bottom, 18)
    }
}

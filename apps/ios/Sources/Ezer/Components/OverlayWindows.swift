// The two native surfaces the RN app drew above everything:
//   · the passcode lock (RN: react-native-screens FullWindowOverlay on iOS) — must cover presented
//     sheets and the fullScreenCover Paywall too, so it is its own UIWindow at .alert + 1;
//   · the in-app alerts (RN: AppAlertHost inside its own Modal, "above the passcode lock") — a
//     UIWindow at .alert + 2.
// Both are installed once, from the root view, with the same stores injected (AppEnvironment).
// The alert window passes touches through everywhere except the notice card (RN pointerEvents
// "box-none"), and takes every touch while a choice sheet is up.

import SwiftUI
import UIKit

/// Every store the RN provider tree held, so overlay windows and RNModal content see the same ones.
@MainActor
struct AppEnvironment {
    let theme: ThemeStore
    let auth: AuthStore
    let premium: PremiumStore
    let data: DataStore
    let savings: SavingsGoalsStore
    let router: Router
    let lock: LockGateModel
}

extension View {
    /// Injects every store, in the RN provider order.
    @MainActor
    func appEnvironment(_ e: AppEnvironment) -> some View {
        self.environment(e.theme)
            .environment(e.auth)
            .environment(e.premium)
            .environment(e.data)
            .environment(e.savings)
            .environment(e.router)
            .environment(e.lock)
    }
}

/// A UIWindow whose touches fall through to the windows below, except where `isInteractive` says.
final class PassThroughWindow: UIWindow {
    var isInteractive: (CGPoint) -> Bool = { _ in true }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard !isHidden, isInteractive(point) else { return nil }
        return super.hitTest(point, with: event)
    }
}

/// Hosting controller with a clear background and the theme's status-bar style.
final class OverlayHostingController<V: View>: UIHostingController<V> {
    var statusBarStyle: UIStatusBarStyle = .default {
        didSet { if oldValue != statusBarStyle { setNeedsStatusBarAppearanceUpdate() } }
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { statusBarStyle }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
    }
}

@MainActor
final class OverlayWindows {
    static let shared = OverlayWindows()

    private(set) var lockWindow: PassThroughWindow?
    private(set) var alertWindow: PassThroughWindow?
    /// The camera dove (CameraDove.swift): below the lock, above presented sheets; never takes a touch.
    private(set) var cameraDoveWindow: PassThroughWindow?
    private var cameraDoveVisible = false
    private var env: AppEnvironment?
    private var lockVisible = false
    /// The notice card's frame in window coordinates (touches elsewhere pass through).
    var noticeRect: CGRect = .zero

    /// Called once the main window exists (root view onAppear).
    func install(_ env: AppEnvironment) {
        guard lockWindow == nil else { return }
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        self.env = env

        let lock = PassThroughWindow(windowScene: scene)
        lock.windowLevel = .alert + 1
        lock.backgroundColor = .clear
        let lockHost = OverlayHostingController(rootView: AnyView(LockSheetRoot().appEnvironment(env)))
        lock.rootViewController = lockHost
        lock.isHidden = !lockVisible
        lockWindow = lock

        // The lock passes touches through while P1 flies into the camera over the app.
        lock.isInteractive = { [weak model = env.lock] _ in !(model?.p1Exit ?? false) }

        let dove = PassThroughWindow(windowScene: scene)
        dove.windowLevel = .alert
        dove.backgroundColor = .clear
        dove.isInteractive = { _ in false }
        dove.rootViewController = OverlayHostingController(rootView: AnyView(CameraDoveRoot().appEnvironment(env)))
        dove.isHidden = !cameraDoveVisible
        cameraDoveWindow = dove

        let alerts = PassThroughWindow(windowScene: scene)
        alerts.windowLevel = .alert + 2
        alerts.backgroundColor = .clear
        alerts.isInteractive = { [weak self] p in
            guard let self, let current = AppAlertCenter.shared.current else { return false }
            if current.buttons.count <= 1 { return self.noticeRect.contains(p) }
            return true
        }
        alerts.rootViewController = OverlayHostingController(rootView: AnyView(AppAlertHost().appEnvironment(env)))
        alerts.isHidden = AppAlertCenter.shared.current == nil
        alertWindow = alerts

        applyStatusBar(isDark: env.theme.isDark)
    }

    /// Shown while the lock covers the app (any phase but 'open').
    func setLockVisible(_ visible: Bool) {
        lockVisible = visible
        guard let w = lockWindow else { return }
        if w.isHidden == visible {
            w.isHidden = !visible
        }
        if visible {
            // Cover NOW (before the app-switcher snapshot): flush the pending SwiftUI update.
            w.rootViewController?.view.setNeedsLayout()
            w.layoutIfNeeded()
        }
    }

    func setCameraDoveVisible(_ visible: Bool) {
        cameraDoveVisible = visible
        cameraDoveWindow?.isHidden = !visible
    }

    func alertQueueChanged() {
        alertWindow?.isHidden = AppAlertCenter.shared.current == nil
    }

    func applyStatusBar(isDark: Bool) {
        let style: UIStatusBarStyle = isDark ? .lightContent : .darkContent
        (lockWindow?.rootViewController as? OverlayHostingController<AnyView>)?.statusBarStyle = style
        (alertWindow?.rootViewController as? OverlayHostingController<AnyView>)?.statusBarStyle = style
        (cameraDoveWindow?.rootViewController as? OverlayHostingController<AnyView>)?.statusBarStyle = style
    }
}

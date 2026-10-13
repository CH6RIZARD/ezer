// Port of apps/mobile/utils/expoRuntime.ts (+ small platform shims used across the port:
// haptics, keyboard dismissal, opening URLs).

import SwiftUI
import UIKit

/// Expo Go has no iOS-native equivalent.
func isExpoGo() -> Bool { false }

/** Dev builds: do not hard-lock the app behind an undismissable paywall. RN: __DEV__ || Expo Go || web. */
func isLoosePreviewMode() -> Bool {
    #if DEBUG
    return true
    #else
    return false
    #endif
}

/// RN `__DEV__`.
let __DEV__: Bool = {
    #if DEBUG
    return true
    #else
    return false
    #endif
}()

/// expo-haptics.
@MainActor
enum Haptics {
    /// impactAsync(ImpactFeedbackStyle.Light)
    static func impactLight() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    /// impactAsync(ImpactFeedbackStyle.Medium)
    static func impactMedium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    /// impactAsync(ImpactFeedbackStyle.Heavy)
    static func impactHeavy() { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
    /// selectionAsync()
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
    /// notificationAsync(NotificationFeedbackType.Error / Success / Warning)
    static func notifyError() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
    static func notifySuccess() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func notifyWarning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
}

/// RN `Keyboard.dismiss()`.
@MainActor
func dismissKeyboard() {
    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
}

/// RN `Linking.canOpenURL` + `Linking.openURL`. Returns false when it could not be opened.
@MainActor
@discardableResult
func openURL(_ s: String) async -> Bool {
    guard let url = URL(string: s), UIApplication.shared.canOpenURL(url) else { return false }
    return await UIApplication.shared.open(url)
}

/// RN `AppState.currentState === 'active'`.
@MainActor
var appIsActive: Bool { UIApplication.shared.applicationState == .active }

/// Monotonic milliseconds (RN `performance.now()`): stops while the phone sleeps, cannot be moved
/// by setting the device clock.
func monotonicMs() -> Double { ProcessInfo.processInfo.systemUptime * 1000 }

/// JS `Math.round` (halves round toward +infinity).
func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

/// Runs `body` on the main actor on the next run-loop turn (after SwiftUI commits the current
/// update) — RN's "set the start value, then animate" pattern needs one rendered frame between.
func onNextRunLoop(_ body: @escaping @MainActor () -> Void) {
    DispatchQueue.main.async {
        MainActor.assumeIsolated { body() }
    }
}

/// RN `Share.share({ message })`: the system share sheet from the top-most view controller
/// (works above sheets and the Paywall). `completion(true)` when the user completed an action.
@MainActor
func shareText(_ message: String, completion: ((Bool) -> Void)? = nil) {
    guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
          var top = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController ?? scene.windows.first?.rootViewController
    else { completion?(false); return }
    while let p = top.presentedViewController, !p.isBeingDismissed { top = p }
    let vc = UIActivityViewController(activityItems: [message], applicationActivities: nil)
    vc.completionWithItemsHandler = { _, done, _, _ in completion?(done) }
    vc.popoverPresentationController?.sourceView = top.view
    top.present(vc, animated: true)
}

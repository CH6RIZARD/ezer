// Port of apps/mobile/utils/appAlert.ts
//
// Drop-in for React Native's `Alert`, rendered by the app itself (Components/AppAlertHost.swift)
// instead of the OS dialog. Same call shape. NEVER use SwiftUI `.alert` or UIAlertController
// (CLAUDE.md "Alerts are in-app, never the OS dialog").
//
//   AppAlert.alert("Could not open the page", "Cancel \(name) at:\n\(url)")
//   AppAlert.alert("Forgot your passcode?", text, [
//       AlertButton("Cancel", style: .cancel),
//       AlertButton("Sign out", style: .destructive) { signOut() },
//   ])
//
// 0-1 buttons -> a notice card at the top; 2+ -> a bottom sheet.

import Foundation
import Observation

struct AlertButton {
    enum Style { case `default`, cancel, destructive }
    let text: String
    var style: Style = .default
    var onPress: (() -> Void)?

    init(_ text: String, style: Style = .default, onPress: (() -> Void)? = nil) {
        self.text = text
        self.style = style
        self.onPress = onPress
    }
}

struct AppAlertItem: Identifiable {
    let id: Int
    let title: String
    let message: String?
    let buttons: [AlertButton]
}

/// The RN emitter + AppAlertHost's queue (one at a time). Kept outside the view so the overlay
/// window can be shown/hidden from the same state.
@Observable
@MainActor
final class AppAlertCenter {
    static let shared = AppAlertCenter()

    private(set) var queue: [AppAlertItem] = []
    private var seq = 0

    var current: AppAlertItem? { queue.first }

    func push(_ title: String, _ message: String?, _ buttons: [AlertButton]?) {
        seq += 1
        queue.append(AppAlertItem(id: seq, title: title, message: message, buttons: buttons ?? []))
        OverlayWindows.shared.alertQueueChanged()
    }

    func dismiss(_ a: AppAlertItem, pressed: AlertButton? = nil) {
        queue.removeAll { $0.id == a.id }
        OverlayWindows.shared.alertQueueChanged()
        pressed?.onPress?()
    }
}

enum AppAlert {
    /// RN `Alert.alert(title, message?, buttons?)`. Callable from anywhere (async code included).
    static func alert(_ title: String, _ message: String? = nil, _ buttons: [AlertButton]? = nil) {
        if Thread.isMainThread {
            MainActor.assumeIsolated { AppAlertCenter.shared.push(title, message, buttons) }
        } else {
            onNextRunLoop { AppAlertCenter.shared.push(title, message, buttons) }
        }
    }
}

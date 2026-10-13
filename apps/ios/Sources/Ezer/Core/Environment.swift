// RN context/hook equivalents that are plain values in SwiftUI's environment:
//
//   @Environment(\.safeInsets) var insets        // useSafeAreaInsets() — the WINDOW's insets
//   @Environment(\.windowSize) var win           // useWindowDimensions() / Dimensions.get('window')
//   @Environment(\.isScreenFocused) var focused  // useIsFocused() — false for hidden tabs / covered screens
//   @Environment(\.lockOpen) var unlocked        // LockOpenContext — false while the passcode lock is up
//   @Environment(\.lockWarm) var warm            // LockWarmContext — true once the code is accepted
//   @Environment(\.accessibilityReduceMotion)    // useReduceMotion() / useReducedMotion()
//
// RN screens draw edge-to-edge and add insets by hand. Do the same: `.rnScreen()` (or
// `.ignoresSafeArea(.container)`) on the screen root, then `.padding(.top, insets.top + 16)`.
// Ignore only the CONTAINER region so SwiftUI still lifts content above the keyboard
// (RN's KeyboardAvoidingView).

import SwiftUI
import UIKit

private struct SafeInsetsKey: EnvironmentKey { static let defaultValue = EdgeInsets() }
private struct WindowSizeKey: EnvironmentKey { static let defaultValue = CGSize(width: 390, height: 844) }
private struct ScreenFocusedKey: EnvironmentKey { static let defaultValue = true }
private struct LockOpenKey: EnvironmentKey { static let defaultValue = true }
private struct LockWarmKey: EnvironmentKey { static let defaultValue = true }

extension EnvironmentValues {
    var safeInsets: EdgeInsets {
        get { self[SafeInsetsKey.self] }
        set { self[SafeInsetsKey.self] = newValue }
    }
    var windowSize: CGSize {
        get { self[WindowSizeKey.self] }
        set { self[WindowSizeKey.self] = newValue }
    }
    var isScreenFocused: Bool {
        get { self[ScreenFocusedKey.self] }
        set { self[ScreenFocusedKey.self] = newValue }
    }
    var lockOpen: Bool {
        get { self[LockOpenKey.self] }
        set { self[LockOpenKey.self] = newValue }
    }
    var lockWarm: Bool {
        get { self[LockWarmKey.self] }
        set { self[LockWarmKey.self] = newValue }
    }
}

extension View {
    /// An RN screen root: draws under the status bar and home indicator (insets are added by
    /// hand from `\.safeInsets`), while still avoiding the keyboard.
    func rnScreen() -> some View {
        self.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .ignoresSafeArea(.container)
    }

    /// RN `hitSlop={n}`: grows the touch area by n on every side without changing layout.
    func hitSlop(_ n: CGFloat) -> some View {
        self.padding(n).contentShape(Rectangle()).padding(-n)
    }
}

/// Reads the window's safe-area insets and size from UIKit — exactly what RN's SafeAreaProvider
/// reports (keyboard-independent) — and publishes them to the environment.
struct RNRoot<Content: View>: View {
    @ViewBuilder var content: Content
    @State private var insets = EdgeInsets()
    @State private var size = CGSize.zero

    var body: some View {
        content
            .environment(\.safeInsets, insets)
            .environment(\.windowSize, size == .zero ? CGSize(width: 390, height: 844) : size)
            .background(
                WindowMetricsProbe { i, s in
                    if insets != i { insets = i }
                    if size != s { size = s }
                }
                .allowsHitTesting(false)
            )
    }
}

private struct WindowMetricsProbe: UIViewRepresentable {
    let onChange: (EdgeInsets, CGSize) -> Void

    func makeUIView(context: Context) -> ProbeView {
        let v = ProbeView()
        v.onChange = onChange
        v.isUserInteractionEnabled = false
        return v
    }

    func updateUIView(_ uiView: ProbeView, context: Context) {
        uiView.onChange = onChange
    }

    final class ProbeView: UIView {
        var onChange: ((EdgeInsets, CGSize) -> Void)?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            report()
        }

        override func safeAreaInsetsDidChange() {
            super.safeAreaInsetsDidChange()
            report()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            report()
        }

        private func report() {
            guard let w = window else { return }
            let i = w.safeAreaInsets
            let e = EdgeInsets(top: i.top, leading: i.left, bottom: i.bottom, trailing: i.right)
            let s = w.bounds.size
            onNextRunLoop { [weak self] in self?.onChange?(e, s) }
        }
    }
}

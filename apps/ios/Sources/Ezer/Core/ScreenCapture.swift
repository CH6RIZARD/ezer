// DEBUG-only screen capture, so the port can be compared against the RN app without a Mac
// (toolchain.md §8: the app writes its own screens into Documents/, which UIFileSharingEnabled
// exposes over USB — `afcclient --documents XTL-<id>.com.example.Ezer` in WSL).
//
// Every tab, pushed route, the onboarding root, the Paywall and the lock's keypad/setup are
// captured automatically 1.5 s after they become the visible screen, as
// Documents/screens/<name>-<light|dark|black>.png (all windows composited: app, lock, alerts).
// Feature screens get this for free; add `.debugScreenCapture("my-sheet")` to capture a sheet.
// Release builds compile it to nothing.

import SwiftUI
import UIKit

enum ScreenCapture {
    @MainActor
    static func snap(_ name: String) {
        #if DEBUG
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let windows = scene.windows.filter { !$0.isHidden && $0.bounds.width > 0 }.sorted { $0.windowLevel < $1.windowLevel }
        guard let bounds = windows.first?.bounds else { return }
        let image = UIGraphicsImageRenderer(bounds: bounds).image { _ in
            for w in windows { w.drawHierarchy(in: w.bounds, afterScreenUpdates: false) }
        }
        guard let png = image.pngData(),
              let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return }
        let dir = docs.appendingPathComponent("screens", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let mode = KV.get(ThemeStore.storageKey) ?? "system"
        let safe = name.replacingOccurrences(of: "/", with: "_")
        try? png.write(to: dir.appendingPathComponent("\(safe)-\(mode).png"), options: .atomic)
        #endif
    }
}

private struct DebugScreenCapture: ViewModifier {
    let name: String
    let active: Bool?
    @Environment(\.isScreenFocused) private var focused
    @Environment(\.lockOpen) private var lockOpen

    func body(content: Content) -> some View {
        #if DEBUG
        let visible = active ?? focused
        content.task(id: "\(name)|\(visible)|\(lockOpen)") {
            guard visible else { return }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if !Task.isCancelled { ScreenCapture.snap(name) }
        }
        #else
        content
        #endif
    }
}

extension View {
    /// DEBUG: capture this screen to Documents/screens/<name>-<mode>.png once it has been visible 1.5 s.
    /// `active` overrides the screen-focus check (default: `\.isScreenFocused`).
    func debugScreenCapture(_ name: String, active: Bool? = nil) -> some View {
        modifier(DebugScreenCapture(name: name, active: active))
    }
}

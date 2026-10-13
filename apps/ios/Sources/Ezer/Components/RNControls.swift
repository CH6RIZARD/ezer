// RN / Expo primitives used by several feature screens, implemented once the way RN implements
// them on iOS (port map §1.4, §1.7):
//
//   LinearGradient.rn(["#5B21B6", "#31136E"], locations: [0, 0.55], start: .init(x: 0, y: 0), end: .init(x: 1, y: 1))
//       expo-linear-gradient: default start {x:.5,y:0} end {x:.5,y:1}; no locations = even stops.
//   RNBlurView(intensity: 12, tint: isDark ? .dark : .light)
//       expo-blur: a UIVisualEffectView whose effect is run to intensity/100 by a paused animator.
//   RNSwitch(isOn: $on, trackColorFalse: c.line2, trackColorTrue: c.accInk, thumbColor: nil)
//       RN Switch: a UISwitch (onTintColor = trackColor.true, tintColor = trackColor.false; the off
//       track is painted only by `iosBackgroundColor:` = RN ios_backgroundColor).
//   RNActivityIndicator(color: c.gold)  /  RNActivityIndicator(color: c.gold, large: true)

import SwiftUI
import UIKit

extension LinearGradient {
    /// expo-linear-gradient with RN's defaults (top -> bottom; evenly spaced stops without `locations`).
    static func rn(_ colors: [String], locations: [Double]? = nil, start: UnitPoint = UnitPoint(x: 0.5, y: 0), end: UnitPoint = UnitPoint(x: 0.5, y: 1)) -> LinearGradient {
        rn(colors.map { Color(css: $0) }, locations: locations, start: start, end: end)
    }

    static func rn(_ colors: [Color], locations: [Double]? = nil, start: UnitPoint = UnitPoint(x: 0.5, y: 0), end: UnitPoint = UnitPoint(x: 0.5, y: 1)) -> LinearGradient {
        let n = colors.count
        let stops: [Gradient.Stop] = colors.enumerated().map { i, c in
            let loc: Double
            if let locations, i < locations.count { loc = locations[i] } else { loc = n > 1 ? Double(i) / Double(n - 1) : 0 }
            return Gradient.Stop(color: c, location: loc)
        }
        return LinearGradient(stops: stops, startPoint: start, endPoint: end)
    }
}

/// expo-blur `<BlurView intensity tint>`.
struct RNBlurView: UIViewRepresentable {
    enum Tint { case light, dark, `default` }
    var intensity: Double = 50
    var tint: Tint = .default

    final class BlurHost: UIVisualEffectView {
        var animator: UIViewPropertyAnimator?
        deinit { animator?.stopAnimation(true) }
    }

    func makeUIView(context: Context) -> BlurHost {
        let v = BlurHost(effect: nil)
        apply(v)
        return v
    }

    func updateUIView(_ v: BlurHost, context: Context) { apply(v) }

    private func apply(_ v: BlurHost) {
        let style: UIBlurEffect.Style = tint == .dark ? .dark : tint == .light ? .light : .regular
        v.animator?.stopAnimation(true)
        v.effect = nil
        // Weak: the view owns the animator, so a strong capture leaked both (deinit never ran).
        let a = UIViewPropertyAnimator(duration: 1, curve: .linear) { [weak v] in v?.effect = UIBlurEffect(style: style) }
        a.fractionComplete = max(0, min(1, intensity / 100))
        a.pausesOnCompletion = true
        v.animator = a
    }
}

/// RN `<Switch value onValueChange trackColor={{false, true}} thumbColor ios_backgroundColor>` on iOS,
/// mapped exactly as RN 0.81's Switch.js does: onTintColor = trackColor.true, tintColor =
/// trackColor.false (on current iOS that is only the off-state outline, NOT the off track), and the
/// off-track fill only from `ios_backgroundColor` (backgroundColor + borderRadius 16).
struct RNSwitch: UIViewRepresentable {
    @Binding var isOn: Bool
    var trackColorFalse: Color?
    var trackColorTrue: Color?
    var thumbColor: Color?
    var disabled = false
    /// RN `ios_backgroundColor`.
    var iosBackgroundColor: Color? = nil

    final class Coordinator: NSObject {
        var parent: RNSwitch
        init(_ p: RNSwitch) { parent = p }
        @objc func changed(_ s: UISwitch) { parent.isOn = s.isOn }
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> UISwitch {
        let s = UISwitch()
        s.addTarget(context.coordinator, action: #selector(Coordinator.changed(_:)), for: .valueChanged)
        s.setContentHuggingPriority(.required, for: .horizontal)
        return s
    }

    func updateUIView(_ s: UISwitch, context: Context) {
        context.coordinator.parent = self
        if s.isOn != isOn { s.setOn(isOn, animated: true) }
        s.isEnabled = !disabled
        s.onTintColor = trackColorTrue.map { UIColor($0) }
        s.tintColor = trackColorFalse.map { UIColor($0) }
        if let bg = iosBackgroundColor {
            s.backgroundColor = UIColor(bg)
            s.layer.cornerRadius = 16
        } else {
            s.backgroundColor = nil
            s.layer.cornerRadius = 0
        }
        s.thumbTintColor = thumbColor.map { UIColor($0) }
    }
}

/// RN `<ActivityIndicator color size>`: 'small' (default) / 'large'.
struct RNActivityIndicator: View {
    var color: Color
    var large = false

    var body: some View {
        ProgressView()
            .progressViewStyle(.circular)
            .tint(color)
            .controlSize(large ? .large : .regular)
    }
}

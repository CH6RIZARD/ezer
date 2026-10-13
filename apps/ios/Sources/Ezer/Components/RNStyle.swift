// StyleSheet box helpers (port map §1.4), so every porter draws RN boxes the same way:
//   · RN borderRadius is CIRCULAR arcs (no file sets borderCurve) — SwiftUI's RoundedRectangle
//     defaults to .continuous, which is visibly different at large radii. Use rnRect(r).
//   · RN borders sit INSIDE the frame (strokeBorder), on top of the background.
//   · RN does not clip children to the radius unless overflow: 'hidden' (clip: true).
//   · iOS shadow props apply to the BACKGROUND SHAPE, not the text inside.
//
//   content.padding(16).rnBox(bg: c.card, radius: 18, border: c.line)
//   content.rnBox(bg: c.card, radius: 22, clip: true).rnShadow("#000000", opacity: 0.25, radius: 12, y: 6)

import SwiftUI
import UIKit

/// The RN `borderRadius` shape.
func rnRect(_ r: CGFloat) -> RoundedRectangle { RoundedRectangle(cornerRadius: r, style: .circular) }

/// Per-corner radii (borderTopLeftRadius …), circular like RN.
func rnRect(topLeading: CGFloat = 0, topTrailing: CGFloat = 0, bottomTrailing: CGFloat = 0, bottomLeading: CGFloat = 0) -> UnevenRoundedRectangle {
    UnevenRoundedRectangle(topLeadingRadius: topLeading, bottomLeadingRadius: bottomLeading, bottomTrailingRadius: bottomTrailing, topTrailingRadius: topTrailing, style: .circular)
}

extension View {
    /// backgroundColor + borderRadius + borderWidth/borderColor (+ overflow: 'hidden' when `clip`).
    func rnBox(bg: Color? = nil, radius: CGFloat = 0, border: Color? = nil, borderWidth: CGFloat = 1, clip: Bool = false) -> some View {
        let shape = rnRect(radius)
        return self
            .rnClipIf(clip, shape)
            .background { if let bg { shape.fill(bg) } }
            .overlay { if let border { shape.strokeBorder(border, lineWidth: borderWidth) } }
    }

    @ViewBuilder
    fileprivate func rnClipIf<S: Shape>(_ clip: Bool, _ shape: S) -> some View {
        if clip { self.clipShape(shape) } else { self }
    }

    /// iOS shadowColor/shadowOpacity/shadowRadius/shadowOffset. Apply it to the box (after rnBox) so the
    /// shadow comes from the background shape. `elevation` (Android) has no iOS meaning.
    func rnShadow(_ color: String, opacity: Double, radius: CGFloat, x: CGFloat = 0, y: CGFloat = 0) -> some View {
        self.shadow(color: Color(css: color).opacity(opacity), radius: radius, x: x, y: y)
    }

    /// RN ScrollView `bounces={false}`. SwiftUI has no switch for it, so a probe placed in the scroll
    /// CONTENT's background finds the hosting UIScrollView and turns bouncing off:
    /// `ScrollView { content.rnNoBounce() }`.
    func rnNoBounce() -> some View { background(RNNoBounce()) }
}

private struct RNNoBounce: UIViewRepresentable {
    func makeUIView(context: Context) -> RNNoBounceProbe {
        let v = RNNoBounceProbe()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: RNNoBounceProbe, context: Context) { uiView.apply() }
}

private final class RNNoBounceProbe: UIView {
    override func didMoveToWindow() {
        super.didMoveToWindow()
        onNextRunLoop { [weak self] in self?.apply() }
    }

    func apply() {
        var v = superview
        while let s = v {
            if let scroll = s as? UIScrollView {
                if scroll.bounces { scroll.bounces = false }
                return
            }
            v = s.superview
        }
    }
}

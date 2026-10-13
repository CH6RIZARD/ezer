// Port of apps/mobile/components/redesign/CardCanvas.tsx (CardCanvas — the faces are in CardFaces.swift)
//
// =============================================================================
// EZER Redesign — Physical card drawing surface
//
// A 308x190 card face (the same geometry as VirtualCard) that doubles as a
// freehand drawing canvas. Used by Card Studio (PhysicalCardView).
//
// Strokes are SVG path strings, not point arrays: the design has to survive a
// JSON round-trip AND be handed to a print vendor later. An SVG `d` string is
// already the printable artwork. Coordinates are card-local (0..308 x 0..190).
//
// The flip: the front and back are cross-faded at the rotation's halfway point
// while the whole card keeps spinning (no backface visibility needed).
//
// RN kept the live stroke on the UI thread (a worklet + animated Path) so a touch
// sample ran no React render; here the live `d` is plain @State and SwiftUI redraws
// just this face. The parent hears about the stroke once, on release.
// =============================================================================

import QuartzCore
import SwiftUI

/** Points closer together than this are dropped — keeps `d` strings small. */
private let MIN_STEP: CGFloat = 1.6

private func clamp(_ v: CGFloat, _ max: CGFloat) -> CGFloat { v < 0 ? 0 : v > max ? max : v }

/** One decimal is well under a printed pixel and roughly halves the payload.
 *  Formatted exactly as JS prints `Math.round(v * 10) / 10` ("12", "12.5"), so the stored `d`
 *  stays byte-compatible with the RN app's. */
private func r1(_ v: CGFloat) -> String {
    let r = jsRound(Double(v) * 10) / 10
    if r == r.rounded(), abs(r) < 1e15 { return String(Int(r)) }
    return "\(r)"
}

private let FLIP_MS: Double = 620

struct CardCanvas: View {
    let finish: CardFinish
    let strokes: [Stroke]
    /** Colour/width applied to the stroke currently being drawn. */
    let color: String
    let width: Double
    /** Showing the back disables drawing — the back is fixed security printing. */
    var flipped = false
    /** Committed when the finger lifts. Never called for a stray tap. */
    let onStrokeEnd: (Stroke) -> Void
    /**
     * Fired on grant/release (and on a cancelled drag) so the parent can freeze its ScrollView (`.scrollDisabled`).
     * Without this the vertical scroll can steal the pan halfway through a stroke.
     */
    var onDrawingChange: ((Bool) -> Void)?

    init(
        finish: CardFinish,
        strokes: [Stroke],
        color: String,
        width: Double,
        flipped: Bool = false,
        onStrokeEnd: @escaping (Stroke) -> Void,
        onDrawingChange: ((Bool) -> Void)? = nil
    ) {
        self.finish = finish
        self.strokes = strokes
        self.color = color
        self.width = width
        self.flipped = flipped
        self.onStrokeEnd = onStrokeEnd
        self.onDrawingChange = onDrawingChange
        _flip = State(initialValue: flipped ? 1 : 0)
    }

    // The in-progress stroke.
    @State private var liveD = ""
    @State private var segs = 0
    @State private var lastX: CGFloat = 0
    @State private var lastY: CGFloat = 0
    @State private var down = false
    /// True while a finger is on the canvas. SwiftUI resets it when the drag ends AND when the
    /// system cancels it, but calls `onEnded` only for the first; RN's onFinalize ran for both.
    @GestureState private var touching = false

    @State private var flip: Double

    var body: some View {
        ZStack {
            // --- Front: chip + the user's artwork. No wording.
            CardFrontFace(
                finish: finish,
                strokes: strokes,
                liveStroke: liveD.isEmpty ? nil : Stroke(d: liveD, color: color, width: width)
            )
            // Touch layer, last child so it is on top of everything above.
            .overlay(
                Color.clear
                    .contentShape(Rectangle())
                    .highPriorityGesture(pan, including: flipped ? .none : .all)
            )
            .frame(width: CARD_W, height: CARD_H)
            .clipShape(rnRect(Radius.virtualCard))
            .modifier(PayIn4FlipFace(t: flip, back: false))
            .allowsHitTesting(!flipped)

            // --- Back: fixed security printing. Never drawable.
            CardBackFace(finish: finish)
                .frame(width: CARD_W, height: CARD_H)
                .clipShape(rnRect(Radius.virtualCard))
                .modifier(PayIn4FlipFace(t: flip, back: true))
                .allowsHitTesting(false)
        }
        .frame(width: CARD_W, height: CARD_H)
        .onChange(of: flipped) { _, f in
            // Animated.timing with no easing: 620ms, Easing.inOut(Easing.ease).
            withAnimation(.rn(.rnDefault, FLIP_MS)) { flip = f ? 1 : 0 }
        }
        // Cleared only once the committed stroke has rendered, so the line never
        // blinks out between release and the parent's re-render.
        // A finger already down on the next stroke keeps its own live path.
        .onChange(of: strokes) { _, _ in
            if !down { liveD = "" }
        }
        // A cancelled drag (the page scroll or a system gesture took the touch) never reaches
        // onEnded: finalize here too, or `drawing` stays true and Card Studio's scroll stays frozen.
        // After a normal end this is a no-op (`down` is already false).
        .onChange(of: touching) { _, t in
            if !t { finalize() }
        }
    }

    private var pan: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .updating($touching) { _, s, _ in s = true }
            .onChanged { e in
                if !down {
                    // onBegin
                    let x = clamp(e.startLocation.x, CARD_W)
                    let y = clamp(e.startLocation.y, CARD_H)
                    lastX = x
                    lastY = y
                    segs = 0
                    down = true
                    liveD = "M\(r1(x)) \(r1(y))"
                    onDrawingChange?(true)
                }
                // onUpdate: e.location is relative to the touch layer, which covers the card
                // exactly; clamped because a fast drag reports points outside it.
                let x = clamp(e.location.x, CARD_W)
                let y = clamp(e.location.y, CARD_H)
                if hypot(x - lastX, y - lastY) < MIN_STEP { return }
                lastX = x
                lastY = y
                segs += 1
                liveD = "\(liveD) L\(r1(x)) \(r1(y))"
            }
            .onEnded { _ in finalize() }
    }

    /// RN onFinalize (end OR cancel). Runs once per stroke: the `down` guard makes the second
    /// caller (onEnded vs the `touching` reset) a no-op.
    private func finalize() {
        guard down else { return }
        down = false
        defer { onDrawingChange?(false) }
        var d = liveD
        if d.isEmpty { return }
        // A tap: a zero-length line so round caps render it as a dot.
        if segs == 0 { d = "\(d) L\(d.dropFirst())" }
        onStrokeEnd(Stroke(d: d, color: color, width: width))
    }
}

/// One face of the flip: `[{ perspective: 1000 }, { rotateY }]` about the face centre, with the
/// opacity step at the halfway point. Front: rotateY 0→180°, opacity [0, .5, .5001, 1] → [1, 1, 0, 0].
/// Back: rotateY 180→360°, opacity [0, .4999, .5, 1] → [0, 0, 1, 1].
private struct PayIn4FlipFace: ViewModifier, Animatable {
    var t: Double
    let back: Bool

    var animatableData: Double {
        get { t }
        set { t = newValue }
    }

    func body(content: Content) -> some View {
        let deg = back ? 180 + t * 180 : t * 180
        let opacity: Double
        if back {
            opacity = t <= 0.4999 ? 0 : t >= 0.5 ? 1 : (t - 0.4999) / 0.0001
        } else {
            opacity = t <= 0.5 ? 1 : t >= 0.5001 ? 0 : 1 - (t - 0.5) / 0.0001
        }
        return content
            .projectionEffect(PayIn4FlipFace.projection(deg: deg))
            .opacity(opacity)
    }

    /// CATransform3D the way RN builds it on iOS: perspective (m34 = −1/1000) then rotateY, applied
    /// about the view centre. Row-vector order: the LAST array entry touches the point first.
    static func projection(deg: Double) -> ProjectionTransform {
        let cx = CARD_W / 2
        let cy = CARD_H / 2
        var p = CATransform3DIdentity
        p.m34 = -1 / 1000
        var m = CATransform3DMakeTranslation(-cx, -cy, 0)
        m = CATransform3DConcat(m, CATransform3DMakeRotation(CGFloat(deg * .pi / 180), 0, 1, 0))
        m = CATransform3DConcat(m, p)
        m = CATransform3DConcat(m, CATransform3DMakeTranslation(cx, cy, 0))
        return ProjectionTransform(m)
    }
}

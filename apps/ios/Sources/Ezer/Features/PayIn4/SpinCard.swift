// Port of apps/mobile/components/redesign/SpinCard.tsx
//
// =============================================================================
// EZER Redesign — free-drag spin card
//
// The physics behind the Pay in 4 virtual card, in one place so every card that
// wants the same interaction — Card Studio's finished-design review included —
// gets it from here. VirtualCard.swift just supplies its front/back and a tap
// callback; this file owns every pixel of the physics:
//
//   * 308x190, r20, LOCKED in place — never translates
//   * idle float 0 -> -7px -> 0 over 3.6s, which PAUSES IN PLACE once touched
//     (freeze the current frame; do not reset to 0)
//   * drag rotates freely: ry += dx * 0.55, rx -= dy * 0.55 (degrees)
//   * release snaps each axis to the nearest multiple of 180 over 900ms
//     cubic-bezier(.22,1,.36,1)
//   * movement < 4px counts as a tap -> onTap
//   * a solid gold side fills the gap between the faces, visible only mid-spin
//
// CLAUDE.md "Card Studio": the owner approved this exact gold side (seven
// coarse sheets + dense fill-in sheets, 0.25px apart, between faces at ±3).
// Do not redesign it.
//
// How it maps onto SwiftUI: RN on iOS turns each layer's transform array into
// a CATransform3D (perspective m34 = −1/1100, then the depth shift, rotateX,
// rotateY, about the view centre). `CardLayers.transform` builds exactly that
// matrix and `.projectionEffect` applies it. RN's backfaceVisibility: 'hidden'
// becomes a facing test on the face normal (cos rx · cos ry). The native
// driver's work (settle, float) runs off one TimelineView that is paused
// whenever nothing is moving, so a hidden tab costs nothing.
// =============================================================================

import QuartzCore
import SwiftUI

/** Container is taller than the card so the float never clips. */
private let CONTAINER_H: CGFloat = 250
/** Matches the prototype's perspective: 1100px. */
private let PERSPECTIVE: CGFloat = 1100
/** How far each face sits off the card's centre plane along its normal. */
private let FACE_DEPTH: Double = 3
/**
 * The card's gold side: gold sheets stacked between the faces. A single flat
 * core is a zero-width line edge-on, so at 90° the two faces read as two
 * separate sheets with see-through between them. Stacked, the gap fills solid.
 *
 * DENSE: 0.25px apart, under a device pixel, so neighbouring hairlines
 * overlap into one band edge-on. Each sheet is FILLED, a plain colour: rings
 * with an empty middle showed the page through the band just short of edge-on.
 * Shaded darker toward the faces, brighter mid-thickness, like a milled edge.
 */
private let SIDE_STEP: Double = 0.25
private let SIDE_DEPTHS: [Double] = (0..<(Int(jsRound((FACE_DEPTH * 2) / SIDE_STEP)) - 1)).map {
    -FACE_DEPTH + SIDE_STEP * Double($0 + 1)
}
/**
 * Every third sheet (0.75px apart — the old 7) draws whenever the card is
 * tilted; the other 16 only fade in approaching edge-on, where they are needed
 * and nearly free.
 */
private func isCoarse(_ i: Int) -> Bool { (i + 1) % 3 == 0 }

private func mixHex(_ a: String, _ b: String, _ t: Double) -> String {
    func p(_ h: String) -> [Double] {
        let c = Array(h)
        return [1, 3, 5].map { i in Double(Int(String(c[i..<(i + 2)]), radix: 16) ?? 0) }
    }
    let x = p(a)
    let y = p(b)
    return "rgb(" + (0..<3).map { String(Int(jsRound(x[$0] + (y[$0] - x[$0]) * t))) }.joined(separator: ",") + ")"
}

/** Colour per sheet: the metal-edge gradient's ends, deep at the faces, bright mid-way. */
private func sideColor(_ k: Double) -> String {
    mixHex(Gradients.metalEdge[1], Gradients.metalEdge[0], 1 - abs(k) / FACE_DEPTH)
}

private let SIDE_COLORS: [Color] = SIDE_DEPTHS.map { Color(css: sideColor($0)) }

/// RN `interpolate` with extrapolate: 'clamp' over a two-point range.
private func interpClamp(_ v: Double, _ i0: Double, _ i1: Double, _ o0: Double, _ o1: Double) -> Double {
    let t = min(1, max(0, (v - i0) / (i1 - i0)))
    return o0 + (o1 - o0) * t
}

/**
 * The card's layer geometry — faces at ±FACE_DEPTH and the gold sheet stack
 * between them — for ANY rotation source (RN `useCardLayers`). SpinCard drives
 * it from the drag; the onboarding's self-spinning card drives it from a timing
 * loop, so both cards share one thickness. Rotations in degrees, floatY in points.
 */
struct CardLayers: Equatable {
    let rotX: Double
    let rotY: Double
    let floatY: Double

    init(rotX: Double, rotY: Double, floatY: Double = 0) {
        self.rotX = rotX
        self.rotY = rotY
        self.floatY = floatY
    }

    private var rx: Double { rotX * .pi / 180 }
    private var ry: Double { rotY * .pi / 180 }

    /** Side opacity: 0 below ~6° of tilt, full by ~17° (side ≈ 1.8px wide). */
    var edge: Double { interpClamp(abs(sin(rx)) + abs(sin(ry)), 0.1, 0.3, 0, 1) }

    /** Fill-in sheets: |cos rx·cos ry| is how squarely the face still points at
     *  the viewer; they fade in from ~65° of tilt and are full by ~75°. */
    var fine: Double { interpClamp(abs(cos(rx)) * abs(cos(ry)), 0.26, 0.42, 1, 0) }

    /// backfaceVisibility: 'hidden' — the front's normal is (·, ·, cos rx·cos ry) after the turn.
    var frontVisible: Bool { cos(rx) * cos(ry) > 0 }
    var backVisible: Bool { cos(rx) * cos(ry) < 0 }

    /**
     * Depth k along the card's normal, as RN native fakes translateZ: a screen-space shift of
     * (k·sin ry, −k·sin rx·cos ry) placed BEFORE the rotations in the array. RN array:
     * [perspective, translateX, translateY, rotateX, rotateY, (rotateY 180 for the back)].
     * CATransform3D is row-vector, so the LAST array entry is concatenated first. About the centre.
     */
    func transform(at k: Double, flipped: Bool = false) -> ProjectionTransform {
        let cx = CARD_W / 2
        let cy = CARD_H / 2
        var p = CATransform3DIdentity
        p.m34 = -1 / PERSPECTIVE
        let dx = CGFloat(sin(ry) * k)
        let dy = CGFloat(-sin(rx) * cos(ry) * k)
        var m = CATransform3DMakeTranslation(-cx, -cy, 0)
        // rotateY(180) after the shift, so its normal points the other way.
        if flipped { m = CATransform3DConcat(m, CATransform3DMakeRotation(.pi, 0, 1, 0)) }
        m = CATransform3DConcat(m, CATransform3DMakeRotation(CGFloat(ry), 0, 1, 0))
        m = CATransform3DConcat(m, CATransform3DMakeRotation(CGFloat(rx), 1, 0, 0))
        m = CATransform3DConcat(m, CATransform3DMakeTranslation(dx, dy, 0))
        m = CATransform3DConcat(m, p)
        m = CATransform3DConcat(m, CATransform3DMakeTranslation(cx, cy, 0))
        return ProjectionTransform(m)
    }
}

/** The card's layers rendered: gold sheets first, then the two faces. */
struct CardStack<Front: View, Back: View>: View {
    let layers: CardLayers
    let front: Front
    let back: Back

    init(layers: CardLayers, @ViewBuilder front: () -> Front, @ViewBuilder back: () -> Back) {
        self.layers = layers
        self.front = front()
        self.back = back()
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // Gold side — see SIDE_DEPTHS. Painted before the faces, so with no
            // real Z the faces still cover it face-on.
            ForEach(SIDE_DEPTHS.indices, id: \.self) { i in
                rnRect(Radius.virtualCard)
                    .fill(SIDE_COLORS[i])
                    .frame(width: CARD_W, height: CARD_H)
                    .projectionEffect(layers.transform(at: SIDE_DEPTHS[i]))
                    .opacity(isCoarse(i) ? layers.edge : layers.fine)
                    .allowsHitTesting(false)
            }
            front
                .frame(width: CARD_W, height: CARD_H)
                .clipShape(rnRect(Radius.virtualCard))
                .projectionEffect(layers.transform(at: FACE_DEPTH))
                .opacity(layers.frontVisible ? 1 : 0)
            back
                .frame(width: CARD_W, height: CARD_H)
                .clipShape(rnRect(Radius.virtualCard))
                .projectionEffect(layers.transform(at: -FACE_DEPTH, flipped: true))
                .opacity(layers.backVisible ? 1 : 0)
        }
        .frame(width: CARD_W, height: CARD_H)
        .offset(y: layers.floatY)
    }
}

/**
 * RN's CardWarmup pays Android's per-install costs (GPU shader cache, compiled Java for the native
 * driver) before the first drag. iOS has neither, so it draws nothing; kept so a call site ports
 * one to one (app/_layout.tsx mounted it first under the root view).
 */
struct CardWarmup: View {
    var body: some View { EmptyView() }
}

/// The release settle, 900ms cubic-bezier(.22,1,.36,1), evaluated per frame so a grab mid-settle
/// can stop it exactly where it is (RN's stopAnimation read-back).
private struct PayIn4Settle {
    let fromX: Double
    let fromY: Double
    let toX: Double
    let toY: Double
    let start: Date

    func value(at now: Date) -> (x: Double, y: Double) {
        let (c0, c1, c2, c3) = Motion.cardSettleBezier
        let p = min(1, max(0, now.timeIntervalSince(start) * 1000 / Motion.cardSettle))
        let e = RNEasing.bezier(c0, c1, c2, c3)(p)
        return (fromX + (toX - fromX) * e, fromY + (toY - fromY) * e)
    }
}

struct SpinCard<Front: View, Back: View>: View {
    let front: Front
    let back: Back
    /** Movement under the tap slop — a drag never fires this. */
    var onTap: (() -> Void)?
    /**
     * Fired when a turn starts/ends. The parent screen uses this to switch its
     * ScrollView off (`.scrollDisabled`), so a vertical drag on the card rotates it
     * instead of scrolling the page.
     */
    var onDragChange: ((Bool) -> Void)?
    /** "Drag to spin it around" by default — pass "" to hide the hint entirely. */
    var hint: String

    init(
        hint: String = "Drag to spin it around",
        onTap: (() -> Void)? = nil,
        onDragChange: ((Bool) -> Void)? = nil,
        @ViewBuilder front: () -> Front,
        @ViewBuilder back: () -> Back
    ) {
        self.hint = hint
        self.onTap = onTap
        self.onDragChange = onDragChange
        self.front = front()
        self.back = back()
    }

    @Environment(ThemeStore.self) private var theme
    // Reduce Motion: the idle float is decoration, so it simply doesn't run.
    // Drag and settle are the user's own motion and stay as they are.
    @Environment(\.accessibilityReduceMotion) private var reduced
    // Tabs stay mounted while hidden: float only while this screen is on show
    // (CLAUDE.md "Idle loops must stop when their screen is hidden").
    @Environment(\.isScreenFocused) private var focused

    // --- rotation -------------------------------------------------------------
    // The settled base in degrees (RN rx/ry). While a settle runs this already
    // holds its snap target, as RN wrote rxVal/ryVal up front.
    @State private var rx: Double = 0
    @State private var ry: Double = 0
    // The finger's translation while a turn is active (RN tx/ty).
    @State private var tx: CGFloat = 0
    @State private var ty: CGFloat = 0
    @State private var dragActive = false
    @GestureState private var touching = false
    @State private var settle: PayIn4Settle?
    @State private var settleToken = 0

    // --- idle float -----------------------------------------------------------
    // Once touched, the idle float never resumes — per the spec it pauses in
    // place, it does not restart when the finger lifts.
    @State private var interacted = false
    @State private var floatStart: Date?
    @State private var floatFrozen: Double = 0

    var body: some View {
        VStack(spacing: 0) {
            TimelineView(.animation(paused: settle == nil && floatStart == nil)) { tl in
                let now = tl.date
                let base = settle?.value(at: now) ?? (x: rx, y: ry)
                CardStack(
                    layers: CardLayers(
                        rotX: base.x - Double(ty) * Motion.cardRotatePerPx,
                        rotY: base.y + Double(tx) * Motion.cardRotatePerPx,
                        floatY: floatValue(at: now) * Motion.cardFloatTravel
                    )
                ) {
                    front
                } back: {
                    back
                }
            }
            .frame(width: CARD_W, height: CARD_H)
            .contentShape(Rectangle())
            // RN: RNGH pan with minDist 2 claims the touch before the page's ScrollView can.
            .highPriorityGesture(drag)

            if !hint.isEmpty {
                Text(hint)
                    .font(.ezer(FontFamily.regular, 12))
                    .foregroundStyle(theme.colors.mut)
                    .multilineTextAlignment(.center)
                    .padding(.top, 14)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: CONTAINER_H)
        .onChange(of: focused && !reduced, initial: true) { _, run in
            if interacted { return }
            if run {
                // Animated.loop restarts its sequence from the current value (0).
                floatStart = Date()
            } else {
                // Turning Reduce Motion on (or leaving the tab) mid-loop parks the card at rest.
                floatStart = nil
                floatFrozen = 0
            }
        }
        .onChange(of: touching) { _, t in
            // The gesture was cancelled without an end (RNGH CANCELLED): release, never a tap.
            if !t && dragActive { release(CGSize(width: tx, height: ty), cancelled: true) }
        }
    }

    /// The float loop: 0 → 1 over cardFloat/2, then 1 → 0, Easing.inOut(Easing.ease), forever.
    private func floatValue(at now: Date) -> Double {
        guard let s = floatStart else { return floatFrozen }
        let half = Motion.cardFloat / 2
        let e = max(0, now.timeIntervalSince(s) * 1000).truncatingRemainder(dividingBy: Motion.cardFloat)
        let ease = RNEasing.inOut(.ease)
        return e < half ? ease(e / half) : 1 - ease((e - half) / half)
    }

    /** Freeze the float at whatever frame it is on — no snap back to 0. */
    private func freezeFloat() {
        if interacted { return }
        interacted = true
        floatFrozen = floatValue(at: Date())
        floatStart = nil
    }

    // --- gesture ----------------------------------------------------------------
    // Snap each axis to the nearest half-turn with a slow soft settle.
    private func startSettle() {
        let snap = { (v: Double) in jsRound(v / 180) * 180 }
        let fromX = rx
        let fromY = ry
        rx = snap(rx)
        ry = snap(ry)
        settle = PayIn4Settle(fromX: fromX, fromY: fromY, toX: rx, toY: ry, start: Date())
        settleToken += 1
        let token = settleToken
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(Motion.cardSettle * 1_000_000))
            if settleToken == token { settle = nil }
        }
    }

    private var drag: some Gesture {
        DragGesture(minimumDistance: 0)
            .updating($touching) { _, state, _ in state = true }
            .onChanged { v in
                let t = v.translation
                if !dragActive {
                    // RNGH minDist 2: the turn (and the scroll lock) starts past 2px.
                    if hypot(t.width, t.height) < 2 { return }
                    dragActive = true
                    // ACTIVE while a settle is still running: stop it where it is and turn
                    // from that pose — left alone it would keep driving the layers under the finger.
                    if let s = settle {
                        let at = s.value(at: Date())
                        rx = at.x
                        ry = at.y
                        settle = nil
                        settleToken += 1
                    }
                    onDragChange?(true)
                }
                tx = t.width
                ty = t.height
            }
            .onEnded { v in release(v.translation, cancelled: false) }
    }

    private func release(_ t: CGSize, cancelled: Bool) {
        let wasActive = dragActive
        dragActive = false
        if wasActive { onDragChange?(false) }
        let tap = !cancelled && Double(hypot(t.width, t.height)) < Motion.cardTapSlop
        // A tap during a settle leaves it running.
        if tap && settle != nil {
            freezeFloat()
            onTap?()
            return
        }
        freezeFloat()
        // Fold the drag into the base in one batch, so base + translation is
        // unchanged on screen: no jump between the gesture and the settle.
        ry += Double(t.width) * Motion.cardRotatePerPx
        rx -= Double(t.height) * Motion.cardRotatePerPx
        tx = 0
        ty = 0
        if tap {
            onTap?()
            return
        }
        startSettle()
    }
}

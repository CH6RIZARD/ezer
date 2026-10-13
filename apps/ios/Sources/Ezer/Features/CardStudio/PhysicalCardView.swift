// Port of apps/mobile/app/screens/PhysicalCard.tsx
//
// =============================================================================
// EZER Redesign — Physical card designer
//
// Product flow is deliberately DESIGN FIRST, QUALIFY AFTER: the user draws the
// card they want, saves it, and only then lands on the approval choice
// (/screens/PhysicalCardApproval). Asking for eligibility before anyone has
// anything to be excited about is what kills conversion on card products, so
// this screen never mentions limits — only the required approval disclosure.
//
// LOCKED layout (Card Studio comp): the front carries only the chip, no
// wording — name, masked number, CVV and expiry live on the back, reached
// with the flip control. See CardFaces.swift / CardCanvas.swift (PayIn4).
//
// Ink is: gold foil, a custom mixer (hue + lightness), and 20 named pigments —
// the comp's tool row. Line weight is a continuous 1.5-11 drag instead of the
// comp's 5 fixed stops, which reads more like a real pen than snapping between
// presets (CLAUDE.md: don't restore the 5 stops or the "Nib" label).
//
// The saved payload is { finish, strokes: [{d,color,width}], updatedAt } and is
// persisted through Core/CardDesignStore.swift. Strokes are SVG path data in
// card-local 308x190 space. Autosave debounces 700ms after the last stroke, same
// as the comp's "Autosaved" indicator; the final CTA just flushes and moves on.
// =============================================================================

import SwiftUI
import UIKit

private let FINISHES: [(key: CardFinish, label: String)] = [
    (key: .amethyst, label: "Amethyst"),
    (key: .onyx, label: "Onyx"),
    (key: .rose, label: "Rose"),
    (key: .bone, label: "Bone"),
]

/**
 * Line weight is a continuous drag, not the comp's 5 fixed stops — sliding to
 * an in-between width reads as more of a real pen than snapping to one of
 * five presets does. Range and the default (5) still match the comp.
 */
private let WEIGHT_MIN: Double = 1.5
private let WEIGHT_MAX: Double = 11
private let DEFAULT_WEIGHT: Double = 5

/** Flat pigment swatch, same 20 named inks as the comp. */
private let INKS: [(key: String, hex: String)] = [
    ("black", "#111111"),
    ("white", "#FFFFFF"),
    ("grey", "#9CA3AF"),
    ("slate", "#4B5563"),
    ("red", "#E23D2E"),
    ("orange", "#F97316"),
    ("yellow", "#FACC15"),
    ("lime", "#A3E635"),
    ("green", "#22C55E"),
    ("teal", "#14B8A6"),
    ("cyan", "#06B6D4"),
    ("sky", "#38BDF8"),
    ("blue", "#2563EB"),
    ("indigo", "#4F46E5"),
    ("violet", "#8B5CF6"),
    ("pink", "#EC4899"),
    ("rose", "#F43F5E"),
    ("brown", "#92400E"),
    ("tan", "#D2A86A"),
    ("cream", "#F5E9C9"),
]

/**
 * Flat stand-in for the comp's shimmering SVG-gradient foil stroke. A true
 * gradient stroke needs a gradient wired through CardCanvas's path per-stroke,
 * which is a print-fidelity upgrade for later — this is the comp's own
 * documented fallback color, not a placeholder guess.
 */
private let FOIL_HEX = "#D6B36F"

/** The comp's 7-stop rainbow hue track, as real gradient stops — not a fallback. */
private let HUE_STOPS = ["#E23D2E", "#F97316", "#FACC15", "#22C55E", "#06B6D4", "#2563EB", "#8B5CF6", "#EC4899", "#E23D2E"]

/** hsl(h, 78%, l%) → hex, matching the comp's custom-ink formula exactly.
 *  Checked against the TS: (265,78,55) → #7d33e6, (0,78,15) → #440808, (123.4,78,50) → #1ce327. */
private func hslToHex(_ h: Double, _ s: Double, _ l: Double) -> String {
    let sf = s / 100
    let lf = l / 100
    func k(_ n: Double) -> Double { (n + h / 30).truncatingRemainder(dividingBy: 12) }
    let a = sf * min(lf, 1 - lf)
    func f(_ n: Double) -> Double { lf - a * max(-1, min(k(n) - 3, min(9 - k(n), 1))) }
    func toHex(_ x: Double) -> String {
        let s = String(Int(jsRound(x * 255)), radix: 16)
        return s.count < 2 ? "0" + s : s
    }
    return "#\(toHex(f(0)))\(toHex(f(8)))\(toHex(f(4)))"
}

/** Guard for restoring a persisted finish — storage is untyped at rest.
 *  RN `Object.prototype.hasOwnProperty.call(cardFinishes, v)`; returns the finish when `v` names one.
 *  Shared with PhysicalCardReviewView, which had its own copy (RN has one per file). */
func cardStudioIsFinish(_ v: String) -> CardFinish? {
    guard let f = CardFinish(rawValue: v), cardFinishes[f] != nil else { return nil }
    return f
}

// MARK: - Sliders

/// RN `sliderTrack` / `sliderFill` / `sliderThumb`: a 24-high pill track (r12, clipped) with a
/// 26x26 white ring thumb (border 3) centred on `pct` of the width. The thumb is absolutely
/// positioned in RN, so it is an overlay here and never changes the track's layout.
private struct CardStudioTrackShell<Fill: View, Thumb: View>: View {
    let pct: Double
    let onPct: (Double) -> Void
    let fill: Fill
    let thumb: Thumb

    // widthRef: the measured track width (RN onLayout), floored at 1.
    @State private var width: CGFloat = 1

    init(pct: Double, onPct: @escaping (Double) -> Void, @ViewBuilder fill: () -> Fill, @ViewBuilder thumb: () -> Thumb) {
        self.pct = pct
        self.onPct = onPct
        self.fill = fill()
        self.thumb = thumb()
    }

    var body: some View {
        fill
            .clipShape(rnRect(12))
            .frame(maxWidth: .infinity)
            .frame(height: 24)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = max(1, $0) }
            .overlay(alignment: .leading) {
                // left: pct%, marginLeft -13 (top 50%, marginTop -13 = vertically centred).
                thumb.offset(x: CGFloat(pct) * width - 13)
            }
            .contentShape(Rectangle())
            // PanResponder: claims on touch start, then every move (grant + move both report).
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { e in onPct(max(0, min(1, Double(e.location.x / width)))) }
            )
    }
}

/**
 * A horizontal drag track (hue or lightness). The thumb position is driven
 * straight off state; it is a discrete drag, not a spring.
 */
private struct CardStudioSliderTrack: View {
    let pct: Double
    let onPct: (Double) -> Void
    /** Solid track color — used for the lightness track (varies with hue). */
    var flatColor: String?
    /** Multi-stop track color — used for the hue rainbow. */
    var gradientColors: [String]?

    var body: some View {
        CardStudioTrackShell(pct: pct, onPct: onPct) {
            if let gradientColors {
                LinearGradient.rn(gradientColors, start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 0))
            } else {
                Color(css: flatColor ?? "transparent")
            }
        } thumb: {
            Color.clear
                .frame(width: 26, height: 26)
                .rnBox(bg: Color(css: "#FFFFFF"), radius: 13, border: Color(css: "#241A38"), borderWidth: 3)
        }
    }
}

/// `<Polygon points="10,19 90,10 90,19">` in a 100x24 viewBox stretched to the box
/// (preserveAspectRatio="none").
private struct CardStudioWedge: Shape {
    func path(in r: CGRect) -> Path {
        let sx = r.width / 100
        let sy = r.height / 24
        var p = Path()
        p.move(to: CGPoint(x: r.minX + 10 * sx, y: r.minY + 19 * sy))
        p.addLine(to: CGPoint(x: r.minX + 90 * sx, y: r.minY + 10 * sy))
        p.addLine(to: CGPoint(x: r.minX + 90 * sx, y: r.minY + 19 * sy))
        p.closeSubpath()
        return p
    }
}

/**
 * Continuous line weight, dragged along a thin→thick wedge rather than picked
 * from fixed stops. Built on the same pill-track shell as the ink mixer's
 * sliders so it reads as the same control family — the wedge sits inset inside
 * that pill, and the thumb is the same fixed-size ring as Hue and Lightness,
 * carrying an inner dot sized to the current weight instead of resizing the
 * whole thumb.
 */
private struct CardStudioLineWeightSlider: View {
    @Environment(ThemeStore.self) private var theme
    let value: Double
    /// RN prop `onChange` (renamed so it can't be confused with View.onChange(of:)).
    let onValue: (Double) -> Void

    var body: some View {
        let colors = theme.colors
        let pct = (value - WEIGHT_MIN) / (WEIGHT_MAX - WEIGHT_MIN)
        let dotSize = CGFloat(max(3, min(13, value * 1.3)))

        CardStudioTrackShell(pct: pct, onPct: { p in onValue(WEIGHT_MIN + p * (WEIGHT_MAX - WEIGHT_MIN)) }) {
            // sliderFill + card bg + 1px line border; the absoluteFill Svg sits inside the border.
            CardStudioWedge()
                .fill(colors.line2)
                .padding(1)
                .rnBox(bg: colors.card, radius: 12, border: colors.line, borderWidth: 1)
        } thumb: {
            Circle()
                .fill(colors.accInk)
                .frame(width: dotSize, height: dotSize)
                .frame(width: 26, height: 26)
                .rnBox(bg: Color(css: "#FFFFFF"), radius: 13, border: colors.accInk, borderWidth: 3)
        }
    }
}

// MARK: - Screen

struct PhysicalCardView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets

    @State private var finish: CardFinish = .amethyst
    @State private var strokes: [Stroke] = []
    // Undone strokes, newest last. Drawing anything new drops them: the redo
    // stack describes one linear history, and keeping it across a fresh stroke
    // would let redo resurrect artwork from a branch the user abandoned.
    @State private var undone: [Stroke] = []
    /// 'foil' | 'custom' | an INKS key.
    @State private var ink = "foil"
    @State private var customHue: Double = 265
    @State private var customLit: Double = 55
    @State private var lineWeight: Double = DEFAULT_WEIGHT
    @State private var flipped = false
    @State private var mixerOpen = false
    @State private var drawing = false
    @State private var loading = true
    @State private var saving = false
    @State private var justSaved = false
    @State private var autosaveTimer: Task<Void, Never>?

    private var activeColor: String {
        if ink == "foil" { return FOIL_HEX }
        if ink == "custom" { return hslToHex(customHue, 78, customLit) }
        return INKS.first(where: { $0.key == ink })?.hex ?? FOIL_HEX
    }

    var body: some View {
        let colors = theme.colors

        ScrollView(.vertical) {
            ScreenBody {
                VStack(alignment: .leading, spacing: 0) {
                    header(colors)

                    // --- Live preview / canvas ---------------------------------------
                    Group {
                        if loading {
                            RNActivityIndicator(color: colors.accInk)
                                .frame(width: CARD_W, height: 190)
                                .rnBox(bg: colors.card, radius: Radius.virtualCard, border: colors.line)
                        } else {
                            CardCanvas(
                                finish: finish,
                                strokes: strokes,
                                color: activeColor,
                                width: lineWeight,
                                flipped: flipped,
                                onStrokeEnd: handleStrokeEnd,
                                onDrawingChange: { drawing = $0 }
                            )
                        }
                    }
                    .frame(maxWidth: .infinity) // canvasWrap: alignItems center

                    historyRow(colors)

                    if flipped {
                        flippedNote(colors)
                    } else {
                        // --- Ink ------------------------------------------------------
                        SectionHeader("Ink").padding(.top, 22)
                        inkRow(colors)

                        // --- Line weight ----------------------------------------------
                        SectionHeader("Line weight").padding(.top, 18)
                        CardStudioLineWeightSlider(value: lineWeight, onValue: { lineWeight = $0 })

                        // --- Finish ---------------------------------------------------
                        SectionHeader("Base finish").padding(.top, 20)
                        finishRow(colors)
                    }

                    footer(colors)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.top, insets.top + 10)
            .padding(.horizontal, Layout.screenX)
            .padding(.bottom, Layout.contentBottom)
            .background(CardStudioNoBounce()) // bounces={false}
        }
        .scrollIndicators(.hidden)
        // Frozen while a stroke is in progress, so the vertical scroll can't take the pan halfway
        // through a stroke (RN: scrollEnabled={!drawing}).
        .scrollDisabled(drawing)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(colors.bg)
        .rnScreen()
        // --- Mix your own ink -------------------------------------------------------
        .rnModal(isPresented: mixerOpen, animationType: .slide, onRequestClose: { mixerOpen = false }) {
            CardStudioMixerSheet(
                customHue: customHue,
                customLit: customLit,
                onHue: { p in
                    customHue = p * 360
                    ink = "custom"
                },
                onLit: { p in
                    customLit = 15 + p * 70
                    ink = "custom"
                },
                onUse: {
                    ink = "custom"
                    mixerOpen = false
                },
                onClose: { mixerOpen = false }
            )
        }
        .onAppear(perform: restore)
        .onChange(of: strokes) { _, _ in scheduleAutosave() }
        .onChange(of: finish) { _, _ in scheduleAutosave() }
        .onChange(of: loading) { _, _ in scheduleAutosave() }
        .onDisappear { autosaveTimer?.cancel() }
    }

    // MARK: flipped note

    private func flippedNote(_ colors: ThemeColors) -> some View {
        Surface {
            BodyText(text:
                Text("The back is fixed for security printing — name, number, CVV and expiry live here. ")
                + Text("Flip to the front to draw.")
                    .font(.ezer(FontFamily.bold, 13)) // inherits Body's fontSize 13
                    .foregroundStyle(colors.ink)
            )
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14 + 1) // padding 14; RN's 1px border takes layout space
        }
        .padding(.top, 14)
    }

    // MARK: continue + disclosure

    @ViewBuilder
    private func footer(_ colors: ThemeColors) -> some View {
        // --- Continue -----------------------------------------------------------
        PressScale(scaleTo: 0.97, disabled: saving || strokes.isEmpty, action: go) {
            Text(saving ? "Saving…" : strokes.isEmpty ? "Draw something first" : "Continue")
                .font(.ezer(FontFamily.bold, 15))
                .tracking(0.3)
                .foregroundStyle(Color(css: "#FFFFFF"))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .rnBox(bg: colors.goldBg, radius: Radius.buttonLg)
                .opacity(saving ? 0.6 : strokes.isEmpty ? 0.5 : 1)
        }
        .padding(.top, 26)
        BodyText("Nothing is printed until you confirm at the end.")
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.top, 9)

        Surface {
            HStack(alignment: .top, spacing: 10) {
                Ionicon("information-circle-outline", size: 16, color: colors.mut)
                VStack(alignment: .leading, spacing: 0) {
                    Label("Before you go")
                    BodyText("Card issuance is subject to approval. We save your design now and walk you through approval next — nothing is printed until you confirm.")
                        .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(14 + 1) // padding 14; RN's 1px border takes layout space
        }
        .padding(.top, 14)
    }

    // MARK: header

    private func header(_ colors: ThemeColors) -> some View {
        HStack(alignment: .top, spacing: 0) {
            PressScale(scaleTo: 0.9, action: { router.back() }) {
                Ionicon("chevron-back", size: 18, color: colors.ink)
                    .frame(width: 38, height: 38)
                    .rnBox(bg: colors.card, radius: 19, border: colors.line)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("Design your card")
                    .typeStyle(TypeScale.screenTitle)
                    .foregroundStyle(colors.ink)
                BodyText(flipped
                    ? "The back is fixed — flip over to draw."
                    : "The front is all yours — details live on the back.")
                    .padding(.top, 1)
            }
            .padding(.leading, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Floats OUTSIDE the layout. As a flex sibling it took width from the
        // title, so the first stroke (label appears) and every Autosaved/Saved
        // swap (width changes) re-wrapped "Design your card" and shoved the
        // canvas up or down mid-drawing. (absolute, right 0, top -16)
        .overlay(alignment: .topTrailing) {
            if !strokes.isEmpty {
                Text(justSaved ? "Saved" : "Autosaved")
                    .typeStyle(TypeScale.labelSm)
                    .foregroundStyle(justSaved ? colors.success : colors.mut2)
                    .fixedSize()
                    .offset(y: -16)
                    .allowsHitTesting(false)
            }
        }
        .padding(.bottom, 14)
    }

    // MARK: undo / redo / clear / flip

    private func historyRow(_ colors: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 0) {
            HStack(alignment: .center, spacing: 7) {
                PressScale(scaleTo: 0.92, disabled: strokes.isEmpty, action: undo) {
                    Ionicon("arrow-undo-outline", size: 15, color: colors.ink)
                        .frame(width: 38, height: 36)
                        .rnBox(bg: colors.card, radius: Radius.buttonSm, border: colors.line2, borderWidth: 1.5)
                        .opacity(strokes.isEmpty ? 0.4 : 1)
                }
                PressScale(scaleTo: 0.92, disabled: undone.isEmpty, action: redo) {
                    Ionicon("arrow-redo-outline", size: 15, color: colors.ink)
                        .frame(width: 38, height: 36)
                        .rnBox(bg: colors.card, radius: Radius.buttonSm, border: colors.line2, borderWidth: 1.5)
                        .opacity(undone.isEmpty ? 0.4 : 1)
                }
                PressScale(scaleTo: 0.94, disabled: strokes.isEmpty, action: clearAll) {
                    HStack(alignment: .center, spacing: 6) {
                        Ionicon("trash-outline", size: 14, color: colors.red)
                        Text("Clear")
                            .font(.ezer(FontFamily.bold, 11.5))
                            .foregroundStyle(colors.red)
                    }
                    .padding(.horizontal, 13 + 1.5) // paddingHorizontal 13 + the 1.5 border RN lays out
                    .frame(height: 36)
                    .rnBox(bg: colors.card, radius: Radius.buttonSm, border: colors.line2, borderWidth: 1.5)
                    .opacity(strokes.isEmpty ? 0.4 : 1)
                }
            }

            Spacer(minLength: 0)

            PressScale(scaleTo: 0.92, action: { flipped.toggle() }) {
                Text(flipped ? "Show front" : "See the back")
                    .font(.ezer(FontFamily.bold, 11.5))
                    .foregroundStyle(colors.bg)
                    .padding(.horizontal, 14)
                    .frame(height: 36)
                    .rnBox(bg: colors.ink, radius: Radius.buttonSm)
            }
        }
        .padding(.top, 14)
    }

    // MARK: ink

    private func inkRow(_ colors: ThemeColors) -> some View {
        ScrollView(.horizontal) {
            HStack(alignment: .center, spacing: 8) {
                PressScale(scaleTo: 0.94, action: { ink = "foil" }) {
                    Text("Gold foil")
                        .font(.ezer(FontFamily.bold, 10.5))
                        .foregroundStyle(Color(css: "#3E2C08"))
                        .padding(.horizontal, 13 + 2.5) // + the 2.5 border RN lays out
                        .frame(height: 34)
                        .rnBox(bg: Color(css: "#C49A4E"), radius: 17,
                               border: ink == "foil" ? colors.ink : Color(css: "transparent"), borderWidth: 2.5)
                }

                PressScale(scaleTo: 0.94, action: { mixerOpen = true }) {
                    HStack(alignment: .center, spacing: 7) {
                        Circle() // mixSwatch: 15x15, borderRadius 8
                            .fill(Color(css: "#8B5CF6"))
                            .frame(width: 15, height: 15)
                        Text("Mix")
                            .font(.ezer(FontFamily.bold, 11.5))
                            .foregroundStyle(colors.ink)
                    }
                    .padding(.horizontal, 13 + 2) // + the 2 border RN lays out
                    .frame(height: 34)
                    .rnBox(bg: colors.card, radius: 17, border: ink == "custom" ? colors.ink : colors.line, borderWidth: 2)
                }

                ForEach(INKS.indices, id: \.self) { idx in
                    let i = INKS[idx]
                    let active = ink == i.key
                    let needsRing = i.hex == "#FFFFFF" || i.hex == "#F5E9C9"
                    let borderWidth: CGFloat = active ? 2.5 : needsRing ? 1.5 : 0
                    PressScale(scaleTo: 0.88, action: { ink = i.key }) {
                        Color.clear
                            .frame(width: 34, height: 34)
                            .rnBox(
                                bg: Color(css: i.hex),
                                radius: 17,
                                border: borderWidth > 0 ? (active ? colors.ink : colors.line2) : nil,
                                borderWidth: borderWidth
                            )
                    }
                }
            }
            .padding(.top, 10)
            .padding(.trailing, 4)
        }
        .scrollIndicators(.hidden)
        .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: finish

    private func finishRow(_ colors: ThemeColors) -> some View {
        HStack(alignment: .center, spacing: 8) {
            ForEach(FINISHES.indices, id: \.self) { idx in
                let f = FINISHES[idx]
                let active = f.key == finish
                PressScale(scaleTo: 0.95, action: { finish = f.key }) {
                    VStack(alignment: .center, spacing: 8) {
                        rnRect(5)
                            .fill(Color(css: cardFinishes[f.key]?[1] ?? "transparent"))
                            .frame(width: 34, height: 22)
                        Text(f.label)
                            .font(.ezer(FontFamily.semibold, 11.5))
                            .foregroundStyle(active ? colors.ink : colors.mut)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, minHeight: 74)
                    .rnBox(radius: Radius.chip, border: active ? colors.accInk : colors.line, borderWidth: active ? 2 : 1)
                }
                .frame(maxWidth: .infinity) // finishBtn: flex 1
            }
        }
        .padding(.top, 10)
    }

    // MARK: actions

    // Restore the last saved design so reopening the screen never loses artwork.
    // Runs once per mount (loading starts true and is only cleared here).
    private func restore() {
        guard loading else { return }
        // loadCardDesign never throws: a failed restore is simply a blank card.
        if let design = CardDesignStore.loadCardDesign() {
            if let f = cardStudioIsFinish(design.finish) { finish = f }
            strokes = design.strokes
        }
        loading = false
    }

    // Autosave, debounced — mirrors the comp's "Autosaved" indicator. Local
    // write happens on every call inside saveCardDesign; the network POST is
    // best-effort, so firing this on a timer rather than per-stroke is purely
    // to avoid hammering the API while someone is doodling fast.
    // RN: an effect on [strokes, finish, loading] whose cleanup clears the timer.
    private func scheduleAutosave() {
        autosaveTimer?.cancel()
        autosaveTimer = nil
        if loading || strokes.isEmpty { return }
        let f = finish.rawValue
        let s = strokes
        autosaveTimer = Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            if Task.isCancelled { return }
            // The timer fired: like RN's setTimeout, nothing cancels the save itself.
            Task {
                // saveCardDesign never throws (RN's .catch was "best-effort — the next
                // stroke or the final CTA retries"), so there is no failure branch.
                await CardDesignStore.saveCardDesign(CardDesign(finish: f, strokes: s, updatedAt: toISOString(Date())))
                justSaved = true
                try? await Task.sleep(nanoseconds: 1_600_000_000)
                justSaved = false
            }
        }
    }

    private func handleStrokeEnd(_ s: Stroke) {
        strokes.append(s)
        undone = []
    }

    private func undo() {
        guard let last = strokes.last else { return }
        undone.append(last)
        strokes.removeLast()
    }

    private func redo() {
        guard let last = undone.last else { return }
        strokes.append(last)
        undone.removeLast()
    }

    // Clear is undoable in one step rather than being a point of no return —
    // the whole drawing goes onto the redo stack, so a mis-tap costs nothing.
    private func clearAll() {
        if strokes.isEmpty { return }
        undone = strokes.reversed()
        strokes = []
    }

    private func go() {
        if saving || strokes.isEmpty { return }
        saving = true
        let design = CardDesign(finish: finish.rawValue, strokes: strokes, updatedAt: toISOString(Date()))
        Task {
            // saveCardDesign never throws (local write first, POST best-effort), so RN's catch —
            // "keep the user on the screen with their artwork intact" — cannot trigger here.
            await CardDesignStore.saveCardDesign(design)
            // Already been through approval once (this is a re-edit reached from
            // PhysicalCardReview's "Edit design") → go straight back to the review
            // screen instead of re-running the connect-bank-or-skip choice on
            // someone who already made it. saveCardDesign carries the outcome
            // forward on its own, so nothing further needs writing here.
            //
            // First time through also replaces, not pushes: Approval itself
            // replaces to Review once the user picks connect-bank or "Skip for
            // now", but that only removes Approval from the stack — this designer
            // screen stayed underneath it. Back from the finished review then
            // resurrected a blank canvas the user was done with, instead of
            // exiting, and took a second Back press to actually leave.
            //
            // Someone already assessed through the Pay in 4 Spending Power sheet
            // has a bank-based outcome under its own key, never attached to a design
            // (there wasn't one yet). Carry it onto the design now rather than
            // asking them to connect a bank all over again. Only bank-assessed
            // outcomes: a sheet waitlist join still gets offered the bank option.
            var access = CardDesignStore.getCardAccessOutcome()
            if access == nil {
                if let sp = await CardDesignStore.loadSpendingPowerOutcome(), sp.status == .approved || sp.status == .suspended {
                    CardDesignStore.saveCardAccessOutcome(sp)
                    access = sp
                }
            }
            router.replace(access != nil ? "/screens/PhysicalCardReview" : "/screens/PhysicalCardApproval")
        }
    }
}

// MARK: - Mix your own ink (Modal, transparent, animationType="slide")

private struct CardStudioMixerSheet: View {
    @Environment(ThemeStore.self) private var theme
    let customHue: Double
    let customLit: Double
    let onHue: (Double) -> Void
    let onLit: (Double) -> Void
    let onUse: () -> Void
    let onClose: () -> Void

    var body: some View {
        let colors = theme.colors

        ZStack(alignment: .bottom) {
            // Pressable absoluteFill → scrim; tap closes.
            colors.scrim
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)

            // sheetWrap: flex 1, justifyContent flex-end, pointerEvents box-none
            VStack(alignment: .leading, spacing: 0) {
                rnRect(2)
                    .fill(colors.line2)
                    .frame(width: 40, height: 4)
                    .frame(maxWidth: .infinity) // alignSelf center
                    .padding(.bottom, 14)

                HStack(alignment: .center, spacing: 12) {
                    Circle()
                        .fill(Color(css: hslToHex(customHue, 78, customLit)))
                        .frame(width: 44, height: 44)
                    Text("Mix your own ink")
                        .typeStyle(TypeScale.cardTitle)
                        .foregroundStyle(colors.ink)
                }

                Label("Hue")
                    .padding(.top, 16)
                    .padding(.bottom, 6)
                CardStudioSliderTrack(pct: customHue / 360, onPct: onHue, gradientColors: HUE_STOPS)

                Label("Lightness")
                    .padding(.top, 16)
                    .padding(.bottom, 6)
                CardStudioSliderTrack(pct: (customLit - 15) / 70, onPct: onLit, flatColor: hslToHex(customHue, 78, 50))

                PressScale(scaleTo: 0.97, action: onUse) {
                    Text("Use this ink")
                        .font(.ezer(FontFamily.bold, 15))
                        .tracking(0.3)
                        .foregroundStyle(Color(css: "#FFFFFF"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .rnBox(bg: colors.accent, radius: Radius.buttonLg)
                }
                .padding(.top, 22)
            }
            .padding(.horizontal, 20)
            .padding(.top, 12)
            .padding(.bottom, 34)
            .frame(maxWidth: .infinity)
            .background(rnRect(topLeading: 26, topTrailing: 26).fill(colors.bg))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }
}

// MARK: - bounces={false}

/// RN ScrollView `bounces={false}`: SwiftUI has no switch for it, so this probe (placed in the
/// scroll content's background) finds the hosting UIScrollView and turns bouncing off.
/// Used by all three Card Studio screens. (Same probe as PayIn4View's private PayIn4NoBounce;
/// Foundation has no shared one.)
struct CardStudioNoBounce: UIViewRepresentable {
    func makeUIView(context: Context) -> CardStudioNoBounceProbe {
        let v = CardStudioNoBounceProbe()
        v.isUserInteractionEnabled = false
        v.backgroundColor = .clear
        return v
    }

    func updateUIView(_ uiView: CardStudioNoBounceProbe, context: Context) { uiView.apply() }
}

final class CardStudioNoBounceProbe: UIView {
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

// Port of apps/mobile/components/DoveReveal.tsx
//
// The lock screen's dove mark — the owner's pick from the Blender variants (path A, Cinzel,
// Oct 2026): a rendered dove swoops under the wordmark and lands on the top right of the R while
// EZER fades in. Both are images so they line up with the approved render exactly: a white Cinzel
// wordmark tinted per theme (`ink`), and a sprite sheet of the flight. Frame data in DoveFrames.swift.
// On cream (LIGHT mode only) the white dove gets a faint `gold` edge: its own silhouette tinted and
// drawn at 8 offsets behind it (CLAUDE.md: don't drop it as "extra draws").
//
//   DoveMark(width: 96)                                     // the word + perched dove (dove ABOVE the box, outside layout)
//   DoveMark(width: w, perched: false, ink: ThemeColors.dark.ink)   // `ink` overrides the theme (onboarding)
//   DoveFlight(width: w, duration: 900, play: ready)        // hidden until `play`, then plays once
//   DoveFlight(width: w, duration: 900, play: ready, edge: .some(nil))   // RN edge={null}: no gold edge
//   DoveP1(width: w, cam: c, exit: e, fade: f) { ... }    // after the passcode: P1 (open, loop, exit into the camera)
// The tabs' header EZER is Primitives' TabMark (one size, one place); there is no per-title mark.

import SwiftUI
import UIKit

private let LAST = DoveFrames.XY.count - 1

// Offsets in points, so the edge is the same at any size.
private let EDGE: [(CGFloat, CGFloat)] = [(1, 0), (-1, 0), (0, 1), (0, -1), (0.7, 0.7), (-0.7, 0.7), (0.7, -0.7), (-0.7, -0.7)]
private let EDGE_DP: CGFloat = 0.9
private let EDGE_OPACITY: Double = 0.6

/// The dove images. RN's <Image onLoad> fires once a bitmap is decoded, and LockGate holds the intro
/// for it; here `load` decodes off the main thread (byPreparingForDisplay) and swaps the decoded copy
/// in (observable, so views drawing it pick it up), so the first frame that shows it doesn't stall.
@Observable
@MainActor
final class DoveImages {
    static let shared = DoveImages()
    enum Name: Hashable { case sheet, perch, wordmark, hover }

    private(set) var images: [Name: UIImage] = [:]
    @ObservationIgnored private var decoded: Set<Name> = []

    private init() {
        images[.sheet] = EzerImages.ui("dove-sheet")
        images[.perch] = EzerImages.ui("dove-perch")
        images[.wordmark] = EzerImages.ui("wordmark-cinzel")
        // UIImage(named:) only finds PNG/JPEG names; ImageIO decodes WebP (iOS 14+).
        images[.hover] = Bundle.module.url(forResource: "dove-hover", withExtension: "webp")
            .flatMap { UIImage(contentsOfFile: $0.path) }
    }

    subscript(_ n: Name) -> UIImage? { images[n] }

    /// True once `n` is decoded; false when it never loaded (RN's onLoad never fires then).
    @discardableResult
    func load(_ n: Name) async -> Bool {
        if decoded.contains(n) { return true }
        guard let img = images[n] else { return false }
        let ready = await img.byPreparingForDisplay() ?? img
        images[n] = ready
        decoded.insert(n)
        return true
    }
}

/// RN <Image> with explicit size and the default resizeMode 'cover' (fills, crops the overflow).
private struct CoverImage: View {
    let image: UIImage?
    let width: CGFloat
    let height: CGFloat
    var tint: Color?
    /// RN resizeMode 'stretch': the image fills the box exactly. Sprite sheets need it: a sheet's
    /// pixel cell and its point cell differ in aspect by up to 0.5% (P1's loop: 204x175 px vs
    /// 370x319 word units), and 'cover' then crops the sheet centrally, shifting the outer columns'
    /// cells by up to ~5% of a cell, enough for a neighbouring frame's wing to show at the window's
    /// edge.
    var stretch = false

    var body: some View {
        if let image {
            Group {
                if let tint {
                    Image(uiImage: image).renderingMode(.template).resizable().foregroundStyle(tint)
                } else {
                    Image(uiImage: image).renderingMode(.original).resizable()
                }
            }
            // An explicit ratio equal to the box's makes the image fill it exactly (stretch).
            .aspectRatio(stretch && height > 0 ? width / height : nil, contentMode: .fill)
            .frame(width: width, height: height)
            .clipped()
        } else {
            Color.clear.frame(width: width, height: height)
        }
    }
}

/** The dove's edge colour for the current theme, or nil for none. */
@MainActor
struct EdgeReader {
    static func edge(_ theme: ThemeStore) -> Color? { theme.mode == .light ? theme.colors.gold : nil }
}

private struct Perched: View {
    @Environment(ThemeStore.self) private var theme
    let k: CGFloat
    /// RN `edge?: string | null`: nil (undefined) = the theme's edge, `.some(nil)` = none.
    var edge: Color?? = nil

    var body: some View {
        let edge = self.edge ?? EdgeReader.edge(theme)
        let p = DoveFrames.PERCH
        let img = DoveImages.shared[.perch]
        ZStack(alignment: .topLeading) {
            if let edge {
                ForEach(0..<EDGE.count, id: \.self) { i in
                    CoverImage(image: img, width: p.w * k, height: p.h * k, tint: edge)
                        .opacity(EDGE_OPACITY)
                        .offset(x: EDGE[i].0 * EDGE_DP, y: EDGE[i].1 * EDGE_DP)
                }
            }
            CoverImage(image: img, width: p.w * k, height: p.h * k)
        }
        // RN needsOffscreenAlphaCompositing: when a parent fades (the keypad, the lift), the dove and
        // its 8 gold copies fade as ONE image; otherwise the gold shows through the white dove as a
        // blob. Always on: with no edge there is one image and grouping changes nothing.
        .compositingGroup()
        .offset(x: p.x * k, y: p.y * k)
    }
}

/// One cell of a sprite sheet seen through a clipped window: the sheet slides inside it. Cells carry
/// a 2px transparent margin, so the edge copies stay inside them. Sizes are already scaled.
struct SpriteCell: View {
    let image: UIImage?
    let cellW: CGFloat
    let cellH: CGFloat
    let cols: Int
    let rows: Int
    let i: Int
    let edge: Color?

    var body: some View {
        let sheetW = cellW * CGFloat(cols)
        let sheetH = cellH * CGFloat(rows)
        let sx = -CGFloat(i % cols) * cellW
        let sy = -CGFloat(i / cols) * cellH
        ZStack(alignment: .topLeading) {
            if let edge {
                ForEach(0..<EDGE.count, id: \.self) { e in
                    CoverImage(image: image, width: sheetW, height: sheetH, tint: edge, stretch: true)
                        .offset(x: sx, y: sy)
                        .offset(x: EDGE[e].0 * EDGE_DP, y: EDGE[e].1 * EDGE_DP)
                        .opacity(EDGE_OPACITY)
                }
            }
            CoverImage(image: image, width: sheetW, height: sheetH, stretch: true)
                .offset(x: sx, y: sy)
        }
        .frame(width: cellW, height: cellH, alignment: .topLeading)
        .clipped()
        // RN needsOffscreenAlphaCompositing on DoveFlight's/DoveHover's window (see Perched).
        .compositingGroup()
    }
}

/** The wordmark with the dove on the R. `width` is the wordmark's width in points; the dove sits
 *  above that box (0.36 of the width), outside its layout. `ink` overrides the theme's word colour
 *  (onboarding is always dark). */
struct DoveMark: View {
    @Environment(ThemeStore.self) private var theme
    let width: CGFloat
    var perched = true
    var ink: Color?

    init(width: CGFloat, perched: Bool = true, ink: Color? = nil) {
        self.width = width
        self.perched = perched
        self.ink = ink
    }

    var body: some View {
        let k = width / DoveFrames.WORD.w
        let h = DoveFrames.WORD.h * k
        CoverImage(image: DoveImages.shared[.wordmark], width: width, height: h, tint: ink ?? theme.colors.ink)
            .overlay(alignment: .topLeading) {
                if perched { Perched(k: k) }
            }
            .frame(width: width, height: h)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isImage)
            .accessibilityLabel("EZER")
    }
}

/**
 * The flight. Plays once over `duration` ms (linear over the 60 frames) when `play` turns true,
 * ending on the same pose DoveMark draws; hidden until then. The wordmark's own opacity is the
 * caller's (LockGate's fade). Reduced motion: no travel, the dove is simply there.
 */
struct DoveFlight: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduced
    let width: CGFloat
    let duration: Double
    var play: Bool
    /// RN `edge?: string | null`: nil = the theme's edge; `.some(nil)` = no gold edge whatever the
    /// theme (onboarding's fixed dark design).
    var edge: Color??

    init(width: CGFloat, duration: Double, play: Bool = true, edge: Color?? = nil) {
        self.width = width
        self.duration = duration
        self.play = play
        self.edge = edge
    }

    @State private var start: Date?
    @State private var finished = false

    var body: some View {
        let k = width / DoveFrames.WORD.w
        let edge = self.edge ?? EdgeReader.edge(theme)
        if reduced {
            Perched(k: k, edge: .some(edge))
        } else {
            TimelineView(.animation(paused: start == nil || finished)) { tl in
                let i = index(at: tl.date)
                SpriteCell(image: DoveImages.shared[.sheet], cellW: DoveFrames.CELL.w * k, cellH: DoveFrames.CELL.h * k,
                           cols: DoveFrames.CELL.cols, rows: DoveFrames.CELL.rows, i: i, edge: edge)
                    // The cell window moves along the path.
                    .offset(x: DoveFrames.XY[i].0 * k, y: DoveFrames.XY[i].1 * k)
            }
            .opacity(play ? 1 : 0)
            .allowsHitTesting(false)
            .onChange(of: play, initial: true) { _, p in
                guard p, start == nil else { return }
                start = Date()
                Task {
                    try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000))
                    finished = true
                }
            }
        }
    }

    private func index(at now: Date) -> Int {
        guard let start else { return 0 }
        if finished { return LAST }
        let f = min(1, max(0, now.timeIntervalSince(start) * 1000 / duration)) * Double(LAST)
        return min(LAST, Int(jsRound(f)))
    }
}

/**
 * The wait after the passcode: the dove lifts off the R and flaps in place above it (the "hover"
 * loader render), instead of the still perched mark. Loops while mounted (LockGate mounts it only
 * for that phase, so the loop stops with it). The perched dove shows until the sheet has decoded,
 * so the R is never bare. Reduced motion: just the perched dove.
 */
struct DoveHover: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduced
    let width: CGFloat

    @State private var loaded = false
    @State private var start = Date()

    var body: some View {
        let k = width / DoveFrames.WORD.w
        let H = DoveFrames.HOVER
        if reduced {
            Perched(k: k)
        } else {
            ZStack(alignment: .topLeading) {
                if !loaded { Perched(k: k) }
                TimelineView(.animation(paused: !loaded)) { tl in
                    SpriteCell(image: DoveImages.shared[.hover], cellW: H.w * k, cellH: H.h * k,
                               cols: H.cols, rows: H.rows, i: index(at: tl.date), edge: EdgeReader.edge(theme))
                }
                .opacity(loaded ? 1 : 0)
                .offset(x: H.x * k, y: H.y * k)
            }
            .allowsHitTesting(false)
            .task {
                guard await DoveImages.shared.load(.hover) else { return }
                start = Date()
                loaded = true
            }
        }
    }

    /// withRepeat(withTiming(n, linear over n/fps s), -1): frame floor(f) % n.
    private func index(at now: Date) -> Int {
        let H = DoveFrames.HOVER
        return Int(max(0, now.timeIntervalSince(start)) * H.fps) % H.n
    }
}

// MARK: - P1

// The wait after the passcode (owner's pick, Oct 2026: P1; frames in DoveP1Frames.swift, sheets
// dove-p1-{open,loop,exit}.webp, both from E:\ezer-dove\loaders\work\export_app_doves.py).
// open: takes off from EXACTLY the perched pose on the R; loop: circles the word while LockGate
// waits; exit: climbs fully up into the camera as Home appears. LockGate decides when (at least
// FADE_MS * 2, and auth/data ready). The exit starts from the CURRENT loop frame, never waiting for
// the lap: its path is (1 - c) * (x, y) + c * cam with (x, y) the loop position the dove is at, and
// over the first EXIT_BLEND frames position, scale and sprite blend from the still-running loop
// into the exit's own climb.

private let EXIT_BLEND: Double = 6
let P1_SHEETS = ["dove-p1-open", "dove-p1-loop", "dove-p1-exit"]
private let P1_CLIPS = [DoveP1Frames.open_, DoveP1Frames.loop, DoveP1Frames.exit]

/// P1's clock (RN: shared values advanced by a frame callback). ph: 0 open, 1 loop, 2 exit, 3 done.
@MainActor
private final class P1Clock {
    var ph = 0
    var t: Double = 0
    var L = 0
    var last: Date?
    var go = false
    var notified = false

    /// Advances to `now`; true exactly once, when the exit has finished.
    func tick(_ now: Date) -> Bool {
        if ph == 3 { return false }
        let dt = last.map { min(0.1, max(0, now.timeIntervalSince($0))) } ?? 0
        last = now
        var x = t + dt * DoveP1Frames.fps
        let no = Double(DoveP1Frames.open_.n), nl = Double(DoveP1Frames.loop.n), ne = Double(DoveP1Frames.exit.n)
        if ph == 0 && x >= no { ph = 1; x -= no }
        if ph == 1 {
            if go {
                // straight into the exit from this frame, no waiting for the lap
                L = Int(x) % DoveP1Frames.loop.n
                ph = 2
                x -= floor(x)
            } else if x >= nl { x -= nl }
        }
        var finished = false
        if ph == 2 && x >= ne {
            ph = 3
            x = ne - 0.001
            if !notified { notified = true; finished = true }
        }
        t = x
        return finished
    }

    struct Pose {
        var x, y, s: Double
        var i: [Int]
        var a: [Double]
    }

    func pose(cam: CGPoint, fade: Bool) -> Pose {
        let i = Int(t)
        if ph == 0 {
            let io = min(i, DoveP1Frames.open_.n - 1), f = DoveP1Frames.open_.f
            return Pose(x: f[io * 5], y: f[io * 5 + 1], s: f[io * 5 + 2], i: [io, 0, 0], a: [1, 0, 0])
        }
        let nl = DoveP1Frames.loop.n
        let lf = DoveP1Frames.loop.f
        if ph == 1 {
            let il = i % nl
            return Pose(x: lf[il * 5], y: lf[il * 5 + 1], s: lf[il * 5 + 2], i: [0, il, 0], a: [0, 1, 0])
        }
        let ie = min(i, DoveP1Frames.exit.n - 1)
        let il = (L + ie) % nl
        let ef = DoveP1Frames.exit.f
        let b0 = min(1, t / EXIT_BLEND)
        let b = b0 * b0 * (3 - 2 * b0)
        // the exit's own climb, carried over to start from loop frame L
        let ex = lf[L * 5] + ef[ie * 5] - ef[0]
        let ey = lf[L * 5 + 1] + ef[ie * 5 + 1] - ef[1]
        let es = lf[L * 5 + 2] * ef[ie * 5 + 2] / ef[2]
        let x = lf[il * 5] + (ex - lf[il * 5]) * b
        let y = lf[il * 5 + 1] + (ey - lf[il * 5 + 1]) * b
        let c = ef[ie * 5 + 3]
        let o = ph == 3 ? 0 : fade ? ef[ie * 5 + 4] : 1
        return Pose(x: (1 - c) * x + c * Double(cam.x), y: (1 - c) * y + c * Double(cam.y),
                    s: lf[il * 5 + 2] + (es - lf[il * 5 + 2]) * b, i: [0, il, ie], a: [0, (1 - b) * o, b * o])
    }
}

/**
 * The after-passcode dove. Draw it as an overlay of the wordmark (DoveMark's coordinates). `cam`:
 * the camera point in word units. `exit` true: fly into the camera now; `onExited` once it is in
 * (at once with Reduce Motion or a sheet not decoded by then: the dove simply stays perched).
 * `fade`: fade out at the camera (phones whose camera hides nothing).
 * Perched until the open sheet is decoded (LockGate decodes all three while the keypad is up), then
 * it takes off: open's first frame IS the perched pose, so a late take-off is not a jump.
 */
struct DoveP1: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduced
    let width: CGFloat
    let cam: CGPoint
    let exit: Bool
    let fade: Bool
    let onExited: () -> Void

    @State private var loaded = false
    @State private var clock = P1Clock()

    var body: some View {
        let k = width / DoveFrames.WORD.w
        let flying = !reduced && loaded
        ZStack(alignment: .topLeading) {
            if !flying { Perched(k: k) }
            if flying {
                TimelineView(.animation(paused: clock.ph == 3)) { tl in
                    let done = clock.tick(tl.date)
                    let q = clock.pose(cam: cam, fade: fade)
                    ZStack(alignment: .topLeading) {
                        ForEach(0..<3, id: \.self) { w in
                            window(w, q: q, k: k)
                        }
                    }
                    .onChange(of: done, initial: true) { _, d in if d { onExited() } }
                }
            }
        }
        .allowsHitTesting(false)
        .task {
            guard !reduced else { return }
            var ok = true
            for n in P1_SHEETS { ok = await DoveSheets.prepare(n) && ok }
            if ok && !exit { loaded = true }
        }
        .onChange(of: exit, initial: true) { _, e in
            clock.go = e
            if e && !flying { onExited() }
        }
    }

    private func window(_ w: Int, q: P1Clock.Pose, k: CGFloat) -> some View {
        let c = P1_CLIPS[w]
        let W0 = DoveP1Frames.w * k
        let H0 = DoveP1Frames.h * k
        // The window sits at the word's origin and scales about its centre: this puts the cell's
        // pivot on (x, y).
        let dx = DoveP1Frames.px * k - W0 / 2
        let dy = DoveP1Frames.py * k - H0 / 2
        let s = CGFloat(q.s)
        return SpriteCell(image: DoveSheets.image(P1_SHEETS[w]), cellW: W0, cellH: H0, cols: c.cols, rows: c.rows,
                          i: q.i[w], edge: EdgeReader.edge(theme))
            .scaleEffect(s)
            .offset(x: CGFloat(q.x) * k - W0 / 2 - s * dx, y: CGFloat(q.y) * k - H0 / 2 - s * dy)
            .opacity(q.a[w])
    }
}

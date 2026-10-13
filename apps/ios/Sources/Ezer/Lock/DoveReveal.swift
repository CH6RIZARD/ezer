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
//   DoveHover(width: w)                                     // after the passcode: the dove flaps above the R
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

    var body: some View {
        if let image {
            Group {
                if let tint {
                    Image(uiImage: image).renderingMode(.template).resizable().foregroundStyle(tint)
                } else {
                    Image(uiImage: image).renderingMode(.original).resizable()
                }
            }
            .aspectRatio(contentMode: .fill)
            .frame(width: width, height: height)
            .clipped()
        } else {
            Color.clear.frame(width: width, height: height)
        }
    }
}

/** The dove's edge colour for the current theme, or nil for none. */
@MainActor
private struct EdgeReader {
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
private struct SpriteCell: View {
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
                    CoverImage(image: image, width: sheetW, height: sheetH, tint: edge)
                        .offset(x: sx, y: sy)
                        .offset(x: EDGE[e].0 * EDGE_DP, y: EDGE[e].1 * EDGE_DP)
                        .opacity(EDGE_OPACITY)
                }
            }
            CoverImage(image: image, width: sheetW, height: sheetH)
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

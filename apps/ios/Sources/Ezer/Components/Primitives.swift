// Port of apps/mobile/components/redesign/Primitives.tsx
//
// Small building blocks every redesigned screen uses, so the handoff's spacing, radii, press
// feedback and type scale live in ONE place.
//
//   useReduceMotion()  -> @Environment(\.accessibilityReduceMotion)
//   Label("UPCOMING")                       // typeScale.label, `mut`
//   Serif(formatCents(x), color: c.red)     // typeScale.statValue, `ink`
//   SectionHeader("Where it goes")          // 16.5 bold, `ink`
//   BodyText("…")                           // RN `Body` (renamed: `Body` is View's associatedtype)
//   ScreenBody { … }.padding(…).tabMark()   // RN <TabMark /> after ScreenBody: the tabs' EZER, top right
//   Surface { content.padding(16) }         // card bg, line border 1, r18 (padding goes INSIDE)
//   PressScale(action: {}) { tile }         // .96 over 150ms easeOut; layout frames go OUTSIDE
//   Chip(label: "This month", active: true) { … }
//   PulseRing(radius: 18)                   // overlay on the tile it marks
//   ScreenBody { … }                        // fade + rise 14 over 350ms easeOut, once
//
// Re-exports: radius/typeScale/layout/motion are the Theme enums Radius/TypeScale/Layout/Motion.

import SwiftUI

// MARK: - Text helpers

/// RN text helpers accept `numberOfLines` and `adjustsFontSizeToFit`; `size` overrides fontSize
/// (an RN `style={{ fontSize }}` override, which an outer .font() could not do in SwiftUI).
private struct TextHelper: View {
    let text: Text
    let style: TypeStyle
    let color: Color
    let lines: Int?
    let shrink: Bool

    var body: some View {
        text
            .typeStyle(style)
            .foregroundStyle(color)
            .lineLimit(lines)
            .minimumScaleFactor(shrink ? 0.5 : 1)
    }
}

/** UPPERCASE 10–11px label with tracking (typeScale.label), `mut` by default. */
struct Label: View {
    @Environment(ThemeStore.self) private var theme
    let text: Text
    var color: Color?
    var size: CGFloat?
    var lines: Int?
    var shrink = false

    init(_ s: String, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        text = Text(s); self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }
    init(text: Text, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        self.text = text; self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }

    var body: some View {
        let s = size.map { TypeScale.label.size($0) } ?? TypeScale.label
        TextHelper(text: text, style: s, color: color ?? theme.colors.mut, lines: lines, shrink: shrink)
    }
}

/** Instrument Serif Italic display numeral (typeScale.statValue), `ink` by default. */
struct Serif: View {
    @Environment(ThemeStore.self) private var theme
    let text: Text
    var color: Color?
    var size: CGFloat?
    var lines: Int?
    var shrink = false

    init(_ s: String, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        text = Text(s); self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }
    init(text: Text, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        self.text = text; self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }

    var body: some View {
        let s = size.map { TypeScale.statValue.size($0) } ?? TypeScale.statValue
        TextHelper(text: text, style: s, color: color ?? theme.colors.ink, lines: lines, shrink: shrink)
    }
}

/** Section header, 16–17px/700, `ink` by default. */
struct SectionHeader: View {
    @Environment(ThemeStore.self) private var theme
    let text: Text
    var color: Color?
    var size: CGFloat?
    var lines: Int?
    var shrink = false

    init(_ s: String, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        text = Text(s); self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }
    init(text: Text, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        self.text = text; self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }

    var body: some View {
        let s = size.map { TypeScale.sectionHeader.size($0) } ?? TypeScale.sectionHeader
        TextHelper(text: text, style: s, color: color ?? theme.colors.ink, lines: lines, shrink: shrink)
    }
}

/** Body copy, 12–13px (typeScale.body), `mut` by default. RN name: `Body`. */
struct BodyText: View {
    @Environment(ThemeStore.self) private var theme
    let text: Text
    var color: Color?
    var size: CGFloat?
    var lines: Int?
    var shrink = false

    init(_ s: String, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        text = Text(s); self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }
    init(text: Text, color: Color? = nil, size: CGFloat? = nil, lines: Int? = nil, shrink: Bool = false) {
        self.text = text; self.color = color; self.size = size; self.lines = lines; self.shrink = shrink
    }

    var body: some View {
        let s = size.map { TypeScale.body.size($0) } ?? TypeScale.body
        TextHelper(text: text, style: s, color: color ?? theme.colors.mut, lines: lines, shrink: shrink)
    }
}

/** The EZER at the top right of every tab (the lock screen's Cinzel mark with the perched dove). ONE
 *  size and ONE place on every tab, at the owner's request ("hard locked in placement and size whenever
 *  it's on the screen"; he picked 56, word on the right margin, Oct 12 2026). */
let TAB_MARK_W: CGFloat = 56
/** EZER's floor (the word image's bottom) on the baseline of a 26pt screenTitle whose box starts at
 *  insets.top + 10 (Wallet, Pay in 4, Savings, Alerts). A single-line SwiftUI Text puts its baseline
 *  the font's ascender below its top (Space Grotesk Bold: hhea ascender 984/1000, line gap 0), so
 *  10 + 26·0.984 − 56·133/558 = 10 + 25.584 − 13.348 = 22.24. RN's 26 is Android's measurement, where
 *  includeFontPadding puts the baseline at usWinAscent (1150/1000 · 26 = 29.9) instead. */
private let TAB_MARK_TOP: CGFloat = 10 + 26 * 984 / 1000 - TAB_MARK_W * DoveFrames.WORD.h / DoveFrames.WORD.w

/** RN `<TabMark />`. Absolute, so it ignores each screen's padding: put it on the tab's padded scroll
 *  content with `.tabMark()`, outside ScreenBody (it scrolls with the page, never fades or rises
 *  with it). */
struct TabMark: View {
    @Environment(\.safeInsets) private var insets

    var body: some View {
        DoveMark(width: TAB_MARK_W)
            .padding(.top, insets.top + TAB_MARK_TOP)
            .padding(.trailing, Layout.screenX)
            .allowsHitTesting(false)
    }
}

extension View {
    /// The tab's EZER pinned to this (scroll content) view's top right, as RN's absolute
    /// `top: insets.top + TAB_MARK_TOP, right: layout.screenX` child of the content container.
    /// `maxWidth: .infinity` makes the box the screen's width (RN's content container always is).
    func tabMark() -> some View {
        frame(maxWidth: .infinity).overlay(alignment: .topTrailing) { TabMark() }
    }
}

// MARK: - Surfaces

/** Standard card surface: `card` bg, `line` border 1, r18. Put RN `padding` inside the content.
 *  `borderColor` / `background` stand in for an RN `style` override of those two (e.g. the error
 *  banner's `borderColor: colors.red + '55'`). */
struct Surface<Content: View>: View {
    @Environment(ThemeStore.self) private var theme
    var radius: CGFloat = Radius.card
    var borderColor: Color?
    var background: Color?
    @ViewBuilder var content: Content

    init(radius: CGFloat = Radius.card, borderColor: Color? = nil, background: Color? = nil, @ViewBuilder content: () -> Content) {
        self.radius = radius
        self.borderColor = borderColor
        self.background = background
        self.content = content()
    }

    var body: some View {
        content
            .background(RoundedRectangle(cornerRadius: radius, style: .circular).fill(background ?? theme.colors.card))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .circular).strokeBorder(borderColor ?? theme.colors.line, lineWidth: 1))
    }
}

/// Press feedback as a ButtonStyle: scale to `scaleTo` over 150ms easeOut on press-in, back to 1 on
/// press-out. Usable directly: `Button { } label: { }.buttonStyle(PressScaleStyle(scaleTo: 0.95))`.
struct PressScaleStyle: ButtonStyle {
    var scaleTo: Double = Motion.pressScale

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scaleTo : 1)
            .animation(.rn(.easeOut, Motion.press), value: configuration.isPressed)
    }
}

/// A Pressable with no visual feedback (RN `Pressable onPress` without a style function).
struct PlainPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label }
}

/// RN `TouchableOpacity`: opacity 0.2 while pressed (its default activeOpacity).
struct TouchableOpacityStyle: ButtonStyle {
    var activeOpacity: Double = 0.2
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? activeOpacity : 1)
    }
}

/**
 * Pressable that scales on press (.93–.98 over 150ms per the handoff). Layout frames belong on the
 * PressScale (RN: "the layout style MUST land on the Pressable"); make the content fill it with
 * `.frame(maxWidth: .infinity, maxHeight: .infinity)` where the RN inner view stretched.
 */
struct PressScale<Content: View>: View {
    var scaleTo: Double = Motion.pressScale
    var disabled = false
    var hitSlop: CGFloat = 0
    let action: () -> Void
    @ViewBuilder var content: Content

    init(scaleTo: Double = Motion.pressScale, disabled: Bool = false, hitSlop: CGFloat = 0, action: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.scaleTo = scaleTo
        self.disabled = disabled
        self.hitSlop = hitSlop
        self.action = action
        self.content = content()
    }

    var body: some View {
        Button(action: action) { content }
            .buttonStyle(PressScaleStyle(scaleTo: scaleTo))
            .disabled(disabled)
            .hitSlop(hitSlop)
    }
}

/** Pill chip. Used for range selectors, trial/renewal tags, status chips. */
struct Chip: View {
    enum Tone { case neutral, gold, red, accent }
    @Environment(ThemeStore.self) private var theme
    let label: String
    var active = false
    var tone: Tone = .neutral
    var onPress: (() -> Void)?

    init(label: String, active: Bool = false, tone: Tone = .neutral, onPress: (() -> Void)? = nil) {
        self.label = label; self.active = active; self.tone = tone; self.onPress = onPress
    }

    var body: some View {
        let c = theme.colors
        let t = theme.tokens
        let (bg, fg, border): (Color, Color, Color) = {
            // Active range chips invert to a solid gold fill with white text.
            if active { return (c.goldBg, Color(css: "#FFFFFF"), c.goldBg) }
            switch tone {
            case .neutral: return (c.card, c.ink, c.line)
            case .gold: return (c.goldSoft, c.gold, c.goldLine)
            // RN string concatenation: `colors.red + '1F'` -> #RRGGBBAA.
            case .red: return (Color(css: t.red + "1F"), c.red, Color(css: t.red + "40"))
            case .accent: return (c.accSoft, c.accInk, Color(css: "transparent"))
            }
        }()

        let chipBody = Text(label)
            .typeStyle(TypeScale.labelSm)
            .foregroundStyle(fg)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .frame(minHeight: 28)
            .background(Capsule().fill(bg))
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))

        if let onPress {
            PressScale(scaleTo: 0.95, action: onPress) { chipBody }
        } else {
            chipBody
        }
    }
}

/**
 * Gold pulse ring: a 2px `goldLine` ring whose opacity (.55·(1−t)) and scale (1+.06·t) animate,
 * 2400ms linear, three times each time the screen comes into view, then rests at t=1 (faded out).
 * Reduced motion: a static ring at full strength. Stops when the screen is hidden (CLAUDE.md
 * "Idle loops must stop when their screen is hidden"). Use as an overlay on the tile it marks.
 */
struct PulseRing: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduced
    @Environment(\.isScreenFocused) private var focused
    var radius: CGFloat = Radius.card

    @State private var start: Date?
    @State private var frozenT: Double = 0

    private static let cycle = Motion.pulse / 1000

    var body: some View {
        TimelineView(.animation(paused: start == nil)) { tl in
            let t = currentT(at: tl.date)
            RoundedRectangle(cornerRadius: radius, style: .circular)
                .strokeBorder(theme.colors.goldLine, lineWidth: 2)
                .opacity(0.55 * (1 - t))
                .scaleEffect(1 + 0.06 * t)
        }
        .allowsHitTesting(false)
        // withRepeat(…, 3): after the third pulse the value rests at t=1 and nothing redraws. Pause
        // the timeline there too, or it keeps drawing every frame while the screen is visible.
        .task(id: start) {
            guard let s = start else { return }
            try? await Task.sleep(nanoseconds: UInt64(3 * Self.cycle * 1_000_000_000))
            if !Task.isCancelled, start == s {
                frozenT = 1
                start = nil
            }
        }
        .onChange(of: focused && !reduced, initial: true) { _, running in
            if running {
                frozenT = 0
                start = Date()
            } else if let s = start {
                // cancelAnimation: the value stays where it was.
                frozenT = t(since: s, at: Date())
                start = nil
            }
        }
    }

    private func t(since s: Date, at now: Date) -> Double {
        let e = now.timeIntervalSince(s) / Self.cycle
        if e >= 3 { return 1 }
        return e - floor(e)
    }

    private func currentT(at now: Date) -> Double {
        guard let s = start else { return frozenT }
        return t(since: s, at: now)
    }
}

/** Screen wrapper: fade + rise entrance (14 -> 0, no rise when reduced) over 350ms easeOut, once per mount. */
struct ScreenBody<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var reduced
    @ViewBuilder var content: Content
    @State private var anim: Double = 0
    @State private var started = false

    init(@ViewBuilder content: () -> Content) { self.content = content() }

    var body: some View {
        content
            .opacity(anim)
            .offset(y: (reduced ? 0 : 14) * (1 - anim))
            .onAppear {
                guard !started else { return }
                started = true
                withAnimation(.rn(.easeOut, Motion.screenIn)) { anim = 1 }
            }
    }
}

// Port of apps/mobile/components/redesign/RotatingTile.tsx
//
// =============================================================================
// EZER — bottom-left dashboard tile: features on one rotation
//
// Holds CTAs that cycle so each gets eye time (Home passes three: connect a
// bank, "Get your physical card" — plain card icon, no contactless/NFC marks
// anywhere in the app — and "Top ticket", the three costliest subscriptions).
//
// Behaviour:
//   * auto-advances on a dwell timer long enough to actually read the card
//   * left/right arrows let the user drive it themselves
//   * ANY arrow press stops the auto-rotation; it only resumes after a period
//     of arrow inactivity (RESUME_AFTER_MS), and that countdown restarts on
//     every single press
//   * tapping the body opens that feature's own full screen
//
// Layout note: the arrows and dots live in their own row BELOW the content, so
// the slide gets the tile's full width. Nothing is squeezed between the arrows.
// =============================================================================
//
// iOS: the auto-advance timer also stops while Home is not the visible screen
// (\.isScreenFocused) — port map note + CLAUDE.md "Idle loops must stop when their screen is
// hidden"; it restarts with a full DWELL_MS when Home is shown again.
// The caller gives the tile its grid frame (RN `style`).

import SwiftUI

/**
 * How long each feature sits on screen before auto-advancing. 6.5s is long
 * enough to read three merchant marks plus a price without feeling stuck.
 */
private let DWELL_MS: Double = 6500
/** Idle time after the last arrow press before auto-rotation resumes (spec: 8-10s). */
private let RESUME_AFTER_MS: Double = 9000
/** Total cross-fade: half out, half in. */
private let FADE_MS: Double = 300

/**
 * 24px chip + 11px slop on every side = 46px target (design system min 44).
 * The chip stays small so it reads as chrome; the slop makes it easy to hit.
 */
private let ARROW_SIZE: CGFloat = 24
private let ARROW_HIT: CGFloat = 11

/// RN `RotatingSlide` (exported interface of RotatingTile.tsx).
struct HomeRotatingSlide {
    var key: String
    /** Rendered inside the tile. */
    var render: () -> AnyView
    var onPress: (() -> Void)?
}

/// useRef values: never trigger a render.
@MainActor
private final class HomeRotatingRefs {
    var resumeTimer: Task<Void, Never>?
    /** True while a cross-fade is in flight — stops two fades overlapping. */
    var animating = false
    var fadeTask: Task<Void, Never>?
}

struct RotatingTile: View {
    let slides: [HomeRotatingSlide]

    @Environment(ThemeStore.self) private var theme
    @Environment(\.isScreenFocused) private var focused
    @State private var i = 0
    @State private var paused = false
    @State private var fade: Double = 1
    @State private var refs = HomeRotatingRefs()

    init(slides: [HomeRotatingSlide]) {
        self.slides = slides
    }

    // Guard against a slides array that shrinks underneath us.
    private var count: Int { slides.count }
    private var index: Int { count > 0 ? min(i, count - 1) : 0 }

    private struct RotationKey: Equatable {
        let paused: Bool
        let count: Int
        let focused: Bool
    }

    var body: some View {
        let colors = theme.colors
        let slide: HomeRotatingSlide? = count > 0 ? slides[index] : nil

        VStack(alignment: .leading, spacing: 0) {
            // <Pressable onPress={slide?.onPress} style={styles.body}>
            Button {
                slide?.onPress?()
            } label: {
                // <Animated.View style={[styles.bodyInner, { opacity: fade }]}>
                VStack(spacing: 0) {
                    slide?.render()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .opacity(fade)
                .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            if count > 1 {
                HStack(alignment: .center, spacing: 0) {
                    arrow(dir: -1, icon: "chevron-back", label: "Previous", colors: colors)

                    Spacer(minLength: 0)

                    HStack(alignment: .center, spacing: 4) {
                        ForEach(Array(slides.enumerated()), id: \.element.key) { idx, _ in
                            rnRect(3)
                                .fill(idx == index ? colors.accInk : colors.line2)
                                .frame(width: idx == index ? 12 : 5, height: 5)
                        }
                    }

                    Spacer(minLength: 0)

                    arrow(dir: 1, icon: "chevron-forward", label: "Next", colors: colors)
                }
                .padding(.top, 6)
            }
        }
        // Lean chrome: the tile has to hold content + an arrow row inside the same
        // 132px cell the three static tiles occupy, so every pixel here is content
        // the slide does not get. (+ 1: RN's border takes layout space; rnBox only draws it.)
        .padding(.top, 10 + 1)
        .padding(.horizontal, 10 + 1)
        .padding(.bottom, 6 + 1)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .rnBox(bg: colors.card, radius: Radius.card, border: colors.line, clip: true)
        // Auto-rotation. Disabled entirely while `paused` (and while Home is hidden).
        .task(id: RotationKey(paused: paused, count: count, focused: focused)) {
            guard !paused, count >= 2, focused else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(Int(DWELL_MS)))
                if Task.isCancelled { break }
                go(1)
            }
        }
        // onDisappear is NOT RN's unmount: it also fires when a screen is pushed over the tabs,
        // where RN's tile stays mounted. So the resume countdown keeps running (cancelling it
        // left `paused` stuck true after an arrow press + a push); only the fade is settled.
        .onDisappear {
            // Never leave the value stranded mid-fade: stop the driver and restore
            // full opacity, so a re-mount / re-use can't render an invisible tile.
            refs.fadeTask?.cancel()
            refs.fadeTask = nil
            refs.animating = false
            withoutAnimation { fade = 1 }
        }
    }

    private func arrow(dir: Int, icon: String, label: String, colors: ThemeColors) -> some View {
        Button {
            manual(dir)
        } label: {
            Ionicon(icon, size: 14, color: colors.accInk)
                .frame(width: ARROW_SIZE, height: ARROW_SIZE)
                .rnBox(bg: colors.accSoft, radius: ARROW_SIZE / 2, border: colors.line2)
                .padding(ARROW_HIT)
                .contentShape(Rectangle())
        }
        .buttonStyle(HomeArrowPressStyle(onPressIn: holdRotation))
        .padding(-ARROW_HIT)
        .accessibilityLabel(Text(verbatim: label))
    }

    private func go(_ dir: Int) {
        if count < 2 { return }
        // A press (or a stray interval tick) landing mid-transition is dropped
        // rather than stacking a second animation on the same value.
        if refs.animating { return }
        refs.animating = true

        let n = count
        withAnimation(.rn(.out(.ease), FADE_MS / 2)) { fade = 0 }
        refs.fadeTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(Int(FADE_MS / 2)))
            guard !Task.isCancelled else {
                // Interrupted: bail out without swapping slides, and make sure the
                // tile is visible again rather than stuck at opacity 0.
                refs.animating = false
                withoutAnimation { fade = 1 }
                return
            }
            i = (i + dir + n) % n
            withAnimation(.rn(.out(.ease), FADE_MS / 2)) { fade = 1 } // entering: ease-out, never ease-in
            try? await Task.sleep(for: .milliseconds(Int(FADE_MS / 2)))
            refs.animating = false
            if Task.isCancelled { withoutAnimation { fade = 1 } }
        }
    }

    /**
     * Manual arrow. Pauses first so the interval effect tears down before the
     * fade runs, then restarts the resume countdown from zero — every press,
     * including presses that arrive while a fade is still finishing.
     */
    private func manual(_ dir: Int) {
        paused = true
        refs.resumeTimer?.cancel()
        refs.resumeTimer = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(Int(RESUME_AFTER_MS)))
            if Task.isCancelled { return }
            paused = false
        }
        go(dir)
    }

    /** Touching an arrow at all halts the rotation, before the press resolves. */
    private func holdRotation() {
        paused = true
        refs.resumeTimer?.cancel()
    }
}

/// `({ pressed }) => [...arrowStyle, pressed && styles.arrowPressed]` + `onPressIn={holdRotation}`.
private struct HomeArrowPressStyle: ButtonStyle {
    let onPressIn: () -> Void

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.6 : 1)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed { onPressIn() }
            }
    }
}

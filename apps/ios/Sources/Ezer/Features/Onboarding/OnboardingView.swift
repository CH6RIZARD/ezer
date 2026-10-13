// Port of apps/mobile/app/onboarding.tsx
//
// =============================================================================
// EZER Mobile — Onboarding ("Ticker Cut")
//
// Six screens: ticker → card → leak replay → radar → auth → passcode.
//
// DARK ONLY, on purpose. The flow is designed as one committed dark aesthetic,
// so it reads `darkTokens` (ThemeColors.dark) directly rather than the theme
// store. Running it through the light palette would wash out the gold and the
// coral, which carry the meaning here (gold = a trial about to convert, coral =
// money leaving).
//
// RN drove every animation with core `Animated` (marquee translate, card spin,
// staggered rise, the calendar pop-in). Here: loops run off TimelineView (paused
// when the screen is hidden), one-shot timings use `.rn(easing, ms)` with the
// same curves and durations.
//
// The numbers in screens 03 and 04 are ILLUSTRATIVE and labelled EXAMPLE on
// screen. They are not a claim about anyone's account, and they are not the
// bundled demo data that used to leak into the real screens — that is deleted.
// Never add '★ 4.9', '$4.8M caught' or '$34 a month on average' (CLAUDE.md
// "Routing and the app's front door").
// =============================================================================

import SwiftUI
import UIKit

// --- shared -----------------------------------------------------------------

private let T = ThemeColors.dark

private let SERIF = FontFamily.serif
private let UI_BOLD = FontFamily.bold
private let UI_SEMI = FontFamily.semibold

/** Screens 02–04 carry the three progress bars; 01 and 05 carry none. */
private let PROGRESS_STEPS = [1, 2, 3]

private struct OnboardingEyebrow: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.ezer(UI_BOLD, 11))
            .tracking(2.5)
            .foregroundStyle(T.gold)
    }
}

private struct OnboardingDisplay: View {
    let size: CGFloat
    let text: String

    var body: some View {
        Text(text)
            .font(.ezer(SERIF, size))
            .rnLineHeight(size * 1.06, family: SERIF, size: size)
            .foregroundStyle(T.ink)
    }
}

private enum OnboardingCtaVariant { case primary, gradient, quiet }

private struct OnboardingCta: View {
    let label: String
    var variant: OnboardingCtaVariant = .primary
    var disabled = false
    let onPress: () -> Void

    var body: some View {
        Button(action: onPress) {
            Text(label)
                .font(.ezer(UI_BOLD, 15))
                .foregroundStyle(variant == .quiet ? T.ink : Color(css: "#FFFFFF"))
        }
        .buttonStyle(OnboardingCtaStyle(variant: variant, disabled: disabled))
        .disabled(disabled)
    }
}

/// RN: height 54, r17, centred; scale 0.97 while down (set on pressIn/pressOut, no
/// animation); opacity 0.45 when disabled.
private struct OnboardingCtaStyle: ButtonStyle {
    let variant: OnboardingCtaVariant
    let disabled: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background { fill }
            .contentShape(rnRect(17))
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(disabled ? 0.45 : 1)
    }

    @ViewBuilder
    private var fill: some View {
        switch variant {
        case .gradient:
            rnRect(17).fill(LinearGradient.rn([T.accent, Color(css: "#A87D2F")], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1)))
        case .primary:
            rnRect(17).fill(T.accent)
        case .quiet:
            rnRect(17).strokeBorder(T.line2, lineWidth: 1)
        }
    }
}

private struct OnboardingProgress: View {
    let step: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(PROGRESS_STEPS, id: \.self) { i in
                rnRect(2)
                    .fill(i <= step ? T.gold : T.line)
                    .frame(width: 26, height: 3)
            }
        }
    }
}

/** Staggered rise+fade, the entrance every screen uses. */
private struct OnboardingRise<Content: View>: View {
    let delay: Double
    let content: Content
    @State private var a: Double = 0

    init(delay: Double = 0, @ViewBuilder content: () -> Content) {
        self.delay = delay
        self.content = content()
    }

    var body: some View {
        content
            .opacity(a)
            .offset(y: 26 * (1 - a))
            .onAppear {
                withAnimation(.rn(.out(.cubic), 800).delay(delay / 1000)) { a = 1 }
            }
    }
}

/// The Pressable "I already have an account" link (screens 01 and 04).
private struct OnboardingHaveAccount: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text("I already have an account")
                .font(.ezer(UI_SEMI, 14))
                .foregroundStyle(T.accInk)
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(PlainPressStyle())
    }
}

// --- 01 · ticker ------------------------------------------------------------

/**
 * RN `BrandReveal`: the brand mark is the lock screen's dove reveal (Lock/DoveReveal.swift), on this
 * flow's fixed dark palette. EZER fades in (0.3 to 1 over 900ms) while the rendered dove flies under
 * the letters and lands on the R. Both wait for their images, as the lock screen does, so the flight
 * is never spent on an empty screen; held at most 1.5s. Same width as the lock screen's mark.
 */
private let REVEAL_MS: Double = 900

private struct OnboardingBrandReveal: View {
    @Environment(\.windowSize) private var win
    @Environment(\.accessibilityReduceMotion) private var reduced
    @State private var ready = false
    @State private var word: Double = 0

    var body: some View {
        let markW = CGFloat(jsRound(Double(win.width) * 0.517))
        DoveMark(width: markW, perched: false, ink: T.ink)
            .opacity(word)
            // RN: DoveFlight is an absolute sibling at the word's top-left.
            .overlay(alignment: .topLeading) {
                DoveFlight(width: markW, duration: REVEAL_MS, play: ready, edge: .some(nil))
            }
            // The perched dove rises 0.36 of the word's width above it.
            .padding(.top, ceil(markW * 0.36))
            // RN: the word's and the sprite sheet's onLoad (the perched dove under reduced motion,
            // DoveFlight's fallback), or 1.5s, whichever comes first.
            .task {
                let images = DoveImages.shared
                let w = await images.load(.wordmark)
                if await images.load(reduced ? .perch : .sheet), w { reveal() }
            }
            .task {
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                if !Task.isCancelled { reveal() }
            }
    }

    private func reveal() {
        guard !ready else { return }
        ready = true
        // word.setValue(0.3), then timing to 1 over 900ms inOut(ease).
        withoutAnimation { word = 0.3 }
        onNextRunLoop { withAnimation(.rn(.inOut(.ease), REVEAL_MS)) { word = 1 } }
    }
}

private struct OnboardingChip {
    let pre: String
    let hl: String
    let hc: Color
    let post: String
    var own = false
}

// Each chip leads with the merchant's real logo (MerchantMark, keyed on `pre`).
// "Split in 4" is EZER's own product, not a merchant, so it has no mark.
private let CHIPS: [OnboardingChip] = [
    OnboardingChip(pre: "Netflix", hl: "-$15.49", hc: T.red, post: "caught"),
    OnboardingChip(pre: "Hulu trial", hl: "flagged", hc: T.gold, post: ""),
    OnboardingChip(pre: "Adobe CC", hl: "-$22.99", hc: T.red, post: "caught"),
    OnboardingChip(pre: "Spotify", hl: "-$11.99", hc: T.red, post: "caught"),
    OnboardingChip(pre: "Peloton", hl: "renewal seen", hc: T.gold, post: ""),
    OnboardingChip(pre: "YouTube", hl: "-$13.99", hc: T.red, post: "caught"),
    OnboardingChip(pre: "Figma", hl: "-$34", hc: T.red, post: "caught"),
    OnboardingChip(pre: "Split in 4", hl: "$212 sofa", hc: T.accInk, post: "", own: true),
    OnboardingChip(pre: "iCloud", hl: "-$2.99", hc: T.red, post: "caught"),
]

private struct OnboardingMarquee: View {
    let duration: Double
    var reverse = false

    // Idle loop: stops while the screen is covered (CLAUDE.md "Idle loops must stop").
    @Environment(\.isScreenFocused) private var focused
    @State private var runWidth: CGFloat = 0
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: runWidth == 0 || !focused)) { tl in
            // Animated.loop(timing 0 -> 1, linear, `duration`).
            let ms: Double = max(0, tl.date.timeIntervalSince(start)) * 1000
            let x: CGFloat = runWidth == 0 ? 0 : CGFloat(ms.truncatingRemainder(dividingBy: duration) / duration)
            // The chip run is rendered twice; translating by exactly one run's width puts
            // the copy where the original was, so the loop has no visible seam.
            let translateX: CGFloat = reverse ? runWidth * x - runWidth : -runWidth * x
            HStack(spacing: 8) {
                run.onGeometryChange(for: CGFloat.self) { $0.size.width } action: { runWidth = $0 + 8 }
                run
            }
            .fixedSize()
            .offset(x: translateX)
        }
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)
        .frame(height: 34, alignment: .top)
        .clipped()
        // x.setValue(0) whenever the measured run changes.
        .onChange(of: runWidth) { start = Date() }
    }

    private var run: some View {
        HStack(spacing: 8) {
            ForEach(CHIPS.indices, id: \.self) { i in
                // RN padding 14/8 sits inside the 1px border; rnBox draws the border inside the frame.
                HStack(spacing: 6) {
                    if !CHIPS[i].own { MerchantMark(name: CHIPS[i].pre, size: 15) }
                    chipText(CHIPS[i])
                }
                    .padding(.horizontal, 14 + 1)
                    .padding(.vertical, 8 + 1)
                    .rnBox(bg: T.card, radius: 12, border: T.line)
            }
        }
    }

    /// `{c.pre} <Text bold hc>{c.hl}</Text>{c.post ? ` ${c.post}` : ''}` at 11.5 semibold, mut.
    private func chipText(_ c: OnboardingChip) -> Text {
        let pre: Text = Text(c.pre + " ").font(.ezer(UI_SEMI, 11.5)).foregroundColor(T.mut)
        let hl: Text = Text(c.hl).font(.ezer(UI_BOLD, 11.5)).foregroundColor(c.hc)
        let postString: String = c.post.isEmpty ? "" : " " + c.post
        let post: Text = Text(postString).font(.ezer(UI_SEMI, 11.5)).foregroundColor(T.mut)
        return pre + hl + post
    }
}

private struct OnboardingTicker: View {
    let onStart: () -> Void
    let onLogin: () -> Void

    @Environment(\.safeInsets) private var insets

    var body: some View {
        ZStack(alignment: .top) {
            VStack(spacing: 10) {
                OnboardingMarquee(duration: 26000)
                OnboardingMarquee(duration: 34000, reverse: true)
                OnboardingMarquee(duration: 30000)
            }
            .opacity(0.55)
            .padding(.top, insets.top + 40)

            LinearGradient.rn(
                [Color(css: "transparent"), Color(css: "rgba(21,16,33,0.15)"), Color(css: "rgba(21,16,33,0.92)"), T.bg],
                locations: [0, 0.26, 0.44, 0.56]
            )
            .frame(height: 320)
            .padding(.top, insets.top)
            .allowsHitTesting(false)

            VStack(spacing: 0) {
                VStack(spacing: 0) {
                    OnboardingBrandReveal()
                    OnboardingRise(delay: 250) {
                        Text("While you read this, somebody's trial just billed. Yours won't.")
                            .font(.system(size: 15))
                            .rnLineHeight(22, family: nil, size: 15)
                            .foregroundStyle(T.mut)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: 280)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.top, 12)
                    }
                    OnboardingRise(delay: 350) {
                        HStack(spacing: 8) {
                            Text("Read-only access")
                                .font(.ezer(UI_BOLD, 11))
                                .foregroundStyle(T.gold)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(rnRect(12).fill(T.goldSoft))
                            Text("Bank-grade encryption")
                                .font(.ezer(UI_BOLD, 11))
                                .foregroundStyle(T.accInk)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(rnRect(12).fill(T.accSoft))
                        }
                        .padding(.top, 20)
                    }
                }
                .padding(.bottom, 40)

                OnboardingRise(delay: 500) {
                    VStack(spacing: 12) {
                        OnboardingCta(label: "Get started", variant: .gradient, onPress: onStart)
                        OnboardingHaveAccount(action: onLogin)
                    }
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, insets.bottom + 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// --- 02 · card --------------------------------------------------------------

/// RN's file-local `SpinCard` (renamed: PayIn4 owns the exported `SpinCard`).
private struct OnboardingSpinCard: View {
    @Environment(\.isScreenFocused) private var focused
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: !focused)) { tl in
            let ms = max(0, tl.date.timeIntervalSince(start)) * 1000
            // spin: Animated.loop(timing 0 -> 1, 9000ms, linear).
            let spin = ms.truncatingRemainder(dividingBy: 9000) / 9000
            // bob: loop(sequence(0 -> 1 over 1800ms, 1 -> 0 over 1800ms)), inOut(quad).
            let b = ms.truncatingRemainder(dividingBy: 3600)
            let ease = RNEasing.inOut(.quad)
            let bob = b < 1800 ? ease(b / 1800) : 1 - ease((b - 1800) / 1800)
            // Same faces + gold edge stack as the Pay in 4 card (SpinCard's
            // useCardLayers), driven by the spin loop instead of a drag, so this card
            // is as thick as the others rather than a single thin sheet.
            CardStack(layers: CardLayers(rotX: 0, rotY: spin * 360, floatY: bob * -7)) {
                front
            } back: {
                back
            }
        }
    }

    private var front: some View {
        ZStack {
            LinearGradient.rn(["#E7C77E", "#A87D2F"])
            VStack(spacing: 0) {
                HStack(alignment: .top, spacing: 0) {
                    LinearGradient.rn(["#E7C77E", "#A87D2F"])
                        .frame(width: 42, height: 31)
                        .clipShape(rnRect(7))
                    Spacer(minLength: 0)
                    Text("EZER")
                        .font(.ezer(UI_BOLD, 14))
                        .tracking(2.5)
                        .foregroundStyle(T.gold)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("••••  ••••  ••••  ••••")
                        .font(.system(size: 17))
                        .tracking(2)
                        .foregroundStyle(Color(css: "rgba(255,255,255,0.92)"))
                    HStack(spacing: 0) {
                        Text("EZER MEMBER")
                            .font(.ezer(UI_BOLD, 10))
                            .tracking(1)
                            .foregroundStyle(Color(css: "rgba(255,255,255,0.55)"))
                        Spacer(minLength: 0)
                        Text("PAY IN 4")
                            .font(.ezer(UI_BOLD, 10))
                            .tracking(1)
                            .foregroundStyle(Color(css: "rgba(255,255,255,0.55)"))
                    }
                    .padding(.top, 11)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
            }
            .padding(18)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(
                LinearGradient.rn(["#33303B", "#17151D", "#0B0A10"], locations: [0, 0.55, 1], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
            )
            .clipShape(rnRect(18))
            .padding(2)
        }
        .frame(width: CARD_W, height: CARD_H)
    }

    private var back: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient.rn(["#3B1580", "#1E0B45", "#0E0724"], locations: [0, 0.55, 1], start: UnitPoint(x: 0, y: 0), end: UnitPoint(x: 1, y: 1))
            Color(css: "#0B0812")
                .frame(height: 40)
                .padding(.top, 24)
            Text("•••")
                .font(.system(size: 14))
                .tracking(2)
                .foregroundStyle(Color(css: "#241A38"))
                .padding(.horizontal, 13)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .frame(height: 32)
                .background(rnRect(7).fill(Color(css: "rgba(255,255,255,0.9)")))
                .padding(.horizontal, 22)
                .padding(.top, 84)
            Text("SINGLE-USE VIRTUAL CARD")
                .font(.ezer(UI_BOLD, 9))
                .tracking(1)
                .foregroundStyle(Color(css: "rgba(255,255,255,0.45)"))
                .padding(.leading, 22)
                .padding(.bottom, 17)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
        }
        .frame(width: CARD_W, height: CARD_H)
    }
}

// --- 03 · leak replay -------------------------------------------------------

private struct OnboardingCharge {
    let day: Int
    let name: String
    let amount: Double
}

private let CHARGES: [OnboardingCharge] = [
    OnboardingCharge(day: 3, name: "Netflix", amount: 15.49),
    OnboardingCharge(day: 7, name: "Spotify", amount: 11.99),
    OnboardingCharge(day: 12, name: "YouTube", amount: 13.99),
    OnboardingCharge(day: 16, name: "Adobe CC", amount: 22.99),
    OnboardingCharge(day: 21, name: "Figma", amount: 34.0),
    OnboardingCharge(day: 27, name: "Hulu", amount: 17.99),
]
// RN's LEAK_TOTAL was declared and never read; not ported.

/// JS `n.toFixed(2)`.
private func onboardingToFixed2(_ n: Double) -> String { String(format: "%.2f", n) }

private struct OnboardingChargeDot: View {
    let charge: OnboardingCharge
    let shown: Bool
    @State private var a: Double = 0

    var body: some View {
        VStack(spacing: 1) {
            MerchantMark(name: charge.name, size: 17)
            Text("-$" + onboardingToFixed2(charge.amount).replacingOccurrences(of: ".00", with: ""))
                .font(.ezer(UI_BOLD, 9))
                .foregroundStyle(T.red)
        }
        .opacity(a)
        .scaleEffect(CGFloat(0.4 + 0.6 * a))
        .onChange(of: shown, initial: true) { _, s in
            withAnimation(.rn(.bezier(0.2, 0.9, 0.3, 1.2), 350)) { a = s ? 1 : 0 }
        }
    }
}

private struct OnboardingLeakCalendar: View {
    let shownCount: Int

    private static let byDay: [Int: (charge: OnboardingCharge, index: Int)] = {
        var m: [Int: (charge: OnboardingCharge, index: Int)] = [:]
        for (i, c) in CHARGES.enumerated() { m[c.day] = (c, i) }
        return m
    }()

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("October")
                    .font(.ezer(SERIF, 21))
                    .foregroundStyle(T.ink)
                Spacer(minLength: 0)
                Text("EXAMPLE MONTH")
                    .font(.ezer(UI_BOLD, 10))
                    .tracking(0.8)
                    .foregroundStyle(T.mut2)
            }
            .padding(.bottom, 12)

            HStack(spacing: 0) {
                ForEach(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"], id: \.self) { d in
                    Text(d)
                        .font(.ezer(UI_BOLD, 9))
                        .tracking(0.5)
                        .foregroundStyle(T.mut2)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, 7)

            // RN: a wrapping row of 35 cells, each width 100/7 %.
            VStack(spacing: 0) {
                ForEach(0..<5, id: \.self) { row in
                    HStack(alignment: .top, spacing: 0) {
                        ForEach(0..<7, id: \.self) { col in
                            cell(row * 7 + col)
                        }
                    }
                }
            }

            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("DRAINED SO FAR")
                    .font(.ezer(UI_BOLD, 11))
                    .tracking(0.8)
                    .foregroundStyle(T.mut)
                Spacer(minLength: 0)
                Text("$" + onboardingToFixed2(CHARGES.prefix(shownCount).reduce(0.0) { $0 + $1.amount }))
                    .font(.ezer(SERIF, 36))
                    .foregroundStyle(T.red)
            }
            .padding(.top, 14)
        }
        .padding(16)
        .background(rnRect(22).fill(T.card))
    }

    @ViewBuilder
    private func cell(_ i: Int) -> some View {
        let day = i - 2 // October starts Wednesday
        let inMonth = day >= 1 && day <= 31
        let hit = inMonth ? Self.byDay[day] : nil
        VStack(spacing: 1) {
            Text(inMonth ? String(day) : "")
                .font(.ezer(UI_SEMI, 10))
                .foregroundStyle(T.mut)
            if let hit {
                OnboardingChargeDot(charge: hit.charge, shown: hit.index < shownCount)
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, minHeight: 52, alignment: .top)
        .background(rnRect(9).fill(hit != nil ? T.cellHl : inMonth ? T.cellBg : Color.clear))
        .padding(2)
    }
}

// --- 04 · radar -------------------------------------------------------------

private struct OnboardingPulseBadge: View {
    let label: String
    let color: Color
    let bg: Color

    @Environment(\.isScreenFocused) private var focused
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: !focused)) { tl in
            // loop(sequence(0 -> 1 over 1200ms out(quad), 1 -> 0 over 1200ms in(quad))).
            let t = (max(0, tl.date.timeIntervalSince(start)) * 1000).truncatingRemainder(dividingBy: 2400)
            let up = RNEasing.out(.quad)
            let down = RNEasing.`in`(.quad)
            let p = t < 1200 ? up(t / 1200) : 1 - down((t - 1200) / 1200)
            Text(label)
                .font(.ezer(UI_BOLD, 11))
                .foregroundStyle(color)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(rnRect(10).fill(bg))
                .scaleEffect(CGFloat(1 + 0.06 * p))
        }
    }
}

private struct OnboardingUpcoming {
    let name: String
    let sub: String
    let badge: String
    let pulse: Bool
}

private let UPCOMING: [OnboardingUpcoming] = [
    OnboardingUpcoming(name: "Netflix", sub: "Renewal · $15.49", badge: "in 3d", pulse: false),
    OnboardingUpcoming(name: "Hulu", sub: "Trial ends · becomes $17.99/mo", badge: "in 5d", pulse: true),
    OnboardingUpcoming(name: "Adobe CC", sub: "Renewal · $22.99", badge: "in 9d", pulse: false),
]

// --- 05 · auth --------------------------------------------------------------

private enum OnboardingAccountMode { case signup, login }

/// RN's file-local `AuthStep` (renamed so it can't collide with the login/signup port).
private struct OnboardingAccountStep: View {
    @Binding var mode: OnboardingAccountMode
    let onDone: () -> Void

    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @State private var email = ""
    @State private var busy: AuthProvider?
    @State private var error: String?

    init(mode: Binding<OnboardingAccountMode>, onDone: @escaping () -> Void) {
        self._mode = mode
        self.onDone = onDone
    }

    // TODO(native): Apple and Google sign-in. AuthStore.loginWithProvider currently returns
    // `.unavailable` for both (spec/api.md §3.7: Sign in with Apple needs the paid Apple
    // Developer Program's entitlement plus a bundle id the server accepts as `aud`; Google is
    // not configured on production at all). The buttons, busy state and error copy are ported
    // as-is, so they light up once Stores/Auth/AppleSignIn.swift / GoogleSignIn.swift work.
    // The 'unavailable' copy below is RN's verbatim, including its "Expo Go" wording.
    private func provider(_ p: AuthProvider) async {
        busy = p
        error = nil
        let res = await auth.loginWithProvider(p)
        busy = nil
        // p[0].toUpperCase() + p.slice(1)
        let label: String = p.rawValue.prefix(1).uppercased() + String(p.rawValue.dropFirst())
        switch res {
        case .success:
            onDone()
        case .cancelled:
            return
        case let .unavailable(e):
            let tail: String = (e ?? "").isEmpty ? "." : " — " + (e ?? "")
            error = label + " sign-in needs the installed app, not Expo Go or a browser" + tail
        case let .failed(e):
            error = (e ?? "").isEmpty ? "Could not sign in with " + label + "." : (e ?? "")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                OnboardingDisplay(size: 34, text: mode == .signup ? "Create your account" : "Welcome back")
                Text(mode == .signup ? "Sixty seconds. Free to start. Cancel anytime." : "Good to see you again.")
                    .font(.system(size: 15))
                    .rnLineHeight(22, family: nil, size: 15)
                    .foregroundStyle(T.mut)
            }

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(T.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12 + 1) // inside the 1px border
                    .rnBox(bg: Color(css: "rgba(224,112,90,0.12)"), radius: 12, border: Color(css: "rgba(224,112,90,0.4)"))
            }

            VStack(spacing: 12) {
                Button {
                    Task { await provider(.apple) }
                } label: {
                    HStack(spacing: 10) {
                        if busy == .apple {
                            RNActivityIndicator(color: T.bg)
                        } else {
                            Ionicon("logo-apple", size: 19, color: T.bg)
                            Text("Continue with Apple")
                                .font(.ezer(UI_BOLD, 15))
                                .foregroundStyle(T.bg)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(rnRect(17).fill(T.ink))
                    .contentShape(rnRect(17))
                    .opacity(busy != nil ? 0.6 : 1)
                }
                .buttonStyle(PlainPressStyle())
                .disabled(busy != nil)

                Button {
                    Task { await provider(.google) }
                } label: {
                    HStack(spacing: 10) {
                        if busy == .google {
                            RNActivityIndicator(color: T.ink)
                        } else {
                            Ionicon("logo-google", size: 19, color: T.ink)
                            Text("Continue with Google")
                                .font(.ezer(UI_BOLD, 15))
                                .foregroundStyle(T.ink)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .rnBox(bg: T.card, radius: 17, border: T.line2)
                    .contentShape(rnRect(17))
                    .opacity(busy != nil ? 0.6 : 1)
                }
                .buttonStyle(PlainPressStyle())
                .disabled(busy != nil)
            }

            HStack(spacing: 14) {
                Rectangle().fill(T.line).frame(height: 1).frame(maxWidth: .infinity)
                Text("OR")
                    .font(.system(size: 12))
                    .foregroundStyle(T.mut2)
                Rectangle().fill(T.line).frame(height: 1).frame(maxWidth: .infinity)
            }

            VStack(spacing: 12) {
                TextField("", text: $email, prompt: Text("you@example.com").foregroundColor(T.mut2))
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .textContentType(.emailAddress)
                    .font(.system(size: 15))
                    .foregroundStyle(T.ink)
                    .padding(.horizontal, 18 + 1) // inside the 1px border
                    .frame(height: 54)
                    .rnBox(bg: T.card, radius: 16, border: T.line2)
                // Password and name live on the existing auth screens, which already do
                // the validation and the bcrypt round-trip. Carrying the typed email
                // across means the user does not enter it twice.
                OnboardingCta(
                    label: "Continue with email",
                    disabled: trimmedEmail.isEmpty
                ) {
                    router.push(mode == .signup ? "/auth/signup" : "/auth/login", ["email": trimmedEmail])
                }
            }

            Button {
                mode = mode == .signup ? .login : .signup
            } label: {
                switchText
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())

            Text("By continuing you agree to Ezer's Terms & Privacy Policy. Bank-grade 256-bit encryption. We never sell your data.")
                .font(.system(size: 11))
                .rnLineHeight(17, family: nil, size: 11)
                .foregroundStyle(T.mut2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }

    /// 14 system mut, with the nested link in bold accInk.
    private var switchText: Text {
        let lead: String = mode == .signup ? "Already have an account? " : "New here? "
        let link: String = mode == .signup ? "Log in" : "Sign up"
        let a: Text = Text(lead).font(.system(size: 14)).foregroundColor(T.mut)
        let b: Text = Text(link).font(.ezer(UI_BOLD, 14)).foregroundColor(T.accInk)
        return a + b
    }

    /// JS `email.trim()`.
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
}

// --- flow -------------------------------------------------------------------

/// RN's `timers` ref: pending setTimeouts, cleared together. A reference, so
/// scheduling never re-renders (useRef, not useState).
private final class OnboardingTimers {
    private var tasks: [Task<Void, Never>] = []

    func after(_ ms: Double, _ body: @escaping @MainActor () -> Void) {
        tasks.append(Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(ms * 1_000_000))
            if !Task.isCancelled { body() }
        })
    }

    func clear() {
        tasks.forEach { $0.cancel() }
        tasks = []
    }
}

/// The step/auto-advance effects' dependencies ([step, manual]).
private struct OnboardingTimerKey: Equatable {
    let step: Int
    let manual: Bool
}

struct OnboardingView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    // The email path pushes the auth screens over this one; while they are on
    // top, this screen must not act on the sign-in itself.
    @Environment(\.isScreenFocused) private var focused
    @Environment(\.windowSize) private var win

    @State private var step = 0
    @State private var authMode: OnboardingAccountMode = .signup
    @State private var shownCharges = 0

    // Any manual tap stops auto-advance for the rest of the run. "Get started"
    // does not count — it is the flow's own first beat, not an override.
    @State private var manual = false
    @State private var timers = OnboardingTimers()

    @State private var fade: Double = 1
    /// The latest go() target. A go() that interrupts another's fade-out wins, as in RN, where
    /// the interrupted callback runs first and the newest one last.
    @State private var nextStep = 0

    // Guarded: the provider buttons call finish() AND the step-4 effect fires on
    // the same sign-in (RN's `finishing` ref).
    @State private var finishing = false

    private func go(_ next: Int, byHand: Bool) {
        if byHand { manual = true }
        timers.clear()
        nextStep = next
        // Animated.timing with no easing = 500ms-default curve inOut(ease); here 160ms.
        withAnimation(.rn(.rnDefault, 160), completionCriteria: .logicallyComplete) {
            fade = 0
        } completion: {
            step = nextStep
            withAnimation(.rn(.out(.cubic), 350)) { fade = 1 }
        }
    }

    private func enterApp() {
        auth.completeOnboarding()
        router.replace("/(tabs)/home")
    }

    // Signed in. A first-time account sets its passcode as the flow's last
    // step; anyone who has finished onboarding before (signing back in after a
    // sign-out or "Forgot passcode") goes straight in, where LockGate asks —
    // asking here too was a second prompt.
    private func finish() {
        if finishing { return }
        finishing = true
        if auth.hasCompletedOnboarding || (try? getPasscodeInfo()) != nil {
            enterApp()
        } else {
            go(5, byHand: false)
        }
    }

    /// RN's two timer effects (both keyed on [step, manual], both cleaning up with clearTimers).
    private func runStepTimers() {
        timers.clear()
        // Screen 02 auto-advances after 3.8s.
        if step == 1 && !manual {
            timers.after(3800) { go(2, byHand: false) }
        }
        // Screen 03 replays the charges, then advances 1.8s after the last one.
        if step == 2 {
            shownCharges = 0
            for i in CHARGES.indices {
                timers.after(700 * Double(i + 1)) { shownCharges = i + 1 }
            }
            if !manual {
                timers.after(700 * Double(CHARGES.count) + 1800) { go(3, byHand: false) }
            }
        }
    }

    var body: some View {
        ZStack(alignment: .top) {
            // Behind the keyboard too: RN's flow View is never resized for it, so the (translucent)
            // keyboard sits over T.bg, not over the theme's background (cream in light mode).
            T.bg.ignoresSafeArea()
            // RN has no radial gradient; a top-down linear from bg2 to bg is the
            // closest approximation of the spec's 520×420 glow at 50% -8%.
            LinearGradient.rn([T.bg2, T.bg], locations: [0, 0.65])
                .frame(height: win.height * 0.55)

            stepContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .opacity(fade)
        }
        .rnScreen()
        .onChange(of: OnboardingTimerKey(step: step, manual: manual), initial: true) {
            runStepTimers()
        }
        // Already signed in and just replaying the story? Step 05 has nothing to ask
        // for. Anyone who authenticated before this flow existed still has
        // hasCompletedOnboarding false, and would otherwise be sent to a sign-in
        // screen for an account they are already inside.
        .onChange(of: [step == 4, auth.isAuthenticated, focused], initial: true) { _, v in
            if v[0] && v[1] && v[2] { finish() }
        }
        .onDisappear { timers.clear() }
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case 0:
            OnboardingTicker(
                onStart: { go(1, byHand: false) },
                onLogin: { authMode = .login; go(4, byHand: true) }
            )

        case 1:
            stepPage {
                chrome
                OnboardingSpinCard()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                VStack(alignment: .leading, spacing: 12) {
                    OnboardingEyebrow(text: "EZER · PAY IN 4")
                    OnboardingDisplay(size: 36, text: "Split anything in four.")
                    Text("One virtual card that turns any purchase into four easy payments.")
                        .font(.system(size: 15))
                        .rnLineHeight(23, family: nil, size: 15)
                        .foregroundStyle(T.mut)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 24)
                OnboardingCta(label: "Next") { go(2, byHand: true) }
            }

        case 2:
            stepPage {
                chrome
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            OnboardingEyebrow(text: "MEANWHILE, LAST MONTH")
                            OnboardingDisplay(size: 30, text: "This is a month, leaking.")
                        }
                        OnboardingLeakCalendar(shownCount: shownCharges)
                        if shownCharges >= CHARGES.count {
                            OnboardingRise {
                                Text("Six charges. Nobody noticed a single one.")
                                    .font(.system(size: 14))
                                    .foregroundStyle(T.mut)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 18)
                }
                .scrollIndicators(.hidden)
                OnboardingCta(label: "Ezer notices") { go(3, byHand: true) }
            }

        case 3:
            stepPage {
                chrome
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        OnboardingDisplay(size: 34, text: "Ezer catches all of it.")
                        VStack(alignment: .leading, spacing: 14) {
                            Text("EXAMPLE")
                                .font(.ezer(UI_BOLD, 10))
                                .tracking(0.8)
                                .foregroundStyle(T.mut2)
                            ForEach(UPCOMING, id: \.name) { u in
                                upcomingRow(u)
                            }
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(rnRect(22).fill(T.card))
                        Text("Flagged before they bill. Cancelled in one tap.")
                            .font(.system(size: 15))
                            .rnLineHeight(23, family: nil, size: 15)
                            .foregroundStyle(T.mut)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.bottom, 18)
                }
                .scrollIndicators(.hidden)
                VStack(spacing: 12) {
                    OnboardingCta(label: "Create my account", variant: .gradient) {
                        authMode = .signup
                        go(4, byHand: true)
                    }
                    OnboardingHaveAccount {
                        authMode = .login
                        go(4, byHand: true)
                    }
                }
            }

        case 4:
            // RN: keyboardShouldPersistTaps="handled" — SwiftUI buttons already take the tap
            // while the keyboard is up.
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Button { go(3, byHand: true) } label: {
                        Ionicon("chevron-back", size: 22, color: T.mut)
                            .frame(width: 44, height: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PlainPressStyle())
                    .hitSlop(12)
                    .padding(.bottom, 12)
                    OnboardingAccountStep(mode: $authMode, onDone: { finish() })
                }
                .padding(.horizontal, 24)
                .padding(.top, insets.top + 24)
                .padding(.bottom, insets.bottom + 32)
            }
            .scrollIndicators(.hidden)

        case 5:
            // No back button: the account behind it already exists.
            PasscodeSetup(palette: PadPalette(T)) { enterApp() }

        default:
            EmptyView()
        }
    }

    /// Steps 02–04's page: paddingHorizontal 24, top insets.top + 16, bottom insets.bottom + 24.
    private func stepPage<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .padding(.horizontal, 24)
        .padding(.top, insets.top + 16)
        .padding(.bottom, insets.bottom + 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// RN `chrome(label, next)`: back · progress · Skip (its two params were unused).
    private var chrome: some View {
        HStack(spacing: 0) {
            Button { go(step - 1, byHand: true) } label: {
                Ionicon("chevron-back", size: 22, color: T.mut)
                    .frame(width: 44, height: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())
            .hitSlop(12)
            Spacer(minLength: 0)
            OnboardingProgress(step: step)
            Spacer(minLength: 0)
            Button { go(4, byHand: true) } label: {
                Text("Skip")
                    .font(.ezer(UI_SEMI, 14))
                    .foregroundStyle(T.mut)
                    .fixedSize()
                    .frame(width: 44, height: 44, alignment: .trailing)
                    .contentShape(Rectangle())
            }
            .buttonStyle(PlainPressStyle())
            .hitSlop(12)
        }
        .padding(.bottom, 20)
    }

    private func upcomingRow(_ u: OnboardingUpcoming) -> some View {
        HStack(spacing: 12) {
            MerchantMark(name: u.name, size: 42)
            VStack(alignment: .leading, spacing: 0) {
                Text(u.name)
                    .font(.ezer(UI_BOLD, 15))
                    .foregroundStyle(T.ink)
                Text(u.sub)
                    .font(.system(size: 12))
                    .foregroundStyle(T.mut)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Group {
                if u.pulse {
                    OnboardingPulseBadge(label: u.badge, color: T.gold, bg: T.goldSoft)
                } else {
                    Text(u.badge)
                        .font(.ezer(UI_BOLD, 11))
                        .foregroundStyle(T.red)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(rnRect(10).fill(Color(css: "rgba(224,112,90,0.16)")))
                }
            }
            .fixedSize()
        }
    }
}

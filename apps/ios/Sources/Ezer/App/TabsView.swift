// Port of apps/mobile/app/(tabs)/_layout.tsx — TabLayout, TabButton, TabIndicator.
//
// Floating tab bar over a ZStack of tab screens. Every tab stays MOUNTED and laid out; a hidden tab
// is just opacity 0 and untouchable (zIndex 0/1), so a tab tap changes two style props and nothing
// else (not a TabView). Tabs in order: Home, Pay in 4, Wallet, Savings; `saved` and `alerts` are
// routes without bar items. Nothing renders until the passcode is accepted (LockWarm); once the
// lock lifts (LockOpen), Pay in 4, Wallet and Savings mount one at a time at 1.2/2.4/3.6s (a tapped
// tab mounts immediately). Tab screens pad their own bottom by insets.bottom + Layout.tabBottom (176).
//
// Tab bar look (CLAUDE.md, Oct 11 2026, owner's request): NO filled/square pill behind the active
// tab. Icons are always the OUTLINE glyphs; the active one's stroke and label cross-fade to
// `accInk` with a small lift, and a short accent pill (TabIndicator) slides to the tapped tab.
// A solid `tabBg` bar, not a blur (content showing through the labels read as a bug).

import SwiftUI

private let BAR_HEIGHT: CGFloat = 62
private let EDGE_X: CGFloat = 12
private let EDGE_BOTTOM: CGFloat = 14
private let BAR_PAD_X: CGFloat = 6
private let IND_W: CGFloat = 18

private struct TabDef {
    let tab: Tab
    let icon: String
    let label: String
}

private let TABS: [TabDef] = [
    TabDef(tab: .home, icon: "home-outline", label: "Home"),
    TabDef(tab: .payin4, icon: "card-outline", label: "Pay in 4"),
    TabDef(tab: .wallet, icon: "wallet-outline", label: "Wallet"),
    // Ionicons has no piggy-bank glyph, and `save` is a floppy disk; the growth arrow is closest.
    TabDef(tab: .savings, icon: "trending-up-outline", label: "Savings"),
]

struct TabsView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.lockWarm) private var warm
    @Environment(\.lockOpen) private var open

    @State private var prewarmed: Set<Tab> = []
    /// TabSlot's `loaded`: a tab that has been focused once stays mounted.
    @State private var loaded: Set<Tab> = []
    @State private var barWidth: CGFloat = 0

    var body: some View {
        let colors = theme.colors
        // Nothing of the tabs exists under the passcode keypad (keeps the keypad responsive).
        if !warm {
            colors.bg.ignoresSafeArea()
        } else {
            ZStack(alignment: .bottom) {
                ForEach(Tab.allCases, id: \.self) { t in
                    let isFocused = router.tab == t
                    if isFocused || loaded.contains(t) || prewarmed.contains(t) {
                        tabScreen(t)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .opacity(isFocused ? 1 : 0)
                            .allowsHitTesting(isFocused)
                            .accessibilityHidden(!isFocused)
                            .zIndex(isFocused ? 1 : 0)
                            .environment(\.isScreenFocused, router.isTabFocused(t))
                            .debugScreenCapture("tab-\(t.rawValue)", active: router.isTabFocused(t))
                    }
                }

                bar(colors)
                    .zIndex(10)
            }
            .ignoresSafeArea(.container)
            .onChange(of: router.tab, initial: true) { _, t in loaded.insert(t) }
            // The other three tabs are built one at a time AFTER the lock has lifted, 1.2s apart.
            .task(id: open) {
                guard open else { return }
                for t in [Tab.payin4, .wallet, .savings] {
                    try? await Task.sleep(nanoseconds: 1_200_000_000)
                    if Task.isCancelled { return }
                    prewarmed.insert(t)
                }
            }
        }
    }

    @ViewBuilder
    private func tabScreen(_ t: Tab) -> some View {
        switch t {
        case .home: HomeView()
        case .payin4: PayIn4View()
        case .wallet: WalletView()
        case .savings: SavingsView()
        case .alerts: AlertsView()
        }
    }

    private func bar(_ colors: ThemeColors) -> some View {
        // RN: from usePathname(), so a pushed screen or the Paywall on top (/settings, …) matches no
        // tab and the indicator fades out (and slides toward slot 0) until the tabs are back on top.
        let onTop = router.path.isEmpty && !router.paywallPresented
        let activeIndex = onTop ? (TABS.firstIndex { $0.tab == router.tab } ?? -1) : -1
        let shape = RoundedRectangle(cornerRadius: Radius.tabBar, style: .circular)
        return ZStack(alignment: .bottomLeading) {
            HStack(spacing: 0) {
                ForEach(TABS, id: \.tab) { def in
                    TabButton(icon: def.icon, label: def.label, isFocused: router.tab == def.tab, reduce: reduce) {
                        router.selectTab(def.tab)
                    }
                }
            }
            // 1pt border + paddingHorizontal 6.
            .padding(.horizontal, 1 + BAR_PAD_X)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            TabIndicator(index: activeIndex, barWidth: barWidth, reduce: reduce, color: colors.accInk)
        }
        .frame(height: BAR_HEIGHT)
        .background(shape.fill(colors.tabBg))
        .clipShape(shape)
        .overlay(shape.strokeBorder(colors.line, lineWidth: 1))
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { barWidth = $0 }
        .padding(.horizontal, EDGE_X)
        .padding(.bottom, EDGE_BOTTOM + insets.bottom)
    }
}

/**
 * One bar item. No filled pill behind the active tab: the icon stays an OUTLINE and its stroke and
 * label cross-fade to the accent, with a slight lift (translateY -1.5·on, scale 1+.08·on) over
 * 240ms motion.easeOut (0ms with reduce motion).
 */
private struct TabButton: View {
    @Environment(ThemeStore.self) private var theme
    let icon: String
    let label: String
    let isFocused: Bool
    let reduce: Bool
    let action: () -> Void

    @State private var on: Double = 0
    @State private var initialised = false

    var body: some View {
        let colors = theme.colors
        Button(action: action) {
            VStack(spacing: 3) {
                ZStack {
                    Ionicon(icon, size: 21, color: colors.mut2)
                    Ionicon(icon, size: 21, color: colors.accInk).opacity(on)
                }
                .scaleEffect(1 + 0.08 * on)
                .offset(y: -1.5 * on)

                ZStack(alignment: .top) {
                    Text(label)
                        .font(.custom(FontFamily.bold, size: 10))
                        .foregroundStyle(colors.mut2)
                        .lineLimit(1)
                    Text(label)
                        .font(.custom(FontFamily.bold, size: 10))
                        .foregroundStyle(colors.accInk)
                        .lineLimit(1)
                        .multilineTextAlignment(.center)
                        .opacity(on)
                }
            }
            .frame(minWidth: 62)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .frame(height: BAR_HEIGHT)
            .contentShape(Rectangle())
        }
        .buttonStyle(PlainPressStyle())
        .accessibilityAddTraits(isFocused ? [.isSelected, .isButton] : [.isButton])
        .accessibilityLabel(label)
        .onAppear {
            if !initialised {
                initialised = true
                on = isFocused ? 1 : 0
            }
        }
        .onChange(of: isFocused) { _, f in
            withAnimation(.rn(.easeOut, reduce ? 0 : 240)) { on = f ? 1 : 0 }
        }
    }
}

/** Accent pill that slides along the bottom of the bar to the active tab (340ms easeOut). */
private struct TabIndicator: View {
    let index: Int
    let barWidth: CGFloat
    let reduce: Bool
    let color: Color

    @State private var x: CGFloat = 0
    @State private var seen: Double = 0
    @State private var initialised = false

    private var target: CGFloat {
        // barWidth is the outer width; the slots share what is left after the 1pt borders and the
        // horizontal padding.
        let slot = (barWidth - 2 - BAR_PAD_X * 2) / CGFloat(TABS.count)
        return BAR_PAD_X + slot * CGFloat(max(index, 0)) + (slot - IND_W) / 2
    }

    var body: some View {
        Group {
            if barWidth > 0 {
                RoundedRectangle(cornerRadius: 2, style: .circular)
                    .fill(color)
                    .frame(width: IND_W, height: 3)
                    // Absolute `left: 0` sits inside the 1pt border; `bottom: 5` likewise.
                    .offset(x: 1 + x, y: -(1 + 5))
                    .opacity(seen)
                    .allowsHitTesting(false)
            }
        }
        .onChange(of: TargetKey(target: target, index: index), initial: true) { _, k in
            if !initialised && barWidth > 0 {
                initialised = true
                x = k.target
                seen = k.index >= 0 ? 1 : 0
                return
            }
            withAnimation(.rn(.easeOut, reduce ? 0 : 340)) {
                x = k.target
                seen = k.index >= 0 ? 1 : 0
            }
        }
    }

    private struct TargetKey: Equatable {
        let target: CGFloat
        let index: Int
    }
}

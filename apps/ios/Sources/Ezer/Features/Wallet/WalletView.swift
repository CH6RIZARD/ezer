// Port of apps/mobile/app/(tabs)/wallet.tsx
//
// EZER Redesign — Wallet (handoff §4)
//
// Horizontally snapping bank cards (300x178 r20) with page dots, range chips (Custom · This month
// · Last month · YTD), the custom range picker, a serif-italic total drained card, "Where it goes"
// merchant rows and a "Review card drain" CTA.
//
// Every figure comes from the API (real Plaid charges) per card × range, via
// DataStore.getMerchants. Only the date-range helper (ChargeOccurrences.swift) is local.
//
// RN -> SwiftUI notes:
//   · The RN web-only carousel paths (CSS scroll-snap, onScroll index tracking) are not ported.
//   · snapToOffsets -> WalletSnapBehavior, a ScrollTargetBehavior that runs RN's own iOS
//     snapToOffsets algorithm (RCTScrollView scrollViewWillEndDragging); decelerationRate="fast"
//     -> WalletFastDeceleration sets the backing UIScrollView's rate.
//   · onScrollEndDrag / onMomentumScrollEnd -> scheduleCommit: the drag end (updateTarget) and
//     every offset change after it reset one 100ms clock; the index commits once it runs out.
//   · useFocusEffect -> .onChange(of: focus key, initial: true); tabs stay mounted.
//   · Refs (merchantsCardId, the breakdown cache, timers) live in WalletRefs, which nothing
//     observes, exactly like useRef.

import SwiftUI
import UIKit

/** How long a cached per-range breakdown stands without a re-fetch behind it. */
private let BREAKDOWN_FRESH_MS: Double = 60_000

// RN names CARD_W / CARD_H (renamed: CardCanvas exports CARD_W / CARD_H for the physical card
// and the module namespace is shared).
private let WALLET_CARD_W: CGFloat = 300
private let WALLET_CARD_H: CGFloat = 178
private let CARD_GAP: CGFloat = 14

// --- carousel snap maths -----------------------------------------------------
//
// Card i sits at content-x = SIDE_PAD + i * CARD_STEP (the contentContainer's left padding plus
// i cards and i gaps). To park that card in the middle of the viewport the scroll offset must be
// cardLeft - (SCREEN_W - CARD_W) / 2, i.e.
//
//   offset(i) = SIDE_PAD - CENTER_PAD + i * CARD_STEP
//
// With the usual SIDE_PAD === CENTER_PAD that collapses to i * CARD_STEP. snapToOffsets states
// the exact offsets and is immune to the padding maths entirely.
private let CARD_STEP: CGFloat = WALLET_CARD_W + CARD_GAP

/// SCREEN_W / CENTER_PAD / SIDE_PAD / FIRST_OFFSET, from the window width (RN read
/// Dimensions.get('window') once at module load).
private struct WalletCarouselMetrics {
    let screenW: CGFloat
    var centerPad: CGFloat { (screenW - WALLET_CARD_W) / 2 }
    /** Never let the cards run under the screen gutter on very narrow devices. */
    var sidePad: CGFloat { max(Layout.screenX, centerPad) }
    var firstOffset: CGFloat { sidePad - centerPad }

    func cardOffset(_ i: Int) -> CGFloat { firstOffset + CGFloat(i) * CARD_STEP }

    /// The scroll view's furthest offset (contentWidth - viewport).
    func maximumOffset(_ count: Int) -> CGFloat {
        let content = sidePad * 2 + CGFloat(count) * WALLET_CARD_W + CGFloat(max(0, count - 1)) * CARD_GAP
        return max(0, content - screenW)
    }
}

private let WALLET_PAGE_TOP = "wallet-page-top"
private let WALLET_CAROUSEL_SPACE = "wallet-carousel"

private struct WalletCard: Identifiable {
    let id: String
    let name: String
    /** The account's own nickname ("Spend"), shown smaller than `name` — a real card leads with
     *  the bank's name, not the account nickname. */
    let accountLabel: String?
    let network: String
    let last4: String
    /** What is known about the card, for CardArtResolver. */
    let input: CardArtInput
    /** Skin used when the resolver has nothing better (the old cycling skins). */
    let fallback: CardArtFallback
    /** Distinct subscriptions billed to this card (derived, not hard-coded). */
    let subs: Int
}

/**
 * SKINS ONLY — no card identities.
 *
 * This used to be a list of whole demo cards ("Sapphire Checking VISA •4821", "Gold Rewards AMEX
 * •1006") that rendered whenever no real instruments had loaded. The result was a wallet showing
 * cards the user had never linked, while Settings listed a different invented set again.
 *
 * Now it carries appearance only. Names, networks and last-4 come from Plaid; these just tint
 * them, cycling if someone links more accounts than skins.
 */
private let BANK_CARD_SKINS: [CardArtFallback] = [
    CardArtFallback(
        gradient: Gradients.bankSapphire,
        fg: "#FFFFFF",
        // Prototype uses .65 here, not .7.
        fgDim: "rgba(255,255,255,.65)"
    ),
    CardArtFallback(
        gradient: Gradients.bankGold,
        fg: "#241A38",
        fgDim: "rgba(36,26,56,.6)"
    ),
]

private struct WalletBreakdownRow: Equatable {
    let merchantId: String
    let merchantName: String
    let logo: String?
    let totalCents: Int
    let count: Int
    let subscriptionId: String?
}

/// Both sides are small arrays of plain rows; a structural compare is cheap (RN `sameBreakdown`,
/// a JSON.stringify compare).
private struct WalletBreakdown: Equatable {
    let merchants: [WalletBreakdownRow]
    let predicted: [PredictedCharge]
}

private struct WalletCacheEntry {
    let b: WalletBreakdown
    let at: Double
}

/// The inputs of RN's breakdown effect: [active?.id, preset, range.start, range.end,
/// fetchBreakdown, retryNonce] (range is re-memoised on preset/rStart/rEnd).
private struct WalletFetchKey: Equatable {
    let cardId: String?
    let preset: RangePreset
    let rStart: Date?
    let rEnd: Date?
    let start: Date
    let end: Date
    let retry: Int
}

private struct WalletChipDef {
    let key: RangePreset
    let label: String
}

private struct WalletFocusKey: Equatable {
    let focused: Bool
    let count: Int
    let index: Int
}

/// useRef values. A plain class nothing observes: writing these never re-renders.
private final class WalletRefs {
    /** Which card's data `merchants` currently holds, so the effect can tell "the card changed"
     *  apart from "only the date range changed" on the SAME card. */
    var merchantsCardId: String?
    /// breakdownCache (a Map): entries plus insertion order.
    var cache: [String: WalletCacheEntry] = [:]
    var cacheOrder: [String] = []
    var effectTask: Task<Void, Never>?
    var lastEffectKey: WalletFetchKey?
    var settleTask: Task<Void, Never>?
    /// Between a drag's end and the commit: offset changes (the snap) reset the settle clock.
    var settling = false
    /// rafRef: bumping it cancels a pending focus re-assert.
    var focusGen = 0
}

/// The carousel's live offset (written every frame, observed by nothing) and a drag-end counter
/// (observed by the screen). Shared with WalletSnapBehavior, which may run off the main actor's
/// static isolation, hence @unchecked Sendable; every write happens on the main thread.
@Observable
private final class WalletCarouselSignals: @unchecked Sendable {
    @ObservationIgnored var x: CGFloat = 0
    /// True once WalletFastDeceleration has put the carousel's UIScrollView on .fast.
    @ObservationIgnored var fastRate = false
    var dragEnds = 0
}

/// UIKit projects a fling with decelerationRate .normal (0.998): distance = v·d/(1−d) = 499·v.
/// RN's decelerationRate="fast" (0.99) projects the same release 99·v, i.e. 99/499 as far. Only
/// used if the scroll view could not be switched to .fast (see WalletFastDeceleration).
private let FAST_PROJECTION: CGFloat = 99.0 / 499.0

/// RN `decelerationRate="fast"` on the carousel: SwiftUI has no modifier for it, so this finds
/// the UIScrollView behind the SwiftUI ScrollView (the first one above the carousel content) and
/// sets it, which makes both the projected snap target and the glide to it RN's.
private struct WalletFastDeceleration: UIViewRepresentable {
    let signals: WalletCarouselSignals

    func makeUIView(context: Context) -> Probe {
        let v = Probe()
        v.isUserInteractionEnabled = false
        v.signals = signals
        return v
    }

    func updateUIView(_ v: Probe, context: Context) {
        v.signals = signals
        v.apply()
    }

    final class Probe: UIView {
        var signals: WalletCarouselSignals?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            apply()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            apply()
        }

        func apply() {
            var v: UIView? = superview
            while let s = v, !(s is UIScrollView) { v = s.superview }
            guard let sv = v as? UIScrollView else { return }
            if sv.decelerationRate != .fast { sv.decelerationRate = .fast }
            signals?.fastRate = true
        }
    }
}

/**
 * RN iOS `snapToOffsets` (RCTScrollView scrollViewWillEndDragging), snapToStart={false},
 * snapToEnd={false}, decelerationRate="fast": pick the snap offsets on either side of the
 * projected target, then go with the velocity (or to the nearer one when there is none).
 */
private struct WalletSnapBehavior: ScrollTargetBehavior {
    let offsets: [CGFloat]
    let maximumOffset: CGFloat
    let signals: WalletCarouselSignals

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        let offsetAlongAxis = signals.x
        let natural = target.rect.origin.x
        // sign(natural - release) == sign(velocity): UIKit's natural target is release + 499·v.
        let velocityAlongAxis = natural - offsetAlongAxis
        // UIKit's targetContentOffset: already the fast-rate projection when the scroll view is on
        // .fast; otherwise scale the normal-rate projection down to the fast one.
        let projection: CGFloat = signals.fastRate ? 1 : FAST_PROJECTION
        var targetOffset = offsetAlongAxis + velocityAlongAxis * projection

        if !offsets.isEmpty {
            // Calculate the snap offsets adjacent to the initial offset target
            var smallerOffset: CGFloat = 0
            var largerOffset = maximumOffset
            for offset in offsets {
                if offset <= targetOffset, targetOffset - offset < targetOffset - smallerOffset {
                    smallerOffset = offset
                }
                if offset >= targetOffset, offset - targetOffset < largerOffset - targetOffset {
                    largerOffset = offset
                }
            }
            // Calculate the nearest offset
            let nearestOffset = targetOffset - smallerOffset < largerOffset - targetOffset ? smallerOffset : largerOffset
            let firstOffset = offsets[0]
            let lastOffset = offsets[offsets.count - 1]

            if targetOffset >= lastOffset {
                // snapToEnd false: free scrolling past the last snap offset
                if offsetAlongAxis < lastOffset { targetOffset = lastOffset }
            } else if targetOffset <= firstOffset {
                // snapToStart false: free scrolling before the first snap offset
                if offsetAlongAxis > firstOffset { targetOffset = firstOffset }
            } else if velocityAlongAxis > 0 {
                targetOffset = largerOffset
            } else if velocityAlongAxis < 0 {
                targetOffset = smallerOffset
            } else {
                targetOffset = nearestOffset
            }
        }

        // Make sure the new offset isn't out of bounds
        targetOffset = min(max(0, targetOffset), maximumOffset)
        target.rect.origin.x = targetOffset

        // onScrollEndDrag -> scheduleCommit (on the screen, next run-loop turn).
        let sig = self.signals
        onNextRunLoop { sig.dragEnds += 1 }
    }
}

/**
 * The range-chip row: chips take their content width and never shrink; with room to spare they
 * share the leftover equally (RN: content container flexGrow 1 at least the viewport wide, each
 * chip wrapper flexGrow 1 / flexShrink 0 / flexBasis 'auto'); without it the row overflows and
 * its ScrollView scrolls.
 */
// `SwiftUI.Layout`: inside this module `Layout` is Theme/Layout.swift's constants enum.
private struct WalletChipRow: SwiftUI.Layout {
    var gap: CGFloat
    var minWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let content = sizes.reduce(CGFloat(0)) { $0 + $1.width } + gap * CGFloat(max(0, subviews.count - 1))
        let h = sizes.map { $0.height }.max() ?? 0
        return CGSize(width: max(content, minWidth), height: h)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        let content = sizes.reduce(CGFloat(0)) { $0 + $1.width } + gap * CGFloat(max(0, subviews.count - 1))
        let extra = subviews.isEmpty ? 0 : max(0, bounds.width - content) / CGFloat(subviews.count)
        var x = bounds.minX
        for (i, s) in subviews.enumerated() {
            let w = sizes[i].width + extra
            // Row alignItems stretch: every chip is as tall as the row.
            s.place(at: CGPoint(x: x, y: bounds.minY), anchor: .topLeading, proposal: ProposedViewSize(width: w, height: bounds.height))
            x += w + gap
        }
    }
}

/**
 * Where a card's appearance comes from is decided by CardArtResolver: the user's own photo, a
 * design they picked, network-issued art, our catalog for the bank, then the bank's Plaid colour
 * + logo. No data source returns what a specific physical card looks like, so only the first is
 * an exact match — see that file for the full ordering and why.
 */
struct WalletView: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(DataStore.self) private var data
    @Environment(AuthStore.self) private var auth
    @Environment(Router.self) private var router
    @Environment(\.safeInsets) private var insets
    @Environment(\.windowSize) private var win
    @Environment(\.isScreenFocused) private var focused

    // RN also read `usePremium().status` here; nothing used it.

    @State private var index = 0
    @State private var preset: RangePreset = .thisMonth
    @State private var pickOpen = false
    @State private var rStart: Date?
    @State private var rEnd: Date?

    // Per-card breakdown comes from the API (real Plaid charges), NOT from local charge
    // expansion, which is why this screen once listed Netflix, Apple Music and Disney+ for a user
    // who had connected no bank at all.
    @State private var merchants: [WalletBreakdownRow] = []
    @State private var loadingBreakdown = false
    /** Last fetch for the card on screen failed AND there was no cache to fall back on. A
     *  swallowed network failure must not render as "$0.00 drained" — same rule the savings tab
     *  enforces with its error banner. */
    @State private var breakdownError = false
    /** Bumped by the error banner's Retry to re-run the fetch effect. */
    @State private var retryNonce = 0
    /** Recurring charges projected to land inside the current range that haven't posted yet —
     *  see GET /wallet/instruments/:id/merchants. Shown only when `merchants` is empty, so a real
     *  $0 range (nothing was ever due) still reads as $0, not as a false "predicted" claim. */
    @State private var predicted: [PredictedCharge] = []

    @State private var refs = WalletRefs()
    @State private var signals = WalletCarouselSignals()
    @State private var artPrefs = CardArtPrefsModel()

    /// App/TabsView.swift constructs `WalletView()`.
    init() {}

    // ONLY real Plaid instruments. There is no demo fallback: these must be the cards the
    // subscriptions are genuinely billed to, so a card on this screen that the user does not hold
    // in their wallet is a lie about their money. The palette is presentation only — it tints a
    // real card, it never invents one.
    private var cards: [WalletCard] {
        data.instruments.enumerated().map { pair -> WalletCard in
            let i = pair.offset
            let inst = pair.element
            // Fallback skin for when the resolver has no bank match and Plaid gave no colour: the
            // bank's Plaid colour if present, else a cycling skin.
            let fallback: CardArtFallback
            if let hint = inst.issuerColorHint, !hint.isEmpty {
                fallback = brandSkin(hint)
            } else {
                fallback = BANK_CARD_SKINS[i % BANK_CARD_SKINS.count]
            }
            let institution = inst.institutionName ?? ""
            return WalletCard(
                id: inst.id,
                // The bank's name leads, matching every real card in existence — the account
                // nickname ("Spend") used to sit here instead, which is why the card read as
                // generic even with the right color and a real chip.
                name: !institution.isEmpty ? institution : (!inst.displayName.isEmpty ? inst.displayName : "Account"),
                accountLabel: !institution.isEmpty ? inst.displayName : nil,
                network: inst.brand.isEmpty ? "CARD" : inst.brand.uppercased(),
                last4: inst.last4,
                input: CardArtInput(
                    institutionName: inst.institutionName,
                    displayName: inst.displayName,
                    brand: inst.brand,
                    issuerColorHint: inst.issuerColorHint,
                    logoUri: inst.networkArt,
                    networkTokenArtUri: inst.networkTokenArtUri
                ),
                fallback: fallback,
                // Never written back (the subs pill on the card art is gone); kept as in RN.
                subs: 0
            )
        }
    }

    private var range: (start: Date, end: Date) {
        // The picker hands back the chosen END day at 00:00; the API filters `date <= end`, so
        // send the end of that day or its charges are lost.
        if preset == .custom, let s = rStart, let e = rEnd { return (start: s, end: endOfDay(e)) }
        return presetRange(preset == .custom ? .thisMonth : preset)
    }

    private var drained: Int { merchants.reduce(0) { $0 + $1.totalCents } }

    private var chipLabel: String {
        if preset == .custom, let s = rStart, let e = rEnd {
            return "\(WalletDateFormat.monthDay(s)) – \(WalletDateFormat.monthDay(e))"
        }
        return "Custom"
    }

    private var holderName: String {
        // The account holder's actual name, not a generic "EZER MEMBER" — a real linked card
        // branded with the app's name instead of the person who owns it reads as a demo card.
        let n = auth.user?.name ?? ""
        return n.isEmpty ? "EZER MEMBER" : n
    }

    var body: some View {
        let colors = theme.colors
        let all = cards
        let active: WalletCard? = all.isEmpty ? nil : all[min(index, all.count - 1)]
        let r = range
        let fetchKey = WalletFetchKey(
            cardId: active?.id, preset: preset, rStart: rStart, rEnd: rEnd,
            start: r.start, end: r.end, retry: retryNonce
        )

        ZStack(alignment: .topLeading) {
            colors.bg.ignoresSafeArea()
            ScrollViewReader { page in
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 0) {
                        // Scroll target for "scroll to the top on a card switch" (offset 0).
                        Color.clear.frame(height: 0).id(WALLET_PAGE_TOP)
                        ScreenBody {
                            VStack(alignment: .leading, spacing: 0) {
                                header(colors)
                                carousel(all, colors)
                                VStack(alignment: .leading, spacing: 0) {
                                    chips(colors)
                                    total(colors)
                                    whereItGoes(colors)
                                    cta(colors)
                                }
                                .padding(.horizontal, Layout.screenX)
                            }
                        }
                        .padding(.top, insets.top + 10)
                        .padding(.bottom, insets.bottom + Layout.tabBottom)
                        .tabMark()
                    }
                    // RN bounces={false} (overScrollMode="never" is Android-only).
                    .rnNoBounce()
                }
                .scrollIndicators(.hidden)
                .onChange(of: fetchKey, initial: true) { _, key in
                    runBreakdownEffect(key, page: page)
                }
            }
        }
        .rnScreen()
        // Warm the cache for every card × fixed preset as soon as the cards are known.
        .onChange(of: data.instruments, initial: true) { prefetch() }
        // useCardArtPrefs(cardIds): any card look the user already picked before "Match my card"
        // was removed (a photo, a chosen design) still renders. No UI here sets a new one.
        .onChange(of: all.map { $0.id }, initial: true) { _, ids in artPrefs.load(ids) }
        .premiumGate()
        // An overlay sheet, not part of the page: opening or closing it must never change the
        // page's height (see RangeCalendar's header). It animates its own scrim and slide.
        .rnModal(isPresented: pickOpen, animationType: .none) {
            RangeCalendar(
                initialStart: rStart,
                initialEnd: rEnd,
                quote: { s, e in await quoteRange(s, e) },
                onClose: { r in onPickClose(r) }
            )
            // DEBUG builds: Documents/screens/wallet-range-calendar-<mode>.png
            .debugScreenCapture("wallet-range-calendar", active: focused)
        }
    }

    /// The range picker's footer total. Goes through the same cache as the breakdown effect, so
    /// a quote fetched while the sheet is open makes Done a same-frame cache hit: the total rolls
    /// once, straight to the new figure, instead of sitting on the old one for a round trip.
    private func quoteRange(_ start: Date, _ endDay: Date) async -> Int? {
        let all = cards
        guard !all.isEmpty else { return nil }
        let cardId = all[min(index, all.count - 1)].id
        let r = (start: start, end: endOfDay(endDay))
        func sum(_ b: WalletBreakdown) -> Int { b.merchants.reduce(0) { $0 + $1.totalCents } }
        let hit = refs.cache[keyFor(cardId, r)]
        if let hit, nowMs() - hit.at < BREAKDOWN_FRESH_MS { return sum(hit.b) }
        let res = await fetchBreakdown(cardId, r)
        if res.ok { return sum(res.b) }
        return hit.map { sum($0.b) }
    }

    /// Picker closed. Only a complete range changes anything — one update, after the sheet has
    /// already left the screen.
    private func onPickClose(_ r: (start: Date, end: Date)?) {
        pickOpen = false
        guard let r else { return }
        rStart = r.start
        rEnd = r.end
        preset = .custom
    }

    // MARK: - Sections

    private func header(_ colors: ThemeColors) -> some View {
        // The EZER is TabMark (`.tabMark()` on the page), locked in the same place as on the other tabs.
        HStack(alignment: .center, spacing: 0) {
            Text("Wallet")
                .typeStyle(TypeScale.screenTitle)
                .foregroundStyle(colors.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, Layout.screenX)
    }

    private func carousel(_ all: [WalletCard], _ colors: ThemeColors) -> some View {
        let m = WalletCarouselMetrics(screenW: win.width)
        let snapOffsets = all.indices.map { m.cardOffset($0) }
        // Resolved per (cards, prefs): same inputs, same `art` value for BankCardFace.
        let arts = all.map { resolveCardArt($0.input, artPrefs.prefs[$0.id] ?? CardArtPrefs(), $0.fallback) }
        let holder = holderName

        return ScrollViewReader { carouselProxy in
            VStack(alignment: .leading, spacing: 0) {
                // --- card carousel ---------------------------------------------------------
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: CARD_GAP) {
                        ForEach(Array(all.enumerated()), id: \.element.id) { i, c in
                            BankCardFace(
                                art: arts[i],
                                bankName: c.name,
                                accountLabel: c.accountLabel,
                                network: c.network,
                                last4: c.last4,
                                holderName: holder,
                                width: WALLET_CARD_W,
                                height: WALLET_CARD_H
                            )
                            .id(c.id)
                        }
                    }
                    .padding(.horizontal, m.sidePad)
                    .padding(.top, 18)
                    .background(WalletFastDeceleration(signals: signals).allowsHitTesting(false))
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        -proxy.frame(in: .named(WALLET_CAROUSEL_SPACE)).minX
                    } action: { x in
                        signals.x = x
                        // onMomentumScrollEnd: while the release settles, every move resets the clock.
                        if refs.settling { scheduleCommit(x) }
                    }
                }
                .coordinateSpace(.named(WALLET_CAROUSEL_SPACE))
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(
                    WalletSnapBehavior(
                        offsets: snapOffsets,
                        maximumOffset: m.maximumOffset(all.count),
                        signals: signals
                    )
                )
                .onChange(of: signals.dragEnds) {
                    // onScrollEndDrag: "maybe settled, reset the clock".
                    refs.settling = true
                    scheduleCommit(signals.x)
                }

                // --- page dots -------------------------------------------------------------
                // Tappable, so there is a way to change card that does not depend on the
                // gesture — and so the dots are not the only control on screen that looks
                // interactive but is not.
                HStack(alignment: .center, spacing: 6) {
                    ForEach(Array(all.enumerated()), id: \.element.id) { i, c in
                        let on = i == index
                        Button {
                            index = i
                            withAnimation { carouselProxy.scrollTo(c.id, anchor: .center) }
                        } label: {
                            rnRect(4)
                                .fill(on ? colors.gold : colors.line2)
                                .frame(width: on ? 22 : 7, height: 7)
                                .hitSlop(10)
                        }
                        .buttonStyle(PlainPressStyle())
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 14)
            }
            // useFocusEffect([cards.length, index]): re-assert the carousel position for `index`
            // whenever the screen regains focus (and whenever index changes while focused), two
            // frames later so the scroll view has committed its layout. Not animated.
            .onChange(of: WalletFocusKey(focused: focused, count: all.count, index: index), initial: true) { _, k in
                refs.focusGen += 1 // cleanup: cancelAnimationFrame
                guard k.focused, k.count > 0 else { return }
                let id = all[min(k.index, k.count - 1)].id
                let gen = refs.focusGen
                let rf = self.refs
                onNextRunLoop {
                    onNextRunLoop {
                        guard rf.focusGen == gen else { return }
                        carouselProxy.scrollTo(id, anchor: .center)
                    }
                }
            }
        }
    }

    private func chips(_ colors: ThemeColors) -> some View {
        let defs: [WalletChipDef] = [
            WalletChipDef(key: .custom, label: chipLabel),
            WalletChipDef(key: .thisMonth, label: "This month"),
            WalletChipDef(key: .lastMonth, label: "Last month"),
            WalletChipDef(key: .ytd, label: "YTD"),
        ]
        // A horizontal scroller, not a fixed row: the chips take their content width and never
        // shrink, so "This month"/"Last month" cannot be clipped at any screen width or system
        // font scale. With room to spare the row still fills the width; without it, it scrolls.
        return ScrollView(.horizontal) {
            WalletChipRow(gap: 6, minWidth: max(0, win.width - Layout.screenX * 2)) {
                ForEach(defs, id: \.key) { def in
                    let key = def.key
                    let label = def.label
                    let on = preset == key
                    PressScale(scaleTo: 0.95, action: {
                        // Custom only OPENS the picker. The preset (and so the numbers) change
                        // when a complete range is applied — never to a half-picked one, which
                        // used to fall back to "This month" and swap the totals mid-pick.
                        if key == .custom { pickOpen = true } else { preset = key }
                    }) {
                        Text(label)
                            .font(.custom(FontFamily.bold, size: 11))
                            .foregroundStyle(on ? Color(css: "#FFFFFF") : colors.ink)
                            .lineLimit(1)
                            // Only the Custom chip's label can grow (a picked range renders as
                            // "Sep 1 – Sep 30"), so only it fit-shrinks.
                            .minimumScaleFactor(key == .custom ? 0.8 : 1)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 9)
                            .padding(1) // borderWidth 1 takes layout space in RN
                            .frame(maxWidth: .infinity)
                            .background(Capsule().fill(on ? colors.goldBg : colors.card))
                            .overlay(Capsule().strokeBorder(on ? colors.goldBg : colors.line, lineWidth: 1))
                    }
                }
            }
            .padding(.horizontal, Layout.screenX)
        }
        .scrollIndicators(.hidden)
        .padding(.top, 20)
        // Bleed to the screen edges so a scrolled row runs under the page padding instead of
        // being clipped at it; the content pads itself back.
        .padding(.horizontal, -Layout.screenX)
    }

    @ViewBuilder
    private func total(_ colors: ThemeColors) -> some View {
        // A failed load must not render as "$0.00 drained" — same banner pattern as the savings tab.
        if breakdownError {
            Surface(borderColor: Color(css: theme.tokens.red + "55")) {
                HStack(alignment: .center, spacing: 9) {
                    Ionicon("cloud-offline-outline", size: 16, color: colors.red)
                    Text("Could not load this card's charges.")
                        .font(.custom(FontFamily.medium, size: 12))
                        .foregroundStyle(colors.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button { retryNonce += 1 } label: {
                        Text("Retry")
                            .font(.custom(FontFamily.bold, size: 12))
                            .foregroundStyle(colors.accInk)
                            .hitSlop(8)
                    }
                    .buttonStyle(PlainPressStyle())
                }
                .padding(12)
                .padding(1)
            }
            .padding(.top, 16)
        } else {
            let predictedTotal = predicted.reduce(0) { $0 + $1.amountCents }
            Surface {
                VStack(alignment: .leading, spacing: 0) {
                    Label("Total drained")
                    // Rolls digit by digit when the range changes, not a jump.
                    RollingNumber(value: formatCents(drained), style: TypeScale.totalValue, color: colors.red)
                        .padding(.top, 4)
                    // "0 active subscriptions" directly above a "$450.12 predicted" pill read as
                    // contradictory. When there's nothing real to report but there IS a predicted
                    // count, say that instead of a bare zero.
                    BodyText(
                        merchants.isEmpty && !loadingBreakdown && !predicted.isEmpty
                            ? "\(predicted.count) subscription\(predicted.count == 1 ? "" : "s") predicted to charge"
                            : "\(merchants.count) active subscription\(merchants.count == 1 ? "" : "s") on this card"
                    )
                    .padding(.top, 2)
                    // Only when there are zero REAL charges — a range with any real charge already
                    // tells the true story, so this never overrides an actual number with a guess.
                    if !loadingBreakdown && merchants.isEmpty && !predicted.isEmpty {
                        HStack(alignment: .center, spacing: 6) {
                            Ionicon("time-outline", size: 13, color: colors.gold)
                            Text("Nothing charged yet — \(formatCents(predictedTotal)) predicted")
                                .font(.custom(FontFamily.semibold, size: 11.5))
                                .foregroundStyle(colors.gold)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .padding(1)
                        .background(Capsule().fill(colors.goldSoft))
                        .overlay(Capsule().strokeBorder(colors.gold, lineWidth: 1))
                        .padding(.top, 10)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .padding(1)
            }
            .padding(.top, 16)
        }
    }

    private func whereItGoes(_ colors: ThemeColors) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SectionHeader("Where it goes")
                .padding(.top, 24)
                .padding(.bottom, 10)

            VStack(alignment: .leading, spacing: 8) {
                ForEach(merchants, id: \.merchantId) { m in
                    PressScale(action: {
                        // No active/trial Subscription row for this merchant — e.g. it was since
                        // cancelled. Nothing to open rather than a 404.
                        guard let sid = m.subscriptionId, !sid.isEmpty else { return }
                        router.push("/screens/SubscriptionDetail", ["id": sid])
                    }) {
                        Surface {
                            HStack(alignment: .center, spacing: 12) {
                                MerchantMark(name: m.merchantName, merchantId: m.merchantId, size: 40)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(m.merchantName)
                                        .font(.custom(FontFamily.bold, size: 14.5))
                                        .foregroundStyle(colors.ink)
                                        .lineLimit(1)
                                    Text("\(m.count) charge\(m.count == 1 ? "" : "s") in range")
                                        .font(.custom(FontFamily.regular, size: 11.5))
                                        .foregroundStyle(colors.mut)
                                        .padding(.top, 2)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text(formatCents(m.totalCents))
                                    .font(.custom(FontFamily.bold, size: 14))
                                    .foregroundStyle(colors.red)
                            }
                            .padding(12)
                            .padding(1)
                        }
                    }
                }

                if merchants.isEmpty && !breakdownError {
                    BodyText("No charges on this card in the selected range.")
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 12)
                }
            }
        }
    }

    private func cta(_ colors: ThemeColors) -> some View {
        PressScale(action: { router.push("/screens/DrainReview") }) {
            HStack(alignment: .center, spacing: 8) {
                Ionicon("cut-outline", size: 17, color: Color(css: "#FFFFFF"))
                Text("Review card drain")
                    .font(.custom(FontFamily.bold, size: 14.5))
                    .foregroundStyle(Color(css: "#FFFFFF"))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(rnRect(Radius.buttonLg).fill(colors.accent))
        }
        .padding(.top, 20)
    }

    // MARK: - Index tracking

    /** Inverse of cardOffset(): undo the leading offset before dividing. */
    private func nearestIndex(_ x: CGFloat) -> Int {
        let m = WalletCarouselMetrics(screenW: win.width)
        let i = Int(jsRound(Double((x - m.firstOffset) / CARD_STEP)))
        return max(0, min(i, cards.count - 1))
    }

    /**
     * Index tracking runs off real settle events. A fast flick ends the drag and then the
     * momentum; both reset one 100ms clock, so whichever is actually LAST wins, however many fire
     * and in whatever order, with no guessing. Then commit the nearest card.
     */
    private func scheduleCommit(_ offsetX: CGFloat) {
        refs.settleTask?.cancel()
        refs.settleTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 100_000_000)
            if Task.isCancelled { return }
            refs.settleTask = nil
            refs.settling = false
            let i = nearestIndex(offsetX)
            if i != index { index = i }
        }
    }

    // MARK: - Breakdown (per card × range, cached)

    // Keyed on calendar DAYS, not instants: a range's end is a day boundary from the user's point
    // of view, and keying on toISOString() meant any sub-day drift in how the end was computed
    // (YTD once ended at "now") produced a key no earlier fetch could ever match.
    private func dayKey(_ d: Date) -> String {
        let p = jsParts(d)
        return "\(p.year)-\(p.month + 1)-\(p.day)"
    }

    private func keyFor(_ cardId: String, _ r: (start: Date, end: Date)) -> String {
        "\(cardId)|\(dayKey(r.start))|\(dayKey(r.end))"
    }

    private func cacheSet(_ key: String, _ entry: WalletCacheEntry) {
        if refs.cache[key] == nil { refs.cacheOrder.append(key) }
        refs.cache[key] = entry
        // ponytail: FIFO eviction via Map insertion order, cap 50; make it LRU if custom ranges
        // ever churn the cache in one session.
        while refs.cache.count > 50, let first = refs.cacheOrder.first {
            refs.cacheOrder.removeFirst()
            refs.cache.removeValue(forKey: first)
        }
    }

    private func fetchBreakdown(_ cardId: String, _ r: (start: Date, end: Date)) async -> (b: WalletBreakdown, ok: Bool) {
        let res = await data.getMerchants(cardId, "custom", (startDate: toISOString(r.start), endDate: toISOString(r.end)))
        let b = WalletBreakdown(
            merchants: res.merchants.map { m in
                WalletBreakdownRow(
                    merchantId: m.merchantId,
                    merchantName: m.merchantName,
                    logo: m.logo,
                    totalCents: m.totalDrainedCents,
                    count: m.chargeCount,
                    // The real Subscription id, not merchantId standing in for it —
                    // GET /subscriptions/:id looks up by the Subscription row's own primary key.
                    subscriptionId: m.subscriptionId
                )
            },
            predicted: res.predicted
        )
        // Only a genuine answer enters the cache. getMerchants swallows network failures into
        // empty rows; stamping those as fresh would pin "$0 / no charges" on every tap and swipe
        // for BREAKDOWN_FRESH_MS after the connection (or a paused API) came back.
        if res.ok { cacheSet(keyFor(cardId, r), WalletCacheEntry(b: b, at: nowMs())) }
        return (b: b, ok: res.ok)
    }

    private func runBreakdownEffect(_ key: WalletFetchKey, page: ScrollViewProxy) {
        // onChange(initial:) can fire again when the screen re-appears; RN's effect only re-ran
        // when an input changed.
        if refs.lastEffectKey == key { return }
        refs.lastEffectKey = key
        // Cleanup of the previous run: `cancelled = true`.
        refs.effectTask?.cancel()
        refs.effectTask = nil

        guard let cardId = key.cardId else {
            merchants = []
            predicted = []
            refs.merchantsCardId = nil
            return
        }

        let switchedCard = refs.merchantsCardId != cardId

        if switchedCard {
            // Hold the previous card's numbers on screen for the ~700ms a real fetch takes, then
            // swap them in place once (reads as a normal refresh, not a wrong number).
            loadingBreakdown = true
            // A new card's merchant list is usually a different length, which shrinks the page;
            // scrolling to the top ourselves, right when the switch happens, turns the native
            // offset clamp into a deliberate, smooth transition.
            withAnimation { page.scrollTo(WALLET_PAGE_TOP, anchor: .top) }
        }
        // else: same card, only the date range changed (a preset tap). Leave the current rows on
        // screen; they get replaced in place once the new numbers land. No loading state, and no
        // layout animation (it would sweep the carousel too).
        refs.merchantsCardId = cardId

        // ALWAYS send explicit dates computed on the DEVICE rather than letting the server
        // recompute "this month" from its own (UTC) clock.
        let r = (start: key.start, end: key.end)

        // Cache hit: apply on this same tick, so the tap and the new numbers land together.
        let hit = refs.cache[keyFor(cardId, r)]
        if let hit {
            merchants = hit.b.merchants
            predicted = hit.b.predicted
            loadingBreakdown = false
            breakdownError = false
        }

        // A hit younger than BREAKDOWN_FRESH_MS is current enough to stand on its own.
        let fresh = hit.map { nowMs() - $0.at < BREAKDOWN_FRESH_MS } ?? false
        if !fresh {
            refs.effectTask = Task { @MainActor in
                // The fetch itself is not cancelled with the effect (RN's promise kept running and
                // still filled the cache); only the state writes below are skipped.
                let res = await Task { @MainActor in await fetchBreakdown(cardId, r) }.value
                if Task.isCancelled { return }
                // .finally(() => { if (!cancelled) setLoadingBreakdown(false) })
                defer { loadingBreakdown = false }
                if !res.ok {
                    // getMerchants swallowed a network failure into empty rows. With a cache hit
                    // the stale-but-real numbers stay on screen; without one there is nothing
                    // honest to show, so show the error instead of rows that render as "$0.00".
                    if hit == nil {
                        merchants = []
                        predicted = []
                        breakdownError = true
                    }
                    return
                }
                breakdownError = false
                // Same numbers as what is already on screen: leave the list alone.
                if let hit, hit.b == res.b { return }
                merchants = res.b.merchants
                predicted = res.b.predicted
            }
        }
    }

    // Warm the cache for every card × fixed preset as soon as the cards are known (2 cards × 3
    // presets = 6 small requests, once). After this, every preset tap and every card swipe is a
    // cache hit. 'custom' is skipped — its range is whatever the picker says.
    // (RN re-ran this on every new `instruments` array; SwiftUI's onChange only fires when the
    // instruments actually differ.)
    private func prefetch() {
        for c in cards {
            for p in [RangePreset.thisMonth, .lastMonth, .ytd] {
                let r = presetRange(p)
                if refs.cache[keyFor(c.id, r)] != nil { continue }
                let id = c.id
                Task { @MainActor in _ = await fetchBreakdown(id, r) }
            }
        }
    }
}

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
//   · snapToOffsets -> SwiftUI's own .viewAligned snapping (WalletSnapBehavior wraps it only to
//     learn that a drag ended), with the centring padding as safe-area padding so every card
//     rests at the same left inset.
//   · onScrollEndDrag / onMomentumScrollEnd -> scheduleCommit: the drag end (updateTarget) and
//     every offset change after it reset one 100ms clock; the index commits once it runs out.
//   · useFocusEffect -> .onChange(of: focus key, initial: true); tabs stay mounted.
//   · Refs (merchantsCardId, the breakdown cache, timers) live in WalletRefs, which nothing
//     observes, exactly like useRef.

import SwiftUI

/** How long a cached per-range breakdown stands without a re-fetch behind it. */
private let BREAKDOWN_FRESH_MS: Double = 60_000

// RN names CARD_W / CARD_H (renamed: CardCanvas exports CARD_W / CARD_H for the physical card
// and the module namespace is shared).
private let WALLET_CARD_W: CGFloat = 300
private let WALLET_CARD_H: CGFloat = 178
private let CARD_GAP: CGFloat = 14

// --- carousel snap maths -----------------------------------------------------
//
// The cards sit in a .scrollTargetLayout() HStack with CENTER_PAD of safe-area padding on both
// sides, and .viewAligned snaps a card's leading edge to that padding: every card rests at
// exactly CENTER_PAD from the left, with equal peeks either side. Scroll x (0 at card 0) for card
// i is i * CARD_STEP. There is deliberately no hand-computed snap target: the old one (RN's
// snapToOffsets maths fed through a custom ScrollTargetBehavior) and the post-settle
// scrollTo(.center) disagreed, so every settle ended in a second, visible jump.
private let CARD_STEP: CGFloat = WALLET_CARD_W + CARD_GAP

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

/// One "Where it goes" row; equatable on its data so an unrelated Wallet update skips it.
private struct WalletMerchantRow: View, Equatable {
    let m: WalletBreakdownRow
    let ink: Color
    let mut: Color
    let red: Color
    let onTap: () -> Void

    static func == (a: Self, b: Self) -> Bool {
        a.m == b.m && a.ink == b.ink && a.mut == b.mut && a.red == b.red
    }

    var body: some View {
        PressScale(action: onTap) {
            Surface {
                HStack(alignment: .center, spacing: 12) {
                    MerchantMark(name: m.merchantName, merchantId: m.merchantId, size: 40)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(m.merchantName)
                            .font(.custom(FontFamily.bold, size: 14.5))
                            .foregroundStyle(ink)
                            .lineLimit(1)
                        Text("\(m.count) charge\(m.count == 1 ? "" : "s") in range")
                            .font(.custom(FontFamily.regular, size: 11.5))
                            .foregroundStyle(mut)
                            .padding(.top, 2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(formatCents(m.totalCents))
                        .font(.custom(FontFamily.bold, size: 14))
                        .foregroundStyle(red)
                }
                .padding(12)
                .padding(1)
            }
        }
    }
}

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
}

/// useRef values. A plain class nothing observes: writing these never re-renders.
private final class WalletRefs {
    /** Which card's data `merchants` currently holds, so the effect can tell "the card changed"
     *  apart from "only the date range changed" on the SAME card. */
    var merchantsCardId: String?
    /// breakdownCache (a Map): entries plus insertion order.
    var cache: [String: WalletCacheEntry] = [:]
    var cacheOrder: [String] = []
    /// One request per (card, days) at a time: a swipe onto a card whose prefetch is still in
    /// flight joins it instead of queueing a duplicate behind the other prefetches (the "4 seconds
    /// to show the numbers after switching card" report, Oct 12 2026).
    var inflight: [String: Task<(b: WalletBreakdown, ok: Bool), Never>] = [:]
    var effectTask: Task<Void, Never>?
    var lastEffectKey: WalletFetchKey?
    var settleTask: Task<Void, Never>?
    /// Between a drag's end and the commit: offset changes (the snap) reset the settle clock.
    var settling = false
    /// The card `index` already points at while the scroll is still on its way there (a dot's
    /// animated scroll, or a swipe's snap target at release). Midpoint commits wait until it
    /// arrives: they flipped a dot tap back to the old card for ~140ms (Oct 21 2026).
    var target: Int?
    /// rafRef: bumping it cancels a pending focus re-assert.
    var focusGen = 0
}

/// The carousel's live offset (written every frame, observed by nothing) and a drag-end counter
/// (observed by the screen). Shared with WalletSnapBehavior, which may run off the main actor's
/// static isolation, hence @unchecked Sendable; every write happens on the main thread.
@Observable
private final class WalletCarouselSignals: @unchecked Sendable {
    @ObservationIgnored var x: CGFloat = 0
    /// Where the release will come to rest, as scroll x.
    @ObservationIgnored var targetX: CGFloat = 0
    var dragEnds = 0
}

/// SwiftUI's .viewAligned snapping, unchanged; wrapped only so a drag end (onScrollEndDrag) can
/// start the settle clock and commit the card the release is heading for.
private struct WalletSnapBehavior: ScrollTargetBehavior {
    let signals: WalletCarouselSignals

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        ViewAlignedScrollTargetBehavior(limitBehavior: .always).updateTarget(&target, context: context)
        let sig = self.signals
        // The rect is centred on the resting card whether or not it counts the side padding, so
        // its centre gives scroll x (i * CARD_STEP) without knowing where the inset puts its origin.
        let tx = target.rect.midX - WALLET_CARD_W / 2
        onNextRunLoop {
            sig.targetX = tx
            sig.dragEnds += 1
        }
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
                    prefetch() // a new range (e.g. a custom one) warms every card too
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

    /// The Custom chip. The picker is a full-screen modal, so while it is really on screen the chip
    /// cannot be tapped: a tap that finds `pickOpen` already true means the presentation never
    /// showed (or was torn down without onClose). Re-present instead of the old no-op
    /// `pickOpen = true`, which left every further tap dead.
    private func openPicker() {
        guard pickOpen else { pickOpen = true; return }
        pickOpen = false
        onNextRunLoop { pickOpen = true }
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
        let centerPad = max(0, (win.width - WALLET_CARD_W) / 2)
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
                    .scrollTargetLayout()
                    .padding(.top, 18)
                    .onGeometryChange(for: CGFloat.self) { proxy in
                        centerPad - proxy.frame(in: .named(WALLET_CAROUSEL_SPACE)).minX
                    } action: { x in
                        signals.x = x
                        // Commit the moment the offset crosses the midpoint between two cards, not
                        // after the glide settles: with every card prefetched, the numbers change
                        // while the card is still moving. The settle commit stays as the backstop.
                        // A pending target (dot tap, release) holds the index until it arrives.
                        let mid = nearestIndex(x)
                        if let t = refs.target {
                            if mid == t { refs.target = nil }
                        } else if mid != index {
                            index = mid
                        }
                        // onMomentumScrollEnd: while the release settles, every move resets the clock.
                        if refs.settling { scheduleCommit(x) }
                    }
                }
                .coordinateSpace(.named(WALLET_CAROUSEL_SPACE))
                .safeAreaPadding(.horizontal, centerPad)
                .scrollIndicators(.hidden)
                .scrollTargetBehavior(WalletSnapBehavior(signals: signals))
                .onChange(of: signals.dragEnds) {
                    // The snap target is known at release: switch the numbers now, not when the
                    // glide crosses the midpoint (~100ms later on a casual flick, Oct 21 2026).
                    let t = nearestIndex(signals.targetX)
                    refs.target = t
                    if t != index { index = t }
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
                            // Supersedes a swipe's pending settle commit, which would read the
                            // offset the dot is leaving.
                            refs.settleTask?.cancel()
                            refs.settling = false
                            refs.target = i
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
            // useFocusEffect([cards.length]): re-assert the carousel position for `index` whenever
            // the screen regains focus, two frames later so the scroll view has committed its
            // layout. Not animated. NOT keyed on index: an index commit lands after the snap has
            // already settled (or while a dot's animated scroll is running), and a second scroll
            // there is the jump the owner reported.
            .onChange(of: WalletFocusKey(focused: focused, count: all.count), initial: true) { _, k in
                refs.focusGen += 1 // cleanup: cancelAnimationFrame
                guard k.focused, k.count > 0 else { return }
                let id = all[min(index, k.count - 1)].id
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
                        if key == .custom { openPicker() } else { preset = key }
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
        // A horizontal ScrollView bounces even when its content fits, so a tap that drifted a few
        // points became a pan and cancelled the chip's Button: Custom "taking multiple clicks"
        // (Oct 13 2026). Only scroll when the chips actually overflow.
        .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
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
                // Only when there is nothing to show yet: a card switch is a cache hit and must not flash them.
                if loadingBreakdown && merchants.isEmpty { SkeletonRows(count: 4) }
                ForEach(merchants, id: \.merchantId) { m in
                    // Equatable: a card swipe re-renders the Wallet, and the rows whose numbers did
                    // not change must not re-render with it.
                    WalletMerchantRow(m: m, ink: colors.ink, mut: colors.mut, red: colors.red) {
                        // No active/trial Subscription row for this merchant — e.g. it was since
                        // cancelled. Nothing to open rather than a 404.
                        guard let sid = m.subscriptionId, !sid.isEmpty else { return }
                        router.push("/screens/SubscriptionDetail", ["id": sid])
                    }
                    .equatable()
                }

                if merchants.isEmpty && !breakdownError && !loadingBreakdown {
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

    /** Card under scroll x (0 at card 0, i * CARD_STEP at card i). */
    private func nearestIndex(_ x: CGFloat) -> Int {
        let i = Int(jsRound(Double(x / CARD_STEP)))
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
            refs.target = nil
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
        let k = keyFor(cardId, r)
        if let running = refs.inflight[k] { return await running.value }
        let task = Task { @MainActor in await loadBreakdown(cardId, r) }
        refs.inflight[k] = task
        let out = await task.value
        refs.inflight[k] = nil
        return out
    }

    private func loadBreakdown(_ cardId: String, _ r: (start: Date, end: Date)) async -> (b: WalletBreakdown, ok: Bool) {
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

    // Warm the cache for every card as soon as the cards are known, and again for the range on
    // screen whenever it changes (a custom range included). The range ON SCREEN goes out first
    // for EVERY card, so a swipe is a cache hit, and only then the other presets, so the requests
    // that matter are not queued behind ones that might never be looked at. fetchBreakdown dedupes
    // against the breakdown effect.
    private func prefetch() {
        let ranges = [range] + [RangePreset.thisMonth, .lastMonth, .ytd].map { presetRange($0) }
        for r in ranges {
            for c in cards {
                if refs.cache[keyFor(c.id, r)] != nil || refs.inflight[keyFor(c.id, r)] != nil { continue }
                let id = c.id
                Task { @MainActor in _ = await fetchBreakdown(id, r) }
            }
        }
    }
}

// =============================================================================
// EZER Redesign — Wallet (handoff §4)
//
// Horizontally snapping bank cards (300x178 r20) with animated page dots,
// range chips (Custom · This month · Last month · Year to date), the custom
// range picker, a serif-italic total drained card, "Where it goes" merchant
// rows and a "Review card drain" CTA.
//
// Range logic is the handoff's, implemented in utils/chargeOccurrences.ts:
// expand every subscription into monthly occurrences over the trailing 18
// months (charge day = renewal day, clamped to 28), filter to the range, group
// by merchant, and sum.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useAuth } from '../../utils/AuthContext';
import { usePremiumGate } from '../../utils/usePremiumGate';
import { usePremium } from '../../utils/PremiumContext';
import { useData, type PredictedCharge } from '../../contexts/DataContext';
import { formatCents } from '../../utils/calculations';
import { gradients } from '../../theme/tokens';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import {
  Body,
  Label,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
  Wordmark,
} from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import BankCardFace from '../../components/redesign/BankCardFace';
import { brandSkin } from '../../utils/cardArt/color';
import { resolveCardArt } from '../../utils/cardArt/resolver';
import { useCardArtPrefs } from '../../utils/cardArt/useCardArtPrefs';
import type { CardArtFallback, CardArtInput } from '../../utils/cardArt/types';
import RangeCalendar from '../../components/redesign/RangeCalendar';
// Only the date-range helper is still used here — the charge expansion in that
// module reads bundled demo subscriptions, and every figure on this screen now
// comes from the API instead.
import { presetRange, type RangePreset } from '../../utils/chargeOccurrences';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = 300;
const CARD_H = 178;
const CARD_GAP = 14;

// --- carousel snap maths -----------------------------------------------------
//
// Card i sits at content-x = SIDE_PAD + i * CARD_STEP (the contentContainer's
// left padding plus i cards and i gaps). To park that card in the middle of the
// viewport the scroll offset must be cardLeft - (SCREEN_W - CARD_W) / 2, i.e.
//
//   offset(i) = SIDE_PAD - CENTER_PAD + i * CARD_STEP
//
// With the usual SIDE_PAD === CENTER_PAD that collapses to i * CARD_STEP.
//
// The old code asked for snapToInterval={CARD_STEP} with
// snapToAlignment="center", which makes RN centre the *interval boundary* in
// the viewport: offset(i) = i * CARD_STEP - (SCREEN_W - CARD_STEP) / 2. On a
// 390pt screen that is every snap point shifted by 38pt, so releases settled
// between two cards and the carousel felt loose. snapToOffsets states the exact
// offsets and is immune to the padding maths entirely.
const CARD_STEP = CARD_W + CARD_GAP;
const CENTER_PAD = (SCREEN_W - CARD_W) / 2;
/** Never let the cards run under the screen gutter on very narrow devices. */
const SIDE_PAD = Math.max(layout.screenX, CENTER_PAD);
const FIRST_OFFSET = SIDE_PAD - CENTER_PAD;

const cardOffset = (i: number) => FIRST_OFFSET + i * CARD_STEP;

// --- web carousel parity -----------------------------------------------------
//
// react-native-web's ScrollView is a thin wrapper over a DOM scroller and it
// forwards exactly ONE scroll callback: `onScroll`. `onScrollEndDrag`,
// `onMomentumScrollEnd`, `snapToOffsets`, `snapToInterval` and
// `decelerationRate` all end up spread onto a <View>, where React DOM drops
// them as unknown props (see react-native-web/dist/exports/ScrollView —
// only `pagingEnabled` produces any CSS scroll-snap at all).
//
// Both wallet bugs came from that single fact:
//   * nothing snapped, because no snap prop reached the DOM; and
//   * every card showed the FIRST card's subscriptions and drain total,
//     because the index was only ever updated from the two drag/momentum
//     callbacks, so on web it never left 0.
//
// The first attempt at a fix re-implemented snapping in JS: track x in
// `onScroll`, wait for a quiet period, then scrollTo({animated:true}). That is
// what made the carousel feel loose — the browser's own momentum runs to a free
// stop first, THEN a second animation drags the card into place a beat later.
// Two competing animations, and a visible pause between them.
//
// The browser can do this natively. CSS scroll-snap is applied DURING the fling
// rather than after it, so the card is pulled into place as part of the same
// gesture. `scrollSnapType` is already used internally by react-native-web (it
// is how `pagingEnabled` works there), so both properties survive the style
// pipeline to the DOM.
//
// `onScroll` still runs on web, but only to keep `index` in sync — the snapping
// is no longer its job.
const IS_WEB = Platform.OS === 'web';

/** Scroll-snap container/child styles. Empty objects off web. */
const WEB_SNAP_CONTAINER = IS_WEB ? ({ scrollSnapType: 'x mandatory' } as any) : null;
// `center` centres the card in the scrollport. The scroller spans the full
// screen, so that lands on exactly the offsets cardOffset() computes for native.
const WEB_SNAP_CHILD = IS_WEB ? ({ scrollSnapAlign: 'center' } as any) : null;

interface WalletCard {
  id: string;
  name: string;
  /** The account's own nickname ("Spend"), shown smaller than `name` — a
   *  real card leads with the bank's name, not the account nickname. */
  accountLabel?: string;
  network: string;
  last4: string;
  /** What is known about the card, for utils/cardArt/resolver.ts. */
  input: CardArtInput;
  /** Skin used when the resolver has nothing better (the old cycling skins). */
  fallback: CardArtFallback;
  /** Distinct subscriptions billed to this card (derived, not hard-coded). */
  subs: number;
}

/**
 * SKINS ONLY — no card identities.
 *
 * This used to be a list of whole demo cards ("Sapphire Checking VISA •4821",
 * "Gold Rewards AMEX •1006") that rendered whenever no real instruments had
 * loaded. The result was a wallet showing cards the user had never linked,
 * while Settings listed a different invented set again.
 *
 * Now it carries appearance only. Names, networks and last-4 come from Plaid;
 * these just tint them, cycling if someone links more accounts than skins.
 */
const BANK_CARD_SKINS = [
  {
    gradient: gradients.bankSapphire,
    fg: '#FFFFFF',
    // Prototype uses .65 here, not .7.
    fgDim: 'rgba(255,255,255,.65)',
  },
  {
    gradient: gradients.bankGold,
    fg: '#241A38',
    fgDim: 'rgba(36,26,56,.6)',
  },
] as const;

/**
 * Where a card's appearance comes from is decided by utils/cardArt/resolver.ts:
 * the user's own photo, a design they picked, network-issued art, our catalog
 * for the bank, then the bank's Plaid colour + logo. No data source returns what
 * a specific physical card looks like, so only the first is an exact match —
 * see that file for the full ordering and why.
 */

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status: premiumStatus } = usePremium();
  const { instruments, getMerchants } = useData();
  const { user } = useAuth();

  usePremiumGate();

  const [index, setIndex] = useState(0);
  const [preset, setPreset] = useState<RangePreset>('thisMonth');
  const [pickOpen, setPickOpen] = useState(false);
  const [rStart, setRStart] = useState<Date | null>(null);
  const [rEnd, setREnd] = useState<Date | null>(null);

  // Prefer real instruments when the API is up; fall back to the demo cards so
  // the carousel is never empty in preview builds.
  // `subs` is derived per card rather than hard-coded, so the face count agrees
  // with the breakdown underneath it.
  // ONLY real Plaid instruments. There is no demo fallback: these must be the
  // cards the subscriptions are genuinely billed to, so a card on this screen
  // that the user does not hold in their wallet is a lie about their money.
  // The palette below is presentation only — it tints a real card, it never
  // invents one.
  const cards = useMemo<WalletCard[]>(
    () =>
      instruments.map((inst, i) => {
        // Fallback skin for when the resolver has no bank match and Plaid gave
        // no colour: the bank's Plaid colour if present, else a cycling skin.
        const fallback: CardArtFallback = inst.issuerColorHint
          ? brandSkin(inst.issuerColorHint)
          : BANK_CARD_SKINS[i % BANK_CARD_SKINS.length];
        return {
          id: inst.id,
          // The bank's name leads, matching every real card in existence —
          // the account nickname ("Spend") used to sit here instead, which
          // is why the card read as generic even with the right color and a
          // real chip: no real card's top line is an internal account label.
          name: inst.institutionName || inst.displayName || 'Account',
          accountLabel: inst.institutionName ? inst.displayName : undefined,
          network: inst.brand?.toUpperCase() || 'CARD',
          last4: inst.last4 ?? '',
          input: {
            institutionName: inst.institutionName,
            displayName: inst.displayName,
            brand: inst.brand,
            issuerColorHint: inst.issuerColorHint,
            logoUri: inst.networkArt,
            networkTokenArtUri: inst.networkTokenArtUri,
          },
          fallback,
          // Real count filled in at render time from `merchants` (the API
          // breakdown) for whichever card is currently active — see the
          // `subsCount` lookup below. This used to be hardcoded to 0 with a
          // comment promising it would be "filled in from the API
          // breakdown," which never actually happened: nothing ever wrote
          // back into this field, so the carousel always read "0 subs" no
          // matter how many charges the "Where it goes" list right below it
          // showed for the exact same card.
          subs: 0,
        };
      }),
    [instruments]
  );

  const active = cards[Math.min(index, cards.length - 1)];

  // Any card look the user already picked before "Match my card" was removed
  // (a photo, a chosen design) still renders — resolveCardArt() reads these
  // same prefs below. There is just no UI here to set a new one anymore.
  const cardIds = useMemo(() => cards.map(c => c.id), [cards]);
  const { prefs: artPrefs } = useCardArtPrefs(cardIds);

  /**
   * The count shown on a card; only the focused card has a fetched count.
   *
   * Hiding the pill entirely while `loadingBreakdown` was true — an earlier
   * version of this — was itself the bug: the pill box mounting and
   * unmounting on every single swipe IS the flicker, regardless of how clean
   * each individual appearance looks. The pill must stay mounted for the
   * active card the whole time; only the digit inside it may change. Since
   * `merchants` is cleared to [] the instant a card switch starts (so the
   * dollar amounts below never pair with the wrong card — see the merchants
   * effect), this naturally shows "0 subs" for a beat and then updates in
   * place to the real count once the fetch resolves, rather than the pill
   * disappearing and reappearing.
   */
  const subsLabelFor = (cardId: string): string | undefined => {
    if (cardId !== active?.id) return undefined;
    const n = merchants.length;
    return `${n} sub${n === 1 ? '' : 's'}`;
  };

  /**
   * Exact scroll offset that centres each card, per the derivation at the top
   * of this file: offset(i) = FIRST_OFFSET + i * CARD_STEP.
   *
   * snapToOffsets states each stop explicitly, so it cannot drift the way
   * snapToInterval did once the centring padding was factored in — that
   * mismatch is what made the carousel feel loose and land between cards.
   */
  const snapOffsets = useMemo(
    () => cards.map((_, i) => FIRST_OFFSET + i * CARD_STEP),
    [cards]
  );

  const range = useMemo(() => {
    if (preset === 'custom' && rStart && rEnd) return { start: rStart, end: rEnd };
    return presetRange(preset === 'custom' ? 'thisMonth' : preset);
  }, [preset, rStart, rEnd]);

  // Per-card breakdown comes from the API (real Plaid charges), NOT from
  // utils/chargeOccurrences, which expands the bundled demo subscriptions. That
  // is why this screen listed Netflix, Apple Music and Disney+ for a user who
  // had connected no bank at all.
  const [merchants, setMerchants] = useState<
    { merchantId: string; merchantName: string; logo?: string; totalCents: number; count: number; subscriptionId: string | null }[]
  >([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  /** Recurring charges projected to land inside the current range that
   *  haven't posted yet — see GET /wallet/instruments/:id/merchants. Shown
   *  only when `merchants` is empty, so a real $0 range (nothing was ever
   *  due) still reads as $0, not as a false "predicted" claim. */
  const [predicted, setPredicted] = useState<PredictedCharge[]>([]);
  /** Which card's data `merchants` currently holds, so the effect below can
   *  tell "the card changed" apart from "only the date range changed" on
   *  the SAME card — see the effect's own comment. */
  const merchantsCardId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const cardId = active?.id;

    if (!cardId) {
      setMerchants([]);
      setPredicted([]);
      merchantsCardId.current = undefined;
      return;
    }

    const switchedCard = merchantsCardId.current !== cardId;

    if (switchedCard) {
      // A genuinely different card's numbers have nothing to do with what's
      // on screen — clear immediately, not just once the new fetch
      // resolves. Leaving the old rows in place until then is exactly why
      // swiping cards flashed the wrong sub count — `active?.id` updates
      // synchronously, so the render briefly paired the new card with the
      // old card's still-in-state merchant list before the fetch below
      // caught up.
      setMerchants([]);
      setPredicted([]);
      setLoadingBreakdown(true);
      // The real "info shifts when I switch card" bug: a new card's merchant
      // list is usually a different length than the old one (often much
      // shorter, down to the "No charges on this card" empty state), which
      // shrinks the page's total content height. If the user had scrolled
      // down past where that new, shorter content ends, Android's ScrollView
      // snaps the offset back into bounds the instant the layout shrinks —
      // yanking the ENTIRE page, card included, up the screen in one frame.
      // That native clamp is what read as "the card art/number shifts" —
      // the card itself never moved, the page scrolled out from under it.
      // Scrolling to the top ourselves, right when the switch happens,
      // turns that into a deliberate, smooth transition instead of an
      // uncontrolled jump, and it reliably lands the new card's top at the
      // top of the page, matching a genuine card switch rather than a
      // same-card range update.
      pageRef.current?.scrollTo({ y: 0, animated: true });
    }
    // else: same card, only the date range changed (a preset tap). Leave
    // the current rows on screen rather than blanking the list for every
    // single range tap — they get replaced in place once the new numbers
    // land. No loading state either: this screen already has SOMETHING
    // real to show for this exact card, so there is nothing to "load" from
    // the user's perspective, only an update to apply once it arrives.
    //
    // Deliberately NOT using LayoutAnimation.configureNext here, even
    // though it would animate the reorder/fade nicely — it arms EVERY
    // layout change in the next render across the WHOLE screen, not just
    // this list, which made the card carousel above visibly shift/jump on
    // the exact same tap. A plain instant swap is a smaller visual price
    // than a global animation sweeping up views it was never meant to
    // touch.
    merchantsCardId.current = cardId;

    // ALWAYS send explicit dates computed on the DEVICE (`range`, from
    // presetRange() above — already correct for every preset, not just
    // 'custom') rather than letting the server recompute "this month" /
    // "last year" from its own clock. The server runs in UTC; a user west of
    // UTC near a month boundary — 9:23pm Sept 30 local is already 1:23am
    // Oct 1 UTC — had the server's own "this month" silently mean October
    // while every real charge was from September, so "This month" showed
    // $0 / 0 subs on a card with six active subscriptions. getDateRange's
    // preset cases (apps/api/.../utils.ts) still exist for any other caller
    // that doesn't have a device clock to compute from, but this screen
    // always has one, so it always uses it.
    getMerchants(cardId, 'custom', { startDate: range.start.toISOString(), endDate: range.end.toISOString() })
      .then(({ merchants: rows, predicted: predictedRows }) => {
        if (cancelled) return;
        setMerchants(
          rows.map(m => ({
            merchantId: m.merchantId,
            merchantName: m.merchantName,
            logo: m.logo,
            totalCents: m.totalDrainedCents,
            count: m.chargeCount,
            // The real Subscription id now, not merchantId standing in for
            // it — GET /subscriptions/:id looks up by the Subscription row's
            // own primary key, which a merchant id can never match. Every
            // tap 404'd as "Subscription not found" until the API started
            // actually resolving and returning this.
            subscriptionId: m.subscriptionId,
          }))
        );
        setPredicted(predictedRows);
      })
      .finally(() => {
        if (!cancelled) setLoadingBreakdown(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active?.id, preset, range.start, range.end, getMerchants]);

  const drained = merchants.reduce((s, m) => s + m.totalCents, 0);

  const chipLabel =
    preset === 'custom' && rStart && rEnd
      ? `${rStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${rEnd.toLocaleDateString(
          'en-US',
          { month: 'short', day: 'numeric' }
        )}`
      : 'Custom';

  const carouselRef = useRef<ScrollView>(null);
  const pageRef = useRef<ScrollView>(null);
  const rafRef = useRef<number | null>(null);

  /** Inverse of cardOffset(): undo the leading offset before dividing. */
  const nearestIndex = (x: number) =>
    Math.max(0, Math.min(Math.round((x - FIRST_OFFSET) / CARD_STEP), cards.length - 1));

  /**
   * The real cause of "a card that had subs now shows 0": `index` (which
   * decides whose data gets fetched, below) lives in this component's state,
   * but expo-router keeps tab screens mounted — switching to another tab and
   * back never resets it. The horizontal ScrollView's own scroll position,
   * though, is NOT guaranteed to survive that — Android can and does drop it
   * back to x:0 for an off-screen tab's native view. The result: you come
   * back to Wallet, see card 0 on screen (because the ScrollView reset), but
   * `index` still says 1, so the pill and "Where it goes" below are showing
   * card 1's numbers underneath a screen that's visibly displaying card 0.
   * No swipe, no glitch animation — just two sources of "which card" silently
   * disagreeing. Re-asserting the scroll position to match `index` every time
   * this screen regains focus is the actual fix, not another tweak to the
   * pill's own rendering — the pill was always correct for the index it was
   * given, the index just stopped matching what was on screen.
   *
   * `index` MUST be in this callback's own dependency array. Leaving it out
   * (matching it only on `cards.length`) is what broke the first two attempts
   * at this fix: the callback then only gets recreated when the card COUNT
   * changes, so after the very first swipe moves `index` away from 0, this
   * closure keeps the `index` it captured at mount — 0 — forever. Confirmed
   * on-device via logging: this effect kept scrolling back to card 0 on every
   * focus, fighting the correct state, while the dots (rendered fresh from
   * live state every render) correctly showed card 1 active the whole time.
   */
  useFocusEffect(
    useCallback(() => {
      if (cards.length === 0) return;
      const i = Math.min(index, cards.length - 1);
      // A single requestAnimationFrame fires before the tab's native surface
      // has actually finished re-attaching after being off-screen, so the
      // very first attempt at this silently no-ops — scrollTo on a ScrollView
      // that hasn't committed its layout yet just does nothing, with no
      // error. Nesting a second rAF defers it one more frame, past that
      // re-attach.
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => {
          carouselRef.current?.scrollTo({ x: cardOffset(i), animated: false });
        });
        rafRef.current = raf2;
      });
      rafRef.current = raf1;
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }, [cards.length, index])
  );

  /**
   * Index tracking runs off real scroll events, NOT Animated.event.
   *
   * An earlier version wrapped this in Animated.event with useNativeDriver and
   * passed it as `listener`. On the native-driven path that JS listener does
   * not fire reliably, so the card index only updated when some other
   * interaction forced a re-render — which is why the wallet totals appeared to
   * change on tap instead of on swipe.
   *
   * NATIVE: onMomentumScrollEnd fires when the platform snap settles, and
   * onScrollEndDrag covers a drag released without enough velocity to coast.
   *
   * A fast flick fires BOTH, in that order, and trusting onScrollEndDrag's
   * offset directly set the index to whatever card was under the finger at
   * release — BEFORE momentum carried it the rest of the way to its snap
   * point — fetched THAT card's sub count, and then onMomentumScrollEnd
   * corrected the index a moment later once the card actually settled. Two
   * commits for one real swipe, each re-running the full switchedCard cycle
   * (clear → loading → fetch → show): the pill disappearing and reappearing
   * multiple times.
   *
   * Two earlier attempts at this tried to guess WHICH event would arrive and
   * race a timer against it (first one requestAnimationFrame, then a 100ms
   * timeout) — both still double-committed on a real finger swipe, because
   * the real problem isn't the timing of any one guess, it's trying to
   * predict ordering between two native events AT ALL. This instead treats
   * every settle-ish event (onScrollEndDrag AND onMomentumScrollEnd) as
   * "maybe settled, reset the clock" and only acts once 100ms have passed
   * with no further settle event — so whichever one is actually LAST always
   * wins, however many of them fire and in whatever order, with no guessing.
   */
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    if (settleTimer.current != null) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      settleTimer.current = null;
      const i = nearestIndex(offsetX);
      setIndex(current => (i !== current ? i : current));
    }, 100);
  };

  /**
   * WEB: the only scroll callback react-native-web forwards, so it is the only
   * place `index` can be kept in sync. CSS scroll-snap does the snapping, so
   * this no longer schedules any scrolling of its own.
   *
   * setIndex only fires when the nearest card actually changes, which is a few
   * times per swipe rather than once per frame — the breakdown below the
   * carousel would otherwise re-render on every scroll event.
   */
  const handleWebScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = nearestIndex(e.nativeEvent.contentOffset.x);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        ref={pageRef}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + layout.contentBottom,
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <ScreenBody>
          <View style={[styles.header, { paddingHorizontal: layout.screenX }]}>
            <Text style={[typeScale.screenTitle, { color: colors.ink, flex: 1 }]}>Wallet</Text>
            <Wordmark />
          </View>

          {/* --- card carousel ----------------------------------------------- */}
          <ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            // Native snapping only — on web these props never reach the DOM
            // (see the note at the top of the file); WEB_SNAP_* handles it.
            snapToOffsets={IS_WEB ? undefined : snapOffsets}
            snapToStart={false}
            snapToEnd={false}
            decelerationRate="fast"
            style={WEB_SNAP_CONTAINER}
            contentContainerStyle={{
              paddingHorizontal: SIDE_PAD,
              gap: CARD_GAP,
              paddingTop: 18,
            }}
            onScroll={IS_WEB ? handleWebScroll : undefined}
            onMomentumScrollEnd={IS_WEB ? undefined : scheduleCommit}
            onScrollEndDrag={IS_WEB ? undefined : scheduleCommit}
            scrollEventThrottle={16}
          >
            {cards.map(c => (
              <BankCardFace
                key={c.id}
                art={resolveCardArt(c.input, artPrefs[c.id], c.fallback)}
                bankName={c.name}
                accountLabel={c.accountLabel}
                network={c.network}
                last4={c.last4}
                // The account holder's actual name, not a generic "EZER MEMBER"
                // — a real linked card branded with the app's name instead of
                // the person who owns it reads as a demo card.
                holderName={user?.name || 'EZER MEMBER'}
                subsLabel={subsLabelFor(c.id)}
                width={CARD_W}
                height={CARD_H}
                style={WEB_SNAP_CHILD}
              />
            ))}
          </ScrollView>

          {/* --- page dots --------------------------------------------------- */}
          {/* Tappable, so there is a way to change card that does not depend on
              the gesture — and so the dots are not the only control on screen
              that looks interactive but is not. */}
          <View style={styles.dots}>
            {cards.map((c, i) => {
              const on = i === index;
              return (
                <Pressable
                  key={c.id}
                  hitSlop={10}
                  onPress={() => {
                    setIndex(i);
                    carouselRef.current?.scrollTo({ x: cardOffset(i), animated: true });
                  }}
                  style={[
                    styles.dot,
                    on
                      ? { width: 22, backgroundColor: colors.gold }
                      : { width: 7, backgroundColor: colors.line2 },
                  ]}
                />
              );
            })}
          </View>


          <View style={{ paddingHorizontal: layout.screenX }}>
            {/* --- range chips ----------------------------------------------- */}
            <View style={styles.chipRow}>
              {(
                [
                  ['custom', chipLabel],
                  ['thisMonth', 'This month'],
                  ['lastMonth', 'Last month'],
                  ['ytd', 'YTD'],
                ] as const
              ).map(([key, label]) => {
                const on = preset === key;
                return (
                  <PressScale
                    key={key}
                    scaleTo={0.95}
                    style={{ flex: 1 }}
                    onPress={() => {
                      setPreset(key);
                      if (key === 'custom') setPickOpen(true);
                      else setPickOpen(false);
                    }}
                  >
                    <View
                      style={[
                        styles.chip,
                        on
                          ? { backgroundColor: colors.goldBg, borderColor: colors.goldBg }
                          : { backgroundColor: colors.card, borderColor: colors.line },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: on ? '#FFFFFF' : colors.ink },
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {label}
                      </Text>
                    </View>
                  </PressScale>
                );
              })}
            </View>

            {pickOpen && (
              <RangeCalendar
                start={rStart}
                end={rEnd}
                drainedCents={drained}
                onChange={(s, e) => {
                  setRStart(s);
                  setREnd(e);
                }}
                onDone={() => setPickOpen(false)}
              />
            )}

            {/* --- total drained --------------------------------------------- */}
            <Surface style={styles.totalCard}>
              <Label>Total drained</Label>
              <Text style={[typeScale.totalValue, { color: colors.red, marginTop: 4 }]}>
                {formatCents(drained)}
              </Text>
              <Body style={{ marginTop: 2 }}>
                {merchants.length} active subscription{merchants.length === 1 ? '' : 's'} on this card
              </Body>
              {/* Only when there are zero REAL charges — a range with any
                  real charge already tells the true story, so this never
                  overrides an actual number with a guess. Most common case:
                  "This month" checked on the 1st or 2nd, before this card's
                  usual billing day. */}
              {!loadingBreakdown && merchants.length === 0 && predicted.length > 0 && (
                <View style={[styles.predictedPill, { backgroundColor: colors.goldSoft, borderColor: colors.gold }]}>
                  <Ionicons name="time-outline" size={13} color={colors.gold} />
                  <Text style={[styles.predictedPillText, { color: colors.gold }]}>
                    Nothing charged yet — {formatCents(predicted.reduce((s, p) => s + p.amountCents, 0))} predicted
                  </Text>
                </View>
              )}
            </Surface>

            {/* --- where it goes --------------------------------------------- */}
            <SectionHeader style={{ marginTop: 24, marginBottom: 10 }}>Where it goes</SectionHeader>

            <View style={{ gap: 8 }}>
              {merchants.map(m => (
                <PressScale
                  key={m.merchantId}
                  onPress={() => {
                    // No active/trial Subscription row for this merchant —
                    // e.g. it was since cancelled. Nothing to open rather
                    // than a 404.
                    if (!m.subscriptionId) return;
                    router.push({
                      pathname: '/screens/SubscriptionDetail',
                      params: { id: m.subscriptionId },
                    });
                  }}
                >
                  <Surface style={styles.row}>
                    <MerchantMark name={m.merchantName} merchantId={m.merchantId} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.ink }]} numberOfLines={1}>
                        {m.merchantName}
                      </Text>
                      <Text style={[styles.rowMeta, { color: colors.mut }]}>
                        {m.count} charge{m.count === 1 ? '' : 's'} in range
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: colors.red }]}>
                      {formatCents(m.totalCents)}
                    </Text>
                  </Surface>
                </PressScale>
              ))}

              {merchants.length === 0 && (
                <Body style={{ textAlign: 'center', marginTop: 12 }}>
                  No charges on this card in the selected range.
                </Body>
              )}
            </View>

            {/* --- CTA -------------------------------------------------------- */}
            <PressScale onPress={() => router.push('/screens/DrainReview')} style={{ marginTop: 20 }}>
              <View style={[styles.cta, { backgroundColor: colors.accent }]}>
                <Ionicons name="cut-outline" size={17} color="#FFFFFF" />
                <Text style={styles.ctaText}>Review card drain</Text>
              </View>
            </PressScale>
          </View>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 20,
    // Four chips, one row, always — "Year to date" shortened to "YTD" and
    // the chip's own padding/font tightened below so all four fit on a
    // standard phone width without wrapping to a second line.
    flexWrap: 'nowrap',
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
  },
  totalCard: {
    padding: 18,
    marginTop: 16,
  },
  predictedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginTop: 10,
  },
  predictedPillText: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  rowName: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
  rowMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  rowAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  cta: {
    height: 50,
    borderRadius: radius.buttonLg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
    color: '#FFFFFF',
  },
});


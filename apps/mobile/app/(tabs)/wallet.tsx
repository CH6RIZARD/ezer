// =============================================================================
// EZER Redesign — Wallet (handoff §4)
//
// Horizontally snapping bank cards (300x178 r20) with animated page dots,
// range chips (Custom · This month · Last year), the custom range picker, a
// serif-italic total drained card, "Where it goes" merchant rows and a
// "Review card drain" CTA.
//
// Range logic is the handoff's, implemented in utils/chargeOccurrences.ts:
// expand every subscription into monthly occurrences over the trailing 18
// months (charge day = renewal day, clamped to 28), filter to the range, group
// by merchant, and sum.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useAuth } from '../../utils/AuthContext';
import { usePremiumGate } from '../../utils/usePremiumGate';
import { usePremium } from '../../utils/PremiumContext';
import { useData } from '../../contexts/DataContext';
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

  /** The count shown on a card; only the focused card has a fetched count. */
  const subsLabelFor = (cardId: string) => {
    // `merchants` is the API breakdown fetched for whichever card is currently
    // focused (see the effect keyed on active?.id below) — the only card this
    // component has a real count for. A card that isn't focused, or whose
    // fetch for THIS card hasn't resolved yet, shows "…" rather than a wrong
    // "0 subs" — the count that used to flash during a swipe or a range
    // change, because the previous card's/range's number was still sitting
    // in state.
    if (cardId !== active?.id || loadingBreakdown) return '…';
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

  useEffect(() => {
    let cancelled = false;
    const cardId = active?.id;

    if (!cardId) {
      setMerchants([]);
      return;
    }

    // Clear the PREVIOUS card's/range's rows immediately, not just once the
    // new fetch resolves. Leaving them in place until then is exactly why
    // swiping cards flashed the wrong sub count — `active?.id` updates
    // synchronously, so the render briefly paired the new card with the
    // old card's still-in-state merchant list before the fetch below
    // caught up.
    setMerchants([]);

    const rangeKey = preset === 'thisMonth' ? 'thisMonth' : preset === 'lastYear' ? 'lastYear' : preset === 'custom' ? 'custom' : 'last30';
    const customDates =
      rangeKey === 'custom'
        ? { startDate: range.start.toISOString(), endDate: range.end.toISOString() }
        : undefined;

    setLoadingBreakdown(true);
    getMerchants(cardId, rangeKey, customDates)
      .then(rows => {
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

  /** Inverse of cardOffset(): undo the leading offset before dividing. */
  const nearestIndex = (x: number) =>
    Math.max(0, Math.min(Math.round((x - FIRST_OFFSET) / CARD_STEP), cards.length - 1));

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
   */
  const syncIndex = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = nearestIndex(e.nativeEvent.contentOffset.x);
    if (i !== index) setIndex(i);
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
            onMomentumScrollEnd={IS_WEB ? undefined : syncIndex}
            onScrollEndDrag={IS_WEB ? undefined : syncIndex}
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
                  ['lastYear', 'Last year'],
                ] as const
              ).map(([key, label]) => {
                const on = preset === key;
                return (
                  <PressScale
                    key={key}
                    scaleTo={0.95}
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
    gap: 8,
    marginTop: 20,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
  totalCard: {
    padding: 18,
    marginTop: 16,
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


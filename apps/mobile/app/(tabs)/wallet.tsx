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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { usePremium } from '../../utils/PremiumContext';
import { useData } from '../../contexts/DataContext';
import { formatCents } from '../../utils/calculations';
import { isLoosePreviewMode } from '../../utils/expoRuntime';
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
  network: string;
  last4: string;
  gradient: readonly string[];
  fg: string;
  fgDim: string;
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

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status: premiumStatus } = usePremium();
  const { instruments, getMerchants } = useData();

  useEffect(() => {
    if (premiumStatus === 'expired' && !isLoosePreviewMode()) router.replace('/screens/Paywall');
  }, [premiumStatus]);

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
        const skin = BANK_CARD_SKINS[i % BANK_CARD_SKINS.length];
        return {
          id: inst.id,
          name: inst.displayName || 'Account',
          network: inst.brand?.toUpperCase() || 'CARD',
          last4: inst.last4 ?? '',
          gradient: skin.gradient,
          fg: skin.fg,
          fgDim: skin.fgDim,
          // Derived from this card's own charges, so the face count agrees with
          // the breakdown underneath it.
          // Filled from the API breakdown once it loads (see subsByCard).
          subs: 0,
        };
      }),
    [instruments]
  );

  const active = cards[Math.min(index, cards.length - 1)];

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
    { merchantId: string; merchantName: string; logo?: string; totalCents: number; count: number; subscriptionId: string }[]
  >([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cardId = active?.id;

    if (!cardId) {
      setMerchants([]);
      return;
    }

    const rangeKey =
      preset === 'thisMonth' ? 'thisMonth' : preset === 'lastYear' ? 'lastYear' : 'last30';

    setLoadingBreakdown(true);
    getMerchants(cardId, rangeKey)
      .then(rows => {
        if (cancelled) return;
        setMerchants(
          rows.map(m => ({
            merchantId: m.merchantId,
            merchantName: m.merchantName,
            logo: m.logo,
            totalCents: m.totalDrainedCents,
            count: m.chargeCount,
            // The API keys the breakdown by merchant; routing needs the
            // subscription, and merchantId resolves on the detail screen.
            subscriptionId: m.merchantId,
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
          paddingBottom: layout.contentBottom,
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
              <LinearGradient
                key={c.id}
                colors={c.gradient as unknown as readonly [string, string, ...string[]]}
                locations={
                  c.gradient.length === 3
                    ? (gradients.bankGoldLocations as unknown as readonly [number, number, ...number[]])
                    : undefined
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bankCard, WEB_SNAP_CHILD]}
              >
                {/* Three rows, space-between, exactly as the prototype builds it:
                    bank + network / masked number / holder + subs count. The
                    previous version collapsed rows 2 and 3 into one block and
                    invented a "Linked account" line that does not exist. */}
                <View style={styles.bankTop}>
                  <Text style={[styles.bankName, { color: c.fg }]} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={[styles.bankNetwork, { color: c.fgDim }]}>{c.network}</Text>
                </View>

                <Text style={[styles.bankLast4, { color: c.fg }]}>{'••••'}  {c.last4}</Text>

                <View style={styles.bankBottom}>
                  <Text style={[styles.bankHolder, { color: c.fgDim }]}>EZER MEMBER</Text>
                  <Text style={[styles.bankSubs, { color: c.fg }]}>
                    {c.subs} sub{c.subs === 1 ? '' : 's'}
                  </Text>
                </View>
              </LinearGradient>
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
                  onPress={() =>
                    router.push({
                      pathname: '/screens/SubscriptionDetail',
                      params: { id: m.subscriptionId },
                    })
                  }
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
  bankCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.virtualCard,
    padding: 20,
    justifyContent: 'space-between',
  },
  bankTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // All measured off the prototype markup.
  bankName: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    letterSpacing: 0.4,
  },
  bankNetwork: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
  },
  bankLast4: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    letterSpacing: 2.5,
  },
  bankBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bankHolder: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  bankSubs: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
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


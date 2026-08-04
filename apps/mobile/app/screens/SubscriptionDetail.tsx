// =============================================================================
// EZER Redesign — Subscription Detail (handoff §6)
//
// Opened from Home list rows, the day popover, Wallet breakdown rows and the
// Alerts Manage/Act buttons.
//
// Structure is a port of the prototype's SUB DETAIL screen, in order:
//   top bar ("Subscription")
//   centred hero    — 64px logo, name, serif price "/ month", status pill
//   meta card       — Next charge / Paid this year / Card
//   Charge history  — title INSIDE the card, rows split by hairlines
//   How you're getting charged — purple gradient card + SVG price chart + chips
//   Smart payment options — icon-tile radio rows -> Enable -> green banner
//   Save smart      — gold toggle -> 6/12/24-month projections (PURPLE tiles)
//   Lifetime cost   — serif 36px red total
//   Cancel CTA      — red button; on tap it ALSO opens the merchant's real
//                     cancellation page, then turns green
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Switch, Dimensions, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { formatCents } from '../../utils/calculations';
import {
  resolveCancellationUrl,
  resolveCancellationUrlSync,
  openCancellation,
} from '../../utils/cancellation';
import type { Subscription } from '../../types';
import { gradients, chartColors } from '../../theme/tokens';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import PriceChart, { type PricePoint } from '../../components/redesign/PriceChart';
import { api } from '../../utils/api';

/** Shape of GET /subscriptions/:id — see apps/api/src/routes/core.ts. */
interface SubscriptionDetailResponse {
  id: string;
  merchantId: string;
  merchantName: string;
  logo?: string | null;
  status: string;
  cadence: string;
  renewalDate?: string | null;
  startedAt?: string | null;
  cancellationDifficulty?: number;
  difficultyLabel?: string;
  charges: {
    id: string;
    amountCents: number;
    chargeTimestamp: string;
    fundingInstrument: { displayName: string; brand: string; last4: string };
  }[];
  priceHistory: { month: string; amountCents: number }[];
  lifetimeCostCents: number;
  investmentOpportunityCostCents: number;
}

const SCREEN_W = Dimensions.get('window').width;
/** Card is 18px-padded inside the 20px screen gutters. */
const CHART_W = SCREEN_W - layout.screenX * 2 - 36;

/**
 * Real price histories called out in the handoff. Anything not listed is flat,
 * which renders the "No price changes — steady at $X" chip.
 */
const PRICE_HISTORY: Record<string, number[]> = {
  netflix: [1099, 1099, 1299, 1299, 1549, 1549],
  youtube: [1199, 1199, 1199, 1399, 1399, 1399],
  fitpass: [2900, 2900, 2900, 3400, 3400, 3400],
};

function monthLabels(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toLocaleDateString('en-US', { month: 'short' }));
  }
  return out;
}

export default function SubscriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();

  const [payOpt, setPayOpt] = useState<null | 'half' | 'full'>(null);
  const [smartEnabled, setSmartEnabled] = useState(false);
  const [saveSmart, setSaveSmart] = useState(false);
  const [ssMonths, setSsMonths] = useState<6 | 12 | 24>(12);
  const [cancelStarted, setCancelStarted] = useState(false);
  /** Only set when the destination was a guess, so the copy stays honest. */
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  /** True while auto-discovery is probing — keeps the CTA from double-firing. */
  const [cancelBusy, setCancelBusy] = useState(false);

  // --- resolve the subscription ----------------------------------------------
  //
  // Only three merchants have a Subscription record, but the Wallet breakdown
  // is built from CHARGES, which cover eight. The old fallback chain ended at
  // `demoSubscriptions[0]`, so every row without a record — Disney+, Apple
  // Music, Hulu, HBO Max… — silently opened Netflix. Every card in "Where it
  // goes" looked like it linked to the same place because, past the first
  // three, it did.
  //
  // A charge-backed merchant is a real recurring stream whether or not the
  // inference pipeline has minted a Subscription row for it yet, so one is
  // synthesised from its charge history. Falling back to an unrelated
  // subscription is never right: showing the wrong merchant's price, renewal
  // and cancel button is worse than showing nothing.
  // GET /subscriptions/:id returns everything this screen needs in one call —
  // the subscription, its merchant, the full charge history, price history and
  // lifetime cost — all derived from Plaid-synced transactions.
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = params.id;

    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .get<{ success: boolean; data: SubscriptionDetailResponse }>(`/subscriptions/${id}`)
      .then(res => {
        if (!cancelled) setDetail((res as any)?.data ?? null);
      })
      .catch(() => {
        // A 404 here is a real answer: that subscription is not this user's.
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const sub = detail;
  const name = detail?.merchantName ?? '';
  const trial = detail?.status === 'trial';
  // The card each charge landed on travels WITH the charge, so the header can
  // name the real one instead of guessing at a default instrument.
  const card = detail?.charges?.[0]?.fundingInstrument ?? null;

  // Every hook must run before the early returns below, or the hook order
  // changes between renders.
  const charges = useMemo(
    () =>
      (detail?.charges ?? [])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
        )
        .slice(0, 6),
    [detail]
  );

  // All hooks have run; safe to bail out.
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accInk} />
      </View>
    );
  }

  if (!sub) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            flex: 1,
            paddingTop: insets.top + 10,
            paddingHorizontal: layout.screenX,
          }}
        >
          <PressScale onPress={() => router.back()} scaleTo={0.9}>
            <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </View>
          </PressScale>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Ionicons name="help-circle-outline" size={40} color={colors.mut2} />
            <Text style={[typeScale.sectionHeader, { color: colors.ink, textAlign: 'center' }]}>
              We couldn't find that subscription
            </Text>
            <Body style={{ textAlign: 'center' }}>
              It may have been cancelled or removed. Go back and pick it again.
            </Body>
          </View>
        </View>
      </View>
    );
  }

  const priceCents = charges[0]?.amountCents ?? 0;
  const lifetimeCents = charges.reduce((s, c) => s + c.amountCents, 0);
  const ytdCents = charges
    .filter(c => new Date(c.chargeTimestamp).getFullYear() === new Date().getFullYear())
    .reduce((s, c) => s + c.amountCents, 0);

  // --- price history ----------------------------------------------------------
  const history = PRICE_HISTORY[sub.merchantId];
  const labels = monthLabels(6);
  const series: number[] = history ?? Array(6).fill(priceCents);
  const points: PricePoint[] = series.map((cents, i) => ({ label: labels[i], cents }));

  // One chip per price change in the last four months, exactly as the prototype
  // builds them; a flat history falls back to the "steady at" chip so the row
  // is never empty.
  const chips: string[] = [];
  for (let i = 1; i < series.length; i++) {
    const change = series[i] - series[i - 1];
    if (change !== 0 && i >= series.length - 4) {
      chips.push(
        `${change > 0 ? '↑' : '↓'} ${formatCents(Math.abs(change))} since ${labels[i - 1]}`
      );
    }
  }
  if (chips.length === 0) chips.push(`No price changes — steady at ${formatCents(priceCents)}`);

  const halfCents = Math.round(priceCents / 2);
  const projection = { 6: priceCents * 6, 12: priceCents * 12, 24: priceCents * 24 }[ssMonths];

  // --- cancel -----------------------------------------------------------------
  // Flipping local state is not enough: the user asked to land on the service's
  // real cancellation page. `cancellationUrl` on the merchant record (API/Plaid
  // enrichment in production, real URLs in the demo) wins over the curated
  // table inside resolveCancellationUrl.
  const onCancel = async () => {
    if (cancelBusy) return;

    // Fast path: a record URL or a curated one resolves with no network, so the
    // 8 demo merchants that carry real URLs open instantly.
    const quick = resolveCancellationUrlSync(name, sub.merchantId);
    if (quick) {
      setCancelStarted(true);
      setCancelNote(null);
      void openCancellation(quick);
      return;
    }

    // Slow path: auto-discovery probes the merchant's domain for the page
    // cancellation actually lives behind, so it needs a pending state.
    setCancelBusy(true);
    try {
      const target = await resolveCancellationUrl(name, sub.merchantId);
      setCancelStarted(true);
      setCancelNote(
        target.source === 'search'
          ? `Opening a search for how to cancel ${name} — we could not confirm an official cancellation page.`
          : null
      );
      await openCancellation(target);
    } finally {
      setCancelBusy(false);
    }
  };

  const payOptions = [
    {
      key: 'half' as const,
      title: 'Pay full + save half',
      sub: `Pay ${formatCents(priceCents)} + auto-save ${formatCents(halfCents)} · ${formatCents(
        priceCents + halfCents
      )} total/mo`,
      icon: 'logo-usd' as const,
      tileBg: colors.goldSoft,
      tileFg: colors.gold,
    },
    {
      key: 'full' as const,
      title: 'Pay full + match full',
      sub: `Pay ${formatCents(priceCents)} + match ${formatCents(
        priceCents
      )} into investing · ${formatCents(priceCents * 2)} total/mo`,
      icon: 'trending-up' as const,
      tileBg: colors.accSoft,
      tileFg: colors.accInk,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: layout.screenX,
          paddingBottom: layout.contentBottom,
        }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <ScreenBody>
          {/* --- top bar ------------------------------------------------------ */}
          <View style={styles.topBar}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View
                style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text
              style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12, flex: 1 }]}
              numberOfLines={1}
            >
              Subscription
            </Text>
          </View>

          {/* --- hero --------------------------------------------------------- */}
          <View style={styles.hero}>
            <MerchantMark name={name} merchantId={sub.merchantId} size={64} />
            <Text
              style={[styles.heroName, { color: colors.ink }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {name}
            </Text>
            <Text style={[styles.heroPriceRow, { color: colors.mut }]} numberOfLines={1}>
              <Text style={[styles.heroPrice, { color: colors.ink }]}>
                {formatCents(priceCents)}
              </Text>
              {' / month'}
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.goldSoft }]}>
              <Text style={[styles.badgeText, { color: colors.gold }]}>
                {trial ? 'FREE TRIAL' : 'ACTIVE'}
              </Text>
            </View>
          </View>

          {/* --- meta --------------------------------------------------------- */}
          <Surface style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Body style={styles.metaKey}>Next charge</Body>
              <Text style={[styles.metaValue, { color: colors.ink }]} numberOfLines={1}>
                {sub.renewalDate
                  ? new Date(sub.renewalDate).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                    })
                  : '—'}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.metaRow}>
              <Body style={styles.metaKey}>Paid this year</Body>
              <Text style={[styles.metaValue, { color: colors.red }]} numberOfLines={1}>
                {formatCents(ytdCents)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.line }]} />
            <View style={styles.metaRow}>
              <Body style={styles.metaKey}>Card</Body>
              <Text style={[styles.metaValue, { color: colors.ink }]} numberOfLines={1}>
                {card ? `${card.displayName} ···· ${card.last4}` : '—'}
              </Text>
            </View>
          </Surface>

          {/* --- charge history ---------------------------------------------- */}
          <Surface style={styles.historyCard}>
            <Text
              style={[styles.cardTitle, { color: colors.ink, paddingTop: 12, paddingBottom: 4 }]}
            >
              Charge history
            </Text>
            {charges.map(c => (
              <View
                key={c.id}
                style={[styles.chargeRow, { borderTopColor: colors.line, borderTopWidth: 1 }]}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={[styles.chargeDate, { color: colors.ink }]} numberOfLines={1}>
                    {new Date(c.chargeTimestamp).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={[styles.chargeSub, { color: colors.mut }]}>Monthly</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.chargeAmount, { color: colors.red }]}>
                    {formatCents(c.amountCents)}
                  </Text>
                  <Text style={[styles.confidence, { color: colors.mut }]}>
                    {c.fundingInstrument?.last4 ? `•${c.fundingInstrument.last4}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </Surface>

          {/* --- how you're getting charged ---------------------------------- */}
          <LinearGradient
            colors={gradients.chartCard as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.chartCard}
          >
            <Text style={styles.chartTitle}>How you're getting charged</Text>
            <Text style={styles.chartSub} numberOfLines={1}>
              {name} · price over time
            </Text>

            <PriceChart points={points} width={CHART_W} />

            <View style={styles.chipRow}>
              {chips.map(txt => (
                <View key={txt} style={styles.deltaChip}>
                  <Text style={styles.deltaText}>{txt}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>

          {/* --- smart payment options --------------------------------------- */}
          <Surface style={styles.bigCard} radius={radius.cardLg}>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Smart payment options</Text>
            <Text style={[styles.cardSub, { color: colors.mut }]}>
              Pay in full · automate the difference
            </Text>

            {payOptions.map(opt => {
              const on = payOpt === opt.key;
              return (
                <PressScale
                  key={opt.key}
                  scaleTo={0.98}
                  onPress={() => {
                    setPayOpt(opt.key);
                    setSmartEnabled(false);
                  }}
                  style={styles.optWrap}
                >
                  <View
                    style={[
                      styles.radioRow,
                      {
                        borderColor: on ? colors.gold : colors.line,
                        backgroundColor: on ? colors.goldSoft : 'transparent',
                      },
                    ]}
                  >
                    <View style={[styles.optTile, { backgroundColor: opt.tileBg }]}>
                      <Ionicons name={opt.icon} size={19} color={opt.tileFg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.optTitle, { color: colors.ink }]}>{opt.title}</Text>
                      <Text style={[styles.optSub, { color: colors.mut }]}>{opt.sub}</Text>
                    </View>
                    <View style={[styles.radio, { borderColor: colors.goldLine }]}>
                      <View
                        style={[
                          styles.radioDot,
                          { backgroundColor: on ? colors.gold : 'transparent' },
                        ]}
                      />
                    </View>
                  </View>
                </PressScale>
              );
            })}

            {payOpt && !smartEnabled && (
              <PressScale onPress={() => setSmartEnabled(true)} scaleTo={0.98}>
                <View style={[styles.enableBtn, { backgroundColor: colors.accent }]}>
                  <Text style={styles.enableText}>Enable smart saving</Text>
                </View>
              </PressScale>
            )}

            {smartEnabled && (
              <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
                <Text style={[styles.bannerText, { color: colors.success }]}>
                  ✓ Smart saving on — each cycle pays {formatCents(priceCents)} and moves{' '}
                  {formatCents(payOpt === 'full' ? priceCents : halfCents)} to your{' '}
                  {payOpt === 'full' ? 'investments' : 'savings'} automatically.
                </Text>
              </View>
            )}
          </Surface>

          {/* --- save smart ---------------------------------------------------- */}
          <Surface style={styles.bigCard} radius={radius.cardLg}>
            <View style={styles.saveHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.cardTitle, { color: colors.ink }]}>Save smart</Text>
                <Text style={[styles.cardSub, { color: colors.mut, marginBottom: 0 }]}>
                  See how your savings would grow
                </Text>
              </View>
              <Switch
                value={saveSmart}
                onValueChange={setSaveSmart}
                // Prototype track is solid `--gold` when on (#A87D2F light,
                // #D6B36F dark) with a white knob. `goldBg` is muddy in dark
                // (#8F6B29) and read as a different gold from everything else.
                trackColor={{ false: colors.line2, true: colors.gold }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={colors.line2}
              />
            </View>

            {saveSmart && (
              <>
                <Text style={[styles.ssLead, { color: colors.ink }]}>
                  With{' '}
                  <Text style={{ fontFamily: fontFamily.serif, fontSize: 15 }}>
                    {formatCents(priceCents)}
                  </Text>
                  /mo automatically saved:
                </Text>

                <View style={styles.projRow}>
                  {([6, 12, 24] as const).map(m => {
                    const on = ssMonths === m;
                    return (
                      // The layout style MUST sit on PressScale — it lands on the
                      // Pressable. On the inner View the tiles collapse to a
                      // one-letter-per-line column.
                      <PressScale
                        key={m}
                        scaleTo={0.96}
                        onPress={() => setSsMonths(m)}
                        style={styles.projTile}
                      >
                        <View
                          style={[
                            styles.projInner,
                            {
                              borderColor: on ? colors.accInk : colors.line,
                              backgroundColor: on ? colors.accSoft : 'transparent',
                            },
                          ]}
                        >
                          <Text
                            style={[styles.projLabel, { color: colors.mut }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {m === 6
                              ? 'After 6 months'
                              : m === 12
                                ? 'After 1 year'
                                : 'After 2 years'}
                          </Text>
                          <Text
                            style={[styles.projValue, { color: colors.accInk }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.6}
                          >
                            {formatCents(priceCents * m)}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>

                <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
                  <Text style={[styles.bannerText, { color: colors.success, textAlign: 'center' }]}>
                    That's {formatCents(projection)} saved without changing your lifestyle
                  </Text>
                </View>
              </>
            )}
          </Surface>

          {/* --- lifetime cost -------------------------------------------------- */}
          <Surface style={styles.lifetimeCard} radius={radius.cardLg}>
            <Body style={{ marginBottom: 4 }}>This has cost you more than</Body>
            <Text style={[typeScale.totalValueSm, { color: colors.red, letterSpacing: -0.5 }]}>
              {formatCents(lifetimeCents)}
            </Text>
          </Surface>

          {/* --- cancel --------------------------------------------------------- */}
          <PressScale onPress={onCancel} scaleTo={0.98} disabled={cancelBusy}>
            <View
              style={[
                styles.cancelBtn,
                {
                  backgroundColor: cancelStarted ? colors.success : colors.red,
                  opacity: cancelBusy ? 0.7 : 1,
                },
              ]}
            >
              <Text style={styles.cancelText}>
                {cancelBusy
                  ? 'Finding cancellation page…'
                  : cancelStarted
                  ? 'Cancellation started ✓ — choose where the money goes'
                  : 'Cancel & choose where to send the money'}
              </Text>
            </View>
          </PressScale>

          {cancelNote ? (
            <Body style={{ marginTop: 8, textAlign: 'center' }}>{cancelNote}</Body>
          ) : null}
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 18,
    paddingBottom: 22,
  },
  heroName: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroPriceRow: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  heroPrice: {
    fontFamily: fontFamily.serif,
    fontSize: 20,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  badgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  divider: { height: 1 },
  metaCard: {
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
  },
  metaKey: {
    flexShrink: 0,
  },
  metaValue: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
    flexShrink: 1,
    textAlign: 'right',
  },
  historyCard: {
    paddingHorizontal: 16,
    paddingBottom: 2,
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
  cardSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  chargeDate: {
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
  chargeSub: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 1,
  },
  chargeAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
  },
  confidence: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    marginTop: 1,
  },
  chartCard: {
    borderRadius: radius.cardLg,
    padding: 18,
    marginBottom: 16,
  },
  chartTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  chartSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: chartColors.subtext,
    marginTop: 2,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },
  deltaChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.chip,
    backgroundColor: chartColors.chipBg,
  },
  deltaText: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
    color: chartColors.line,
  },
  bigCard: {
    padding: 18,
    marginBottom: 16,
  },
  optWrap: {
    marginBottom: 10,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 2,
    borderRadius: radius.buttonSm,
  },
  optTile: {
    width: 38,
    height: 38,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  optTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
  optSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17.4,
  },
  enableBtn: {
    paddingVertical: 14,
    borderRadius: radius.buttonSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 13,
  },
  bannerText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
    lineHeight: 18,
  },
  saveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ssLead: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    marginTop: 14,
    marginBottom: 10,
  },
  projRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  // The PressScale gets the flex sizing; the inner View carries the border.
  // No minWidth: three tiles at flex:1 plus a 96px floor overflowed the card
  // and pushed "After 2 years" off the right edge.
  projTile: {
    flex: 1,
    minWidth: 0,
  },
  projInner: {
    borderWidth: 2,
    borderRadius: 13,
    paddingVertical: 13,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
  },
  projLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    textAlign: 'center',
  },
  projValue: {
    fontFamily: fontFamily.serif,
    fontSize: 16,
  },
  lifetimeCard: {
    padding: 20,
    marginBottom: 16,
  },
  cancelBtn: {
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

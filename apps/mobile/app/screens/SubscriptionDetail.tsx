// =============================================================================
// EZER Redesign — Subscription Detail (handoff "Sub 6a", Staircase)
//
// Opened from Home list rows, the day popover, Wallet breakdown rows and the
// Alerts Manage/Act buttons. Swift: Features/Wallet/SubscriptionDetailView.swift.
//
// One screen, in order:
//   purple hero  — back, logo, name/ACTIVE/card, serif price, "x% more than you
//                  first paid" chip, the STAIRCASE (one equal-width step per
//                  price however long it lasted, rises tagged, next charge a
//                  dashed step), Next charge / Total spent / Per day
//   Your move    — Keep | Keep + save | Cancel, one outcome card, one CTA
//   Charges      — 3 recent, "All n" expands
//
// It replaced a 6-card scroll (meta, history, line chart, smart options, Save
// smart toggle, lifetime) the owner found too long and the chart/toggle bad.
//
// Smart saving is ONE goal ("Subscription savings"): enabling adds this
// subscription as a SOURCE of the pool (setSubscriptionSaving), never a goal of
// its own, and "enabled" is read from pool.sources by subscriptionId, never by
// goal name (PATCH-NOTES-subscription-savings.md).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { DoveLoader } from '../../components/CameraDove';
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
  appStoreFallbackHint,
} from '../../utils/cancellation';
import { chartColors } from '../../theme/tokens';
import { fontFamily, typeScale, layout } from '../../theme/type';
import { Body, PressScale, ScreenBody, Skeleton, SkeletonRows } from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import { api } from '../../utils/api';
import { useSavingsGoals } from '../../utils/SavingsGoalsContext';
import { priceSteps, stepHeight } from '../../utils/priceSteps';

/** Shape of GET /subscriptions/:id — see apps/api/src/routes/core.ts. */
interface SubscriptionDetailResponse {
  id: string;
  merchantId: string;
  merchantName: string;
  logo?: string | null;
  website?: string | null;
  status: string;
  cadence: string;
  renewalDate?: string | null;
  startedAt?: string | null;
  cancellationUrl?: string | null;
  cancellationDifficulty?: number;
  difficultyLabel?: string;
  /** Every charge, newest first. */
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

type Seg = 'keep' | 'save' | 'cancel';
type Mode = 'half' | 'match';

/** Hero colours: the hero is the purple card in every theme, like the old chart card. */
const HERO = {
  top: '#2E1170',
  mid: '#1D0B45',
  sub: chartColors.subtext, // #C9BCE8
  gold: chartColors.line, // #E7C77E
  goldInk: '#2A0F5C',
};
/** At most this many steps; older prices are summed up in the line under it. */
const MAX_STEPS = 4;

const DAY_MS = 86_400_000;
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fullDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthYY = (d: Date) =>
  `${d.toLocaleDateString('en-US', { month: 'short' })} ’${String(d.getFullYear()).slice(2)}`;
const monthYYYY = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
const pctUp = (a: number, b: number) => Math.round(((a - b) / b) * 100);
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export default function SubscriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const { pool, setSubscriptionSaving } = useSavingsGoals();

  const [seg, setSeg] = useState<Seg>('save');
  const [mode, setMode] = useState<Mode>('half');
  const [kept, setKept] = useState(false);
  const [hist, setHist] = useState(false);
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [cancelStarted, setCancelStarted] = useState(false);
  /** Only set when the destination was a guess, so the copy stays honest. */
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  /** True while auto-discovery is probing — keeps the CTA from double-firing. */
  const [cancelBusy, setCancelBusy] = useState(false);

  // GET /subscriptions/:id returns everything this screen needs in one call —
  // the subscription, its merchant and the full charge history, all derived
  // from Plaid-synced transactions. Falling back to an unrelated subscription
  // is never right: the wrong merchant's price and cancel button is worse than
  // showing nothing.
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

  /** Newest first. Every hook runs before the early returns below. */
  const charges = useMemo(
    () =>
      (detail?.charges ?? [])
        .slice()
        .sort((a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()),
    [detail]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 10, paddingHorizontal: layout.screenX, gap: 12 }}>
        <DoveLoader />
        <Skeleton w={36} h={36} r={18} />
        <Skeleton w="50%" h={16} style={{ marginTop: 12 }} />
        <Skeleton w="40%" h={64} />
        <Skeleton h={150} r={12} style={{ marginTop: 10 }} />
        <SkeletonRows count={3} />
      </View>
    );
  }

  const sub = detail;
  if (!sub) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 10, paddingHorizontal: layout.screenX }}>
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
    );
  }

  const name = sub.merchantName;
  const trial = sub.status === 'trial';
  // The card each charge landed on travels WITH the charge.
  const card = charges[0]?.fundingInstrument ?? null;
  const n = charges.length;
  const P = charges[0]?.amountCents ?? 0;
  const H = Math.round(P / 2);
  const firstCents = charges[n - 1]?.amountCents ?? P;
  const changed = charges.some(c => c.amountCents !== P);
  const totalCents = sub.lifetimeCostCents || charges.reduce((s, c) => s + c.amountCents, 0);
  const perDay = formatCents(Math.round((P * 12) / 365));

  const renewal = sub.renewalDate ? new Date(sub.renewalDate) : null;
  const next = renewal ? shortDate(renewal) : null;
  const daysLeft = renewal ? Math.max(0, Math.ceil((renewal.getTime() - Date.now()) / DAY_MS)) : null;

  // --- staircase ---------------------------------------------------------------
  const oldestFirst = charges.slice().reverse();
  const allSteps = priceSteps(oldestFirst.map(c => c.amountCents));
  const steps = allSteps.slice(-MAX_STEPS);
  const sMin = Math.min(...allSteps.map(s => s.cents));
  const sMax = Math.max(...allSteps.map(s => s.cents));
  const rises = allSteps.filter((s, i) => i > 0 && s.cents > allSteps[i - 1].cents).length;
  const dateAt = (i: number) => new Date(oldestFirst[i].chargeTimestamp);
  const stairLine =
    n === 0
      ? null
      : changed
        ? [
            `${formatCents(allSteps[0].cents)} for ${allSteps[0].count} ${allSteps[0].count === 1 ? 'charge' : 'charges'}, then`,
            `${rises} ${rises === 1 ? 'increase' : 'increases'} since ${dateAt(allSteps[1].from).toLocaleDateString('en-US', { month: 'short' })}`,
          ]
        : [`${n} ${n === 1 ? 'charge' : 'charges'} at ${formatCents(P)},`, 'not one increase'];

  // --- smart saving (one pool, many sources) -----------------------------------
  const live = (pool?.sources ?? []).filter(s => s.status !== 'ENDED');
  const mine = live.find(s => s.subscriptionId === sub.id) ?? null;
  const others = live.filter(s => s.subscriptionId !== sub.id);
  const curMode: Mode = mine ? (mine.mode === 'MATCH' ? 'match' : 'half') : mode;
  const per = curMode === 'match' ? P : H;

  const enableSmartSaving = async (m: Mode) => {
    if (smartBusy) return;
    setSmartBusy(true);
    setSmartError(null);
    const res = await setSubscriptionSaving(sub.id, m === 'match' ? 'MATCH' : 'HALF');
    setSmartBusy(false);
    if (!res.ok) setSmartError(res.error || 'Could not set up smart saving.');
  };
  const pickMode = (m: Mode) => {
    if (mine) {
      // Already a source: the same idempotent PUT switches its mode.
      if (curMode !== m) void enableSmartSaving(m);
    } else setMode(m);
  };

  // --- cancel ------------------------------------------------------------------
  // Flipping local state is not enough: the user asked to land on the service's
  // real cancellation page. `cancellationUrl` on the merchant record wins over
  // the curated table inside resolveCancellationUrl.
  const onCancel = async () => {
    if (cancelBusy) return;
    const quick = resolveCancellationUrlSync(name, sub.merchantId, sub.cancellationUrl ?? undefined);
    if (quick) {
      setCancelStarted(true);
      setCancelNote(null);
      void openCancellation(quick);
      return;
    }
    // Auto-discovery probes the merchant's domain, so it needs a pending state.
    setCancelBusy(true);
    try {
      const target = await resolveCancellationUrl(
        name,
        sub.merchantId,
        sub.cancellationUrl ?? undefined,
        sub.website ?? undefined
      );
      setCancelStarted(target.source !== 'unknown');
      // 'unknown' gets no note — openCancellation already shows an honest alert.
      setCancelNote(
        target.source === 'homepage'
          ? `We couldn't confirm the exact cancellation page — opening ${name}'s site instead. ${appStoreFallbackHint()}`
          : null
      );
      await openCancellation(target);
    } finally {
      setCancelBusy(false);
    }
  };

  // --- Your move ---------------------------------------------------------------
  const out = {
    keep: {
      label: 'NEXT 12 MONTHS',
      value: '−' + formatCents(P * 12),
      color: colors.red,
      line: `${perDay} a day, every day. Nothing else changes.`,
      border: colors.line2,
    },
    save: {
      label: 'SAVED IN 12 MONTHS',
      value: '+' + formatCents(per * 12),
      color: colors.accInk,
      line: `Each ${formatCents(P)} charge also moves ${formatCents(per)} into Subscription savings.`,
      border: colors.accInk,
    },
    cancel: {
      label: 'BACK IN 12 MONTHS',
      value: '+' + formatCents(P * 12),
      color: colors.gold,
      line: `Cancel${next ? ` before ${next}` : ''} and choose where the ${formatCents(P)} a month goes instead.`,
      border: colors.gold,
    },
  }[seg];

  const liveCount = live.length;
  const doneText =
    seg === 'keep' && kept
      ? `✓ Kept as is.${next ? ` Nothing changes on ${next}.` : ''}`
      : seg === 'cancel' && cancelStarted
        ? 'Cancellation started ✓ — choose where the money goes'
        : seg === 'save' && mine
          ? mine.status === 'PAUSED'
            ? `Saving from ${name} is paused. Resume it in Subscription savings.`
            : `✓ Added to Subscription savings — each ${name} charge also moves ${formatCents(per)} there. ${liveCount} ${liveCount === 1 ? 'subscription now feeds' : 'subscriptions now feed'} it.`
          : null;
  const busy = seg === 'save' ? smartBusy : seg === 'cancel' ? cancelBusy : false;
  const ctaLabel = busy
    ? seg === 'cancel'
      ? 'Finding cancellation page…'
      : 'Setting up…'
    : seg === 'keep'
      ? 'Keep as is'
      : seg === 'cancel'
        ? 'Cancel & choose where to send the money'
        : 'Enable smart saving';
  const onCta = () => {
    if (seg === 'keep') setKept(true);
    else if (seg === 'cancel') void onCancel();
    else void enableSmartSaving(mode);
  };

  // --- charges list --------------------------------------------------------------
  const shown = charges.slice(0, hist ? 6 : 3);
  const earlier = hist && n > 6 ? charges.slice(6) : [];

  const label = (t: string, color: string = HERO.sub) => (
    <Text style={[styles.statLabel, { color }]}>{t}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        <ScreenBody style={{ flex: 1 }}>
          {/* --- hero ---------------------------------------------------------- */}
          <LinearGradient
            colors={[HERO.top, HERO.mid, colors.bg]}
            locations={[0, 0.64, 1]}
            style={{ paddingTop: insets.top + 10, paddingHorizontal: layout.screenX, paddingBottom: 52 }}
          >
            <View style={styles.row}>
              <PressScale onPress={() => router.back()} scaleTo={0.9}>
                <View style={styles.heroBack}>
                  <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
                </View>
              </PressScale>
              <View style={{ flex: 1 }} />
              <MerchantMark name={name} merchantId={sub.merchantId} logoUrl={sub.logo ?? undefined} size={40} />
            </View>

            <View style={[styles.row, { gap: 8, marginTop: 20 }]}>
              <Text style={styles.heroName} numberOfLines={1}>{name}</Text>
              <View style={styles.activePill}>
                <Text style={styles.activeText}>{trial ? 'FREE TRIAL' : 'ACTIVE'}</Text>
              </View>
              {card ? (
                <Text style={[styles.heroMeta, { flexShrink: 1 }]} numberOfLines={1}>
                  {card.displayName} ···· {card.last4}
                </Text>
              ) : null}
            </View>

            <View style={[styles.row, { alignItems: 'baseline', gap: 8, marginTop: 4 }]}>
              <Text style={styles.heroPrice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {formatCents(P)}
              </Text>
              <Text style={[styles.heroMeta, { fontSize: 15 }]}>/ month</Text>
            </View>

            {n > 0 ? (
              <View style={[styles.row, { flexWrap: 'wrap', gap: 8, marginTop: 12 }]}>
                <View style={[styles.chip, { backgroundColor: changed ? 'rgba(231,199,126,.2)' : 'rgba(196,169,247,.2)' }]}>
                  <Ionicons name={changed ? 'trending-up' : 'checkmark-circle'} size={12} color={changed ? HERO.gold : '#C4A9F7'} />
                  <Text style={[styles.chipText, { color: changed ? HERO.gold : '#C4A9F7' }]} numberOfLines={1}>
                    {changed
                      ? `${pctUp(P, firstCents)}% more than you first paid`
                      : `Same price since ${monthYYYY(dateAt(0))}`}
                  </Text>
                </View>
                {changed ? (
                  <Text style={styles.heroStory}>
                    was <Text style={{ textDecorationLine: 'line-through' }}>{formatCents(firstCents)}</Text>
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* --- staircase --- */}
            {steps.length > 0 ? (
              <>
                <View style={styles.stairs}>
                  {steps.map((s, i) => {
                    const cur = i === steps.length - 1;
                    const prev = allSteps[allSteps.length - steps.length + i - 1];
                    const up = !!prev && s.cents > prev.cents;
                    const h = stepHeight(s.cents, sMin, sMax);
                    const inner = (
                      <>
                        <Text style={[styles.stepPrice, { color: cur ? HERO.goldInk : '#FFFFFF' }]} numberOfLines={1}>
                          {formatCents(s.cents)}
                        </Text>
                        <Text style={[styles.stepDur, { color: cur ? 'rgba(42,15,92,.72)' : HERO.sub }]} numberOfLines={1}>
                          {s.count} {s.count === 1 ? 'charge' : 'charges'}
                        </Text>
                      </>
                    );
                    return (
                      <View key={s.from} style={styles.stepCol}>
                        {up ? (
                          <View style={[styles.riseTag, { bottom: h + 6 }]}>
                            <Text style={styles.riseText}>+{pctUp(s.cents, prev.cents)}%</Text>
                          </View>
                        ) : null}
                        {cur ? (
                          <LinearGradient colors={[HERO.gold, 'rgba(231,199,126,.6)']} style={[styles.step, { height: h }]}>
                            {inner}
                          </LinearGradient>
                        ) : (
                          <View style={[styles.step, { height: h, backgroundColor: 'rgba(231,199,126,.2)' }]}>{inner}</View>
                        )}
                      </View>
                    );
                  })}
                  <View style={[styles.stepCol, { flex: 0.7 }]}>
                    <View style={[styles.nextStep, { height: stepHeight(P, sMin, sMax) }]}>
                      <Text style={styles.nextTitle}>next</Text>
                      <Text style={styles.nextDate} numberOfLines={1}>{next ?? '—'}</Text>
                    </View>
                  </View>
                </View>
                <View style={[styles.row, { gap: 6, marginTop: 6 }]}>
                  {steps.map(s => (
                    <Text key={s.from} style={styles.stepRange} numberOfLines={1}>
                      {s.count === 1 ? monthYY(dateAt(s.from)) : `${monthYY(dateAt(s.from))} – ${monthYY(dateAt(s.to))}`}
                    </Text>
                  ))}
                  <View style={{ flex: 0.7 }} />
                </View>
              </>
            ) : null}
            {stairLine ? (
              <Text style={[styles.heroStory, { marginTop: 12 }]}>
                {stairLine[0]} <Text style={{ fontFamily: fontFamily.bold, color: '#FFFFFF' }}>{stairLine[1]}</Text>
              </Text>
            ) : null}

            <View style={styles.stats}>
              <View style={{ flex: 1 }}>
                {label('NEXT CHARGE')}
                <Text style={styles.statValue} numberOfLines={1}>
                  {next ? `${next} · ${daysLeft}d` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1.1 }}>
                {label(changed ? 'TOTAL SPENT' : 'PER YEAR')}
                <Text style={[styles.statValue, { color: changed ? '#F08A73' : '#FFFFFF' }]} numberOfLines={1}>
                  {formatCents(changed ? totalCents : P * 12)}
                </Text>
              </View>
              <View style={{ flex: 0.9 }}>
                {label('PER DAY')}
                <Text style={styles.statValue} numberOfLines={1}>{perDay}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* --- Your move ---------------------------------------------------- */}
          <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Your move</Text>
            <Text style={[styles.sheetSub, { color: colors.mut }]}>
              {next ? `Before ${next}, when ${name} charges ${formatCents(P)} again` : `Next time ${name} charges ${formatCents(P)}`}
            </Text>

            <View style={[styles.segTrack, { backgroundColor: colors.bg, borderColor: colors.line }]}>
              {(
                [
                  ['keep', 'Keep'],
                  ['save', 'Keep + save'],
                  ['cancel', 'Cancel'],
                ] as const
              ).map(([k, t]) => {
                const on = seg === k;
                const txt = (
                  <Text style={[styles.segText, { color: on ? (k === 'keep' ? colors.ink : '#FFFFFF') : colors.mut }]} numberOfLines={1}>
                    {t}
                  </Text>
                );
                return (
                  <PressScale key={k} scaleTo={0.97} onPress={() => setSeg(k)} style={{ flex: 1 }}>
                    {on && k === 'save' ? (
                      <LinearGradient colors={['#6230B8', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.segBtn}>
                        {txt}
                      </LinearGradient>
                    ) : (
                      <View style={[styles.segBtn, { backgroundColor: on ? (k === 'cancel' ? colors.red : colors.line2) : 'transparent' }]}>
                        {txt}
                      </View>
                    )}
                  </PressScale>
                );
              })}
            </View>

            <View style={[styles.outCard, { backgroundColor: colors.bg2, borderColor: out.border }]}>
              <Text style={[styles.outLabel, { color: colors.mut }]}>{out.label}</Text>
              <Text style={[styles.outValue, { color: out.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {out.value}
              </Text>
              <Text style={[styles.outLine, { color: colors.mut }]}>{out.line}</Text>

              {seg === 'save' ? (
                <>
                  <View style={[styles.row, { gap: 8, marginTop: 14 }]}>
                    {(['half', 'match'] as const).map(m => {
                      const on = curMode === m;
                      return (
                        <PressScale key={m} scaleTo={0.97} onPress={() => pickMode(m)} disabled={smartBusy} style={{ flex: 1 }}>
                          <View
                            style={[
                              styles.modeBtn,
                              { borderColor: on ? colors.gold : colors.line2, backgroundColor: on ? colors.goldSoft : 'transparent' },
                            ]}
                          >
                            <Text style={[styles.modeTitle, { color: colors.ink }]} numberOfLines={1}>
                              {m === 'half' ? 'Save half' : 'Match full'}
                            </Text>
                            <Text style={[styles.modeAmt, { color: colors.mut }]} numberOfLines={1}>
                              +{formatCents(m === 'match' ? P : H)} each charge
                            </Text>
                          </View>
                        </PressScale>
                      );
                    })}
                  </View>
                  <View style={[styles.row, { gap: 10, marginTop: 12 }]}>
                    <View style={{ width: 26 + Math.max(0, Math.min(others.length, 3) - 1) * 16, height: 26 }}>
                      {(others.length ? others.slice(0, 3) : [{ subscriptionId: sub.id, merchantName: name }]).map((o, i) => (
                        <View key={o.subscriptionId} style={[styles.stackMark, { left: i * 16, borderColor: colors.bg2 }]}>
                          <MerchantMark name={o.merchantName} size={22} />
                        </View>
                      ))}
                    </View>
                    <Text style={[styles.poolNote, { color: colors.mut }]}>
                      {mine ? 'Saving into' : 'Goes into'}{' '}
                      <Text style={{ fontFamily: fontFamily.bold, color: colors.ink }}>Subscription savings</Text>{' '}
                      {others.length
                        ? `with ${listNames(others.map(o => o.merchantName))}${mine ? '' : ', not a goal of its own'}`
                        : 'as its first subscription'}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {doneText ? (
              <>
                <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
                  <Text style={[styles.bannerText, { color: colors.success }]}>{doneText}</Text>
                </View>
                {seg === 'save' ? (
                  <PressScale scaleTo={0.98} onPress={() => router.push('/screens/SubscriptionPool')}>
                    <View style={[styles.openPool, { borderColor: colors.line2 }]}>
                      <Text style={[styles.openPoolText, { color: colors.accInk }]}>Open Subscription savings</Text>
                      <Ionicons name="chevron-forward" size={13} color={colors.accInk} />
                    </View>
                  </PressScale>
                ) : null}
              </>
            ) : (
              <PressScale scaleTo={0.98} onPress={onCta} disabled={busy}>
                {seg === 'save' ? (
                  <LinearGradient
                    colors={['#6230B8', '#4C1D95', '#3E1680']}
                    locations={[0, 0.55, 1]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.cta, styles.ctaShadow, { opacity: busy ? 0.7 : 1 }]}
                  >
                    <DoveLoader active={busy} />
                    <Text style={styles.ctaText} numberOfLines={1}>{ctaLabel}</Text>
                  </LinearGradient>
                ) : (
                  <View
                    style={[
                      styles.cta,
                      seg === 'keep'
                        ? { borderWidth: 1.5, borderColor: colors.line2 }
                        : { backgroundColor: colors.red, opacity: busy ? 0.7 : 1 },
                    ]}
                  >
                    <DoveLoader active={busy} />
                    <Text style={[styles.ctaText, seg === 'keep' && { color: colors.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                      {ctaLabel}
                    </Text>
                  </View>
                )}
              </PressScale>
            )}
            {seg === 'save' && smartError ? (
              <Text style={[styles.outLine, { color: colors.red, marginTop: 8 }]}>{smartError}</Text>
            ) : null}
            {seg === 'cancel' && cancelNote ? <Body style={{ marginTop: 8, textAlign: 'center' }}>{cancelNote}</Body> : null}

            {/* --- Charges ---------------------------------------------------- */}
            {n > 0 ? (
              <>
                <View style={[styles.row, { alignItems: 'baseline', marginTop: 28, marginBottom: 8 }]}>
                  <Text style={[styles.chargesTitle, { color: colors.ink }]}>Charges</Text>
                  {n > 3 ? (
                    <PressScale scaleTo={0.95} onPress={() => setHist(h => !h)}>
                      <View style={[styles.row, { gap: 4 }]}>
                        <Text style={[styles.histToggle, { color: colors.accInk }]}>{hist ? 'Show less' : `All ${n}`}</Text>
                        <Ionicons name={hist ? 'chevron-up' : 'chevron-down'} size={12} color={colors.accInk} />
                      </View>
                    </PressScale>
                  ) : null}
                </View>
                <View style={[styles.chargesCard, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
                  {shown.map((c, i) => {
                    const older = charges[i + 1];
                    const note = older && c.amountCents > older.amountCents ? `↑ ${pctUp(c.amountCents, older.amountCents)}%` : '';
                    return (
                      <View key={c.id} style={[styles.chargeRow, { borderTopColor: i ? colors.line : 'transparent' }]}>
                        <Text style={[styles.chargeDate, { color: colors.ink }]} numberOfLines={1}>
                          {fullDate(new Date(c.chargeTimestamp))}
                        </Text>
                        {note ? (
                          <View style={[styles.noteTag, { backgroundColor: colors.goldSoft }]}>
                            <Text style={[styles.noteText, { color: colors.gold }]}>{note}</Text>
                          </View>
                        ) : null}
                        <Text style={[styles.chargeAmt, { color: colors.red }]}>{formatCents(c.amountCents)}</Text>
                      </View>
                    );
                  })}
                  {earlier.length ? (
                    <View style={[styles.chargeRow, { borderTopColor: colors.line }]}>
                      <Text style={[styles.chargeDate, { color: colors.ink }]} numberOfLines={1}>
                        {earlier.length} earlier · {monthYYYY(new Date(earlier[earlier.length - 1].chargeTimestamp))} –{' '}
                        {monthYYYY(new Date(earlier[0].chargeTimestamp))}
                      </Text>
                      <Text style={[styles.chargeAmt, { color: colors.mut }]}>
                        {formatCents(earlier.reduce((s, c) => s + c.amountCents, 0))}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
        </ScreenBody>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.14)',
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroName: { fontFamily: fontFamily.bold, fontSize: 15, color: '#FFFFFF', flexShrink: 1 },
  activePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(231,199,126,.18)' },
  activeText: { fontFamily: fontFamily.bold, fontSize: 9.5, letterSpacing: 0.6, color: HERO.gold },
  heroMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: HERO.sub },
  heroPrice: { fontFamily: fontFamily.serif, fontSize: 96, lineHeight: 100, letterSpacing: -2, color: '#FFFFFF', flexShrink: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  chipText: { fontFamily: fontFamily.bold, fontSize: 11.5 },
  heroStory: { fontFamily: fontFamily.regular, fontSize: 12.5, color: HERO.sub },
  stairs: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 150, marginTop: 22 },
  stepCol: { flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end' },
  step: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    paddingTop: 9,
    paddingHorizontal: 9,
    overflow: 'hidden',
  },
  stepPrice: { fontFamily: fontFamily.bold, fontSize: 14 },
  stepDur: { fontFamily: fontFamily.regular, fontSize: 10.5, marginTop: 1 },
  riseTag: { position: 'absolute', left: -5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, backgroundColor: HERO.gold },
  riseText: { fontFamily: fontFamily.bold, fontSize: 10, color: HERO.goldInk },
  nextStep: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(231,199,126,.6)',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  nextTitle: { fontFamily: fontFamily.bold, fontSize: 11, color: HERO.gold },
  nextDate: { fontFamily: fontFamily.regular, fontSize: 10, color: HERO.sub },
  stepRange: { flex: 1, minWidth: 0, fontFamily: fontFamily.regular, fontSize: 10, color: 'rgba(201,188,232,.8)' },
  stats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.12)',
  },
  statLabel: { fontFamily: fontFamily.semibold, fontSize: 9.5, letterSpacing: 0.5 },
  statValue: { fontFamily: fontFamily.bold, fontSize: 14.5, color: '#FFFFFF', marginTop: 3 },
  sheet: {
    flex: 1,
    marginTop: -24,
    paddingTop: 24,
    paddingBottom: layout.contentBottom,
    paddingHorizontal: layout.screenX,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
  },
  sheetTitle: { fontFamily: fontFamily.serif, fontSize: 32, lineHeight: 34 },
  sheetSub: { fontFamily: fontFamily.regular, fontSize: 12.5, marginTop: 4 },
  segTrack: { flexDirection: 'row', marginTop: 16, padding: 4, borderRadius: 24, borderWidth: 1 },
  segBtn: { height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fontFamily.bold, fontSize: 13 },
  outCard: { marginTop: 12, padding: 18, borderRadius: 20, borderWidth: 1 },
  outLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 0.5 },
  outValue: { fontFamily: fontFamily.serif, fontSize: 52, lineHeight: 56, letterSpacing: -1, marginTop: 4 },
  outLine: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginTop: 8 },
  modeBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2 },
  modeTitle: { fontFamily: fontFamily.bold, fontSize: 13 },
  modeAmt: { fontFamily: fontFamily.regular, fontSize: 11.5, marginTop: 1 },
  stackMark: {
    position: 'absolute',
    top: 0,
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  poolNote: { flex: 1, minWidth: 0, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  cta: {
    marginTop: 12,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaShadow: { boxShadow: '0 14px 30px -8px rgba(98,48,184,.7)' },
  ctaText: { fontFamily: fontFamily.bold, fontSize: 14.5, color: '#FFFFFF', textAlign: 'center' },
  banner: { marginTop: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14 },
  bannerText: { fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 18 },
  openPool: {
    marginTop: 10,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  openPoolText: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  chargesTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 16.5 },
  histToggle: { fontFamily: fontFamily.bold, fontSize: 12.5 },
  chargesCard: { paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1 },
  chargeDate: { flex: 1, fontFamily: fontFamily.semibold, fontSize: 13 },
  noteTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  noteText: { fontFamily: fontFamily.bold, fontSize: 10 },
  chargeAmt: { fontFamily: fontFamily.bold, fontSize: 13 },
});

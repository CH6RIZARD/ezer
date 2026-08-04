// =============================================================================
// EZER Redesign — Home / dashboard (handoff §1)
//
// Header row (gear · greeting + "Your Dashboard" · EZER wordmark), a 2x2 stat
// grid where ALL FOUR tiles are pressable, the Pay in 4 banner, a Calendar/List
// segmented toggle, and the hero calendar whose days open the §2 popover.
//
// Data comes from DataContext (which falls back to bundled demo data when the
// API is unreachable), so the dashboard totals always agree with the detail
// screens.
// =============================================================================

import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../utils/ThemeContext';
import { usePremium } from '../../utils/PremiumContext';
import { useData } from '../../contexts/DataContext';
import { formatCents } from '../../utils/calculations';

import { isLoosePreviewMode } from '../../utils/expoRuntime';
import { fontFamily, typeScale, radius, layout, motion } from '../../theme/type';
import {
  Label,
  Body,
  Surface,
  PressScale,
  PulseRing,
  ScreenBody,
  Wordmark,
} from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import DayPopover, { type DayEvent } from '../../components/redesign/DayPopover';
import RotatingTile from '../../components/redesign/RotatingTile';
import NfcTapIcon from '../../components/redesign/NfcTapIcon';
import { useSavingsGoals } from '../../utils/SavingsGoalsContext';
import { projectMonthEvents, groupEventsByDay } from '../../utils/calendarEvents';
import { useConnectBank } from '../../utils/useConnectBank';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** Handoff: spending power is a fixed $400 in the prototype. */
const SPENDING_POWER_CENTS = 40000;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning ✳';
  if (h < 18) return 'Good Afternoon ✳';
  return 'Good Evening ✳';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const premium = usePremium();
  const { homeSummary, risks, subscriptions, instruments } = useData();
  const { goals } = useSavingsGoals();
  const connectBank = useConnectBank();

  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [monthOffset, setMonthOffset] = useState(0);
  const [popDate, setPopDate] = useState<Date | null>(null);

  useEffect(() => {
    if (premium.status === 'expired' && !isLoosePreviewMode()) {
      router.replace('/screens/Paywall');
    }
  }, [premium.status]);

  // --- calendar model ---------------------------------------------------------
  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [monthOffset]);

  /**
   * Events for the month ON SCREEN, projected from each subscription's
   * recurrence rule — not read out of the 30-day risk window.
   *
   * Reading from `risks` meant a monthly subscription appeared exactly once and
   * every other month was blank, which is not what a calendar is for.
   */
  const byDay = useMemo(() => {
    const events = projectMonthEvents(
      subscriptions,
      risks,
      month.getFullYear(),
      month.getMonth()
    );
    const grouped = groupEventsByDay(events);

    const map = new Map<string, DayEvent[]>();
    for (const [day, list] of grouped) {
      const key = `${month.getFullYear()}-${month.getMonth()}-${day}`;
      map.set(
        key,
        list.map(e => ({
          id: e.id,
          merchantId: e.merchantId,
          merchantName: e.merchantName,
          amountCents: e.amountCents,
          type: e.type,
          afterTrialCents: e.afterTrialCents,
          logo: e.logo,
          subscriptionId: e.subscriptionId,
        }))
      );
    }
    return map;
  }, [subscriptions, risks, month]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const out: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(new Date(month.getFullYear(), month.getMonth(), d));
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  const eventsFor = (d: Date | null) =>
    d ? byDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [] : [];

  const today = new Date();
  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const popEvents = eventsFor(popDate);

  const openSub = (subscriptionId: string) => {
    setPopDate(null);
    router.push({ pathname: '/screens/SubscriptionDetail', params: { id: subscriptionId } });
  };

  // --- stat tiles -------------------------------------------------------------
  // Top-left  : Monthly Burn, with 30-day risk folded in as its subline
  // Top-right : Current Savings — total across every goal
  // Bottom-L  : rotating panel (physical card CTA <-> top ticket) — rendered
  //             separately below, since it is not a plain stat tile
  // Bottom-R  : Spending Power -> Pay in 4 (unchanged)
  const savingsTotalCents = Math.round(
    goals.reduce((sum, g) => sum + (g.currentAmount ?? 0), 0) * 100
  );

  const riskCents = homeSummary?.next30DayRisk ?? 0;

  const tiles = [
    {
      key: 'burn',
      icon: 'warning-outline' as const,
      tint: colors.red,
      value: formatCents(homeSummary?.monthlyBurnRate ?? 0),
      label: 'Monthly Burn',
      // 30-day risk now lives here instead of its own tile.
      sub: `${formatCents(riskCents)} at risk · 30d`,
      onPress: () => setView('list'),
    },
    {
      key: 'savings',
      icon: 'wallet-outline' as const,
      tint: colors.success,
      value: formatCents(savingsTotalCents),
      label: 'Current Savings',
      sub: `${goals.length} goal${goals.length === 1 ? '' : 's'}`,
      onPress: () => router.push('/(tabs)/savings'),
    },
  ];

  /**
   * Monthly cost of each merchant's most recent charge. Ranking "Top ticket" off
   * the upcoming-risk list alone was wrong: a subscription that simply has no
   * renewal inside the 30-day window read as $0 and sorted last. The real price
   * is the latest charge, normalised to a monthly figure.
   */
  const monthlyByMerchant = useMemo(() => {
    // NB: utils/calculations#getMonthlyEquivalent returns DOLLARS, so it is not
    // usable here — everything on this screen is cents.
    const perMonthCents = (cents: number, cadence: string) => {
      if (cadence === 'yearly') return Math.round(cents / 12);
      if (cadence === 'weekly') return Math.round((cents * 52) / 12);
      return cents;
    };

    // Priced from the user's OWN subscriptions. This read demoCharges, so the
    // "Top ticket" tile ranked merchants the user had never subscribed to.
    const out = new Map<string, number>();
    for (const s of subscriptions) {
      if (!s.amountCents) continue;
      out.set(s.merchantId, perMonthCents(s.amountCents, s.cadence));
    }
    return out;
  }, [subscriptions]);

  /**
   * Spending power — derived, never a constant.
   *
   * This tile read a hardcoded $400, which claimed a Pay-in-4 limit for a user
   * who had linked no bank and been approved for nothing. What it shows now
   * depends on where the user actually is:
   *
   *   no bank linked   -> "Link a bank"      (the only unblocking action)
   *   linked, no limit -> "Check your limit" (runs the Plaid trust assessment)
   *   approved         -> the real limit, minus anything outstanding
   *   money owed       -> "Pay off $X"       (settling comes before spending)
   *
   * Pay in 4 has not launched, so nobody reaches the last two states yet —
   * they are wired rather than faked, and turn on with the approval flow.
   */
  const spendingPower = useMemo<{
    value: string;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    isAmount: boolean;
    pulse: boolean;
    onPress: () => void;
  }>(() => {
    const linked = instruments.length > 0 || subscriptions.length > 0;

    // An em dash, not "Link a bank".
    //
    // The rotating tile to its immediate left ALREADY says "Connect your bank"
    // — two adjacent cells asking for the same action read as a broken layout,
    // and it costs the grid its shape: three stat tiles and one stray CTA.
    // "—" keeps the tile in its stat form and still says, truthfully, that
    // there is no figure yet. Tapping it still starts the right flow.
    if (!linked) {
      return {
        value: '—',
        label: 'Spending Power',
        icon: 'cash-outline' as const,
        isAmount: true,
        // No pulse: nothing here is unlocked, and the left tile is already
        // pulsing for the same action.
        pulse: false,
        onPress: () => void connectBank.connect(),
      };
    }

    // Linked but not yet assessed. Still shown as a value — the limit is simply
    // not known until the Pay-in-4 trust assessment runs
    // (POST /cards/access-list returns limitCents).
    return {
      value: '—',
      label: 'Spending Power',
      icon: 'cash-outline' as const,
      isAmount: true,
      pulse: true,
      onPress: () => router.push('/screens/PhysicalCardApproval'),
    };
  }, [instruments.length, subscriptions.length, connectBank]);

  /** Top three subscriptions by cost, for the "Top ticket" rotation. */
  const topTicket = useMemo(() => {
    // Fallback for live API data, where charge history is not on this screen:
    // the largest known amount the risk feed reports for that subscription.
    const riskBySub = new Map<string, number>();
    for (const r of risks) {
      const prev = riskBySub.get(r.subscriptionId) ?? 0;
      if (r.amountCents > prev) riskBySub.set(r.subscriptionId, r.amountCents);
    }

    return subscriptions
      .map(s => ({
        id: s.id,
        merchantId: s.merchantId,
        name: s.merchantName,
        logo: s.logo,
        cents: monthlyByMerchant.get(s.merchantId) ?? riskBySub.get(s.id) ?? 0,
      }))
      .filter(t => t.cents > 0)
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 3);
  }, [subscriptions, risks, monthlyByMerchant]);

  const topTicketCents = useMemo(
    () => topTicket.reduce((sum, t) => sum + t.cents, 0),
    [topTicket]
  );

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
          {/* --- header ------------------------------------------------------ */}
          <View style={styles.header}>
            <PressScale onPress={() => router.push('/settings')} scaleTo={0.9}>
              <View style={[styles.gear, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Ionicons name="settings-outline" size={18} color={colors.ink} />
              </View>
            </PressScale>

            {/* The centre block must be allowed to shrink, and both side slots
                must reserve equal width — otherwise the 24px title and the
                2.5px-tracked wordmark collide on narrow screens. */}
            <View style={styles.headerCenter}>
              <Text style={[typeScale.greeting, { color: colors.mut }]} numberOfLines={1}>
                {greeting()}
              </Text>
              <Text
                style={[typeScale.dashTitle, { color: colors.ink }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Your Dashboard
              </Text>
            </View>

            <View style={styles.headerSide}>
              <Wordmark style={{ textAlign: 'right' }} />
            </View>
          </View>

          {/* --- 2x2 grid ----------------------------------------------------- */}
          <View style={styles.grid}>
            {tiles.map(t => (
              <PressScale key={t.key} onPress={t.onPress} style={styles.gridItem}>
                {(
                  <View
                    style={[
                      styles.tile,
                      { backgroundColor: colors.card, borderColor: colors.line, borderWidth: 1 },
                    ]}
                  >
                    <Ionicons name={t.icon} size={22} color={t.tint} />
                    <Text
                      style={[typeScale.statValue, { color: colors.ink }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {t.value}
                    </Text>
                    <Label numberOfLines={1} adjustsFontSizeToFit>
                      {t.label}
                    </Label>
                    {!!t.sub && (
                      <Text style={[styles.tileSub, { color: colors.mut2 }]} numberOfLines={1}>
                        {t.sub}
                      </Text>
                    )}
                  </View>
                )}
              </PressScale>
            ))}

            {/* bottom-left: rotating panel of call-outs */}
            <RotatingTile
              style={styles.gridItem}
              slides={[
                // Connect-a-bank leads the rotation while nothing is linked —
                // with no accounts there is no burn, no risk and no top ticket,
                // so this is the only card that can actually do anything. Once
                // a bank IS connected it drops to the end rather than
                // disappearing, since people add second and third accounts.
                {
                  key: 'connect-bank',
                  onPress: () => void connectBank.connect(),
                  render: () => (
                    <View style={styles.slide}>
                      <Ionicons
                        name={connectBank.connected ? 'add-circle-outline' : 'link-outline'}
                        size={26}
                        color={colors.accInk}
                      />
                      <Label numberOfLines={2} adjustsFontSizeToFit style={styles.slideLabel}>
                        {connectBank.connected ? 'Add another bank' : 'Connect your bank'}
                      </Label>
                      <Text
                        style={[styles.slideCta, { color: colors.accInk }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        {connectBank.label ?? (connectBank.connected ? 'Add →' : 'Link it →')}
                      </Text>
                    </View>
                  ),
                },
                {
                  key: 'physical-card',
                  onPress: () => router.push('/screens/PhysicalCard'),
                  render: () => (
                    <View style={styles.slide}>
                      <NfcTapIcon size={28} />
                      <Label numberOfLines={2} adjustsFontSizeToFit style={styles.slideLabel}>
                        Get your physical card
                      </Label>
                      <Text
                        style={[styles.slideCta, { color: colors.accInk }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.75}
                      >
                        Design it →
                      </Text>
                    </View>
                  ),
                },
                {
                  key: 'top-ticket',
                  onPress: () => router.push('/screens/DrainReview'),
                  render: () => (
                    <View style={styles.slide}>
                      <View style={styles.topTicketRow}>
                        {topTicket.map(t => (
                          <MerchantMark
                            key={t.id}
                            name={t.name}
                            merchantId={t.merchantId}
                            logoUrl={t.logo}
                            size={24}
                          />
                        ))}
                      </View>
                      <Label numberOfLines={1} adjustsFontSizeToFit style={styles.slideLabel}>
                        Top ticket
                      </Label>
                      <Text
                        style={[styles.slideCta, { color: colors.red }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {`${formatCents(topTicketCents)}/mo`}
                      </Text>
                    </View>
                  ),
                },
              ]}
            />

            {/* bottom-right: spending power — state-driven, never a fixed number */}
            <PressScale onPress={spendingPower.onPress} style={styles.gridItem}>
              <LinearGradient
                colors={colors.goldTile as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[styles.tile, { borderColor: colors.goldLine, borderWidth: 1 }]}
              >
                {/* The pulse is an invitation to act. It only earns its place
                    when there IS an action; on a settled balance it is noise. */}
                {spendingPower.pulse && <PulseRing radius={radius.card} />}
                <Ionicons name={spendingPower.icon} size={22} color={colors.gold} />
                <Text
                  style={[
                    // A dollar amount gets the serif display face; a short
                    // instruction like "Link a bank" does not — set in serif
                    // italic it reads as a value rather than an action.
                    spendingPower.isAmount ? typeScale.statValue : styles.tileAction,
                    { color: colors.gold },
                  ]}
                  numberOfLines={spendingPower.isAmount ? 1 : 2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {spendingPower.value}
                </Text>
                <Label numberOfLines={1} adjustsFontSizeToFit>
                  {spendingPower.label}
                </Label>
              </LinearGradient>
            </PressScale>
          </View>

          {/* --- Pay in 4 banner --------------------------------------------- */}
          <PressScale onPress={() => router.push('/(tabs)/payin4')} style={{ marginTop: 12 }}>
            <View style={styles.banner}>
              {/* 40px r13 translucent tile holding a GOLD card glyph — this was
                  missing entirely and is the most visible part of the banner. */}
              <View style={styles.bannerIcon}>
                <Ionicons name="card-outline" size={20} color="#E7C77E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Ezer Pay in 4</Text>
                <Text style={styles.bannerSub}>Spin the card. Split anything in four.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,.75)" />
            </View>
          </PressScale>

          {/* --- calendar / list toggle -------------------------------------- */}
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {(['calendar', 'list'] as const).map(v => {
              const active = view === v;
              return (
                <Pressable
                  key={v}
                  onPress={() => setView(v)}
                  style={[styles.segmentItem, active && { backgroundColor: colors.accent }]}
                >
                  {/* Inactive is transparent with `ink` text in the prototype —
                      muted grey made the unselected tab look disabled. */}
                  <Ionicons
                    name={v === 'calendar' ? 'calendar-outline' : 'list-outline'}
                    size={15}
                    color={active ? '#FFFFFF' : colors.ink}
                  />
                  <Text style={[styles.segmentLabel, { color: active ? '#FFFFFF' : colors.ink }]}>
                    {v === 'calendar' ? 'Calendar' : 'List'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {view === 'calendar' ? (
            <Surface radius={radius.hero} style={styles.calendar}>
              <View style={styles.monthRow}>
                <PressScale onPress={() => setMonthOffset(m => m - 1)} scaleTo={0.9}>
                  <View style={[styles.monthBtn, { borderColor: colors.line }]}>
                    <Ionicons name="chevron-back" size={16} color={colors.ink} />
                  </View>
                </PressScale>
                <Text style={[typeScale.serifTitle, { color: colors.ink }]}>
                  {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <PressScale onPress={() => setMonthOffset(m => m + 1)} scaleTo={0.9}>
                  <View style={[styles.monthBtn, { borderColor: colors.line }]}>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink} />
                  </View>
                </PressScale>
              </View>

              <View style={styles.weekRow}>
                {WEEKDAYS.map(w => (
                  <Text key={w} style={[styles.weekday, { color: colors.mut2 }]}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.daysWrap}>
                {cells.map((d, i) => {
                  const evts = eventsFor(d);
                  const has = evts.length > 0;
                  const dayTotal = evts.reduce((s, e) => s + e.amountCents, 0);

                  return (
                    <PressScale
                      key={i}
                      scaleTo={motion.pressScaleStrong}
                      disabled={!has}
                      onPress={() => d && has && setPopDate(d)}
                      style={styles.dayCellWrap}
                    >
                      <View
                        style={[
                          styles.dayCell,
                          {
                            backgroundColor: d
                              ? has
                                ? colors.cellHl
                                : colors.cellBg
                              : 'transparent',
                          },
                        ]}
                      >
                        {d && (
                          <>
                            {isToday(d) ? (
                              <View style={[styles.todayPill, { backgroundColor: colors.accent }]}>
                                <Text style={styles.todayText}>{d.getDate()}</Text>
                              </View>
                            ) : (
                              <Text style={[styles.dayNum, { color: colors.ink }]}>
                                {d.getDate()}
                              </Text>
                            )}

                            {has && (
                              <>
                                <View style={styles.badgeRow}>
                                  {evts.slice(0, 3).map(e => (
                                    <MerchantMark
                                      key={e.id}
                                      name={e.merchantName}
                                      merchantId={e.merchantId}
                                      logoUrl={e.logo}
                                      size={15}
                                    />
                                  ))}
                                </View>
                                <Text style={[styles.dayTotal, { color: colors.red }]}>
                                  -{formatCents(dayTotal)}
                                </Text>
                              </>
                            )}
                          </>
                        )}
                      </View>
                    </PressScale>
                  );
                })}
              </View>

              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: colors.red }]} />
                  <Text style={[styles.legendText, { color: colors.mut }]}>Renewals</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: colors.gold }]} />
                  <Text style={[styles.legendText, { color: colors.mut }]}>Trials ending</Text>
                </View>
              </View>
            </Surface>
          ) : (
            <View style={{ marginTop: 14, gap: 8 }}>
              {risks.map(r => (
                <PressScale key={r.id} onPress={() => openSub(r.subscriptionId)}>
                  <Surface style={styles.listRow}>
                    <MerchantMark
                      name={r.merchantName}
                      merchantId={r.subscriptionId}
                      logoUrl={r.logo}
                      size={40}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowName, { color: colors.ink }]} numberOfLines={1}>
                        {r.merchantName}
                      </Text>
                      <Text style={[styles.rowMeta, { color: colors.mut }]} numberOfLines={1}>
                        {r.type === 'trial' ? 'Trial' : 'Renewal'} ·{' '}
                        {new Date(r.dueDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.rowAmount, { color: colors.ink }]}>
                        {formatCents(r.amountCents)}
                      </Text>
                      <View
                        style={[
                          styles.inChip,
                          {
                            backgroundColor:
                              r.type === 'trial' ? colors.goldSoft : colors.red + '1F',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.inChipText,
                            { color: r.type === 'trial' ? colors.gold : colors.red },
                          ]}
                        >
                          in {r.daysUntilDue}d
                        </Text>
                      </View>
                    </View>
                  </Surface>
                </PressScale>
              ))}
              {risks.length === 0 && (
                <Body style={{ textAlign: 'center', marginTop: 20 }}>
                  Nothing due in the next 30 days.
                </Body>
              )}
            </View>
          )}
        </ScreenBody>
      </ScrollView>

      <DayPopover
        visible={popDate !== null}
        date={popDate}
        events={popEvents}
        onClose={() => setPopDate(null)}
        onSelect={e => openSub(e.subscriptionId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    // Without this the centre block refuses to shrink below its content width
    // and pushes into the wordmark.
    minWidth: 0,
    paddingHorizontal: 8,
  },
  // Mirrors the 42px gear button so the centre block is genuinely centred.
  headerSide: {
    width: 52,
    alignItems: 'flex-end',
  },
  gear: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  gridItem: {
    width: '48%',
    flexGrow: 1,
    // Keeps all four cells the same height regardless of content. 132 is also
    // the natural height of the three static tiles (16 + 22 icon + 23pt value +
    // label + sub + 16), so raising it would leave a strip of page background
    // under them while the rotating tile — which fills its cell — stayed tall.
    // The rotating tile is therefore made to FIT 132 rather than the reverse.
    minHeight: 132,
  },
  /** Action copy in the stat-tile slot — sans, not the serif display face. */
  tileAction: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    textAlign: 'center',
  },
  tileSub: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    textAlign: 'center',
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Full width so the label and price can use the whole tile; the arrows sit
    // on their own row underneath rather than beside this content.
    alignSelf: 'stretch',
    gap: 3,
  },
  slideLabel: {
    textAlign: 'center',
    marginTop: 3,
    alignSelf: 'stretch',
    // Shrink before the price does if the OS font scale is cranked up.
    flexShrink: 1,
  },
  slideCta: {
    fontFamily: fontFamily.bold,
    fontSize: 12.5,
    // Explicit line height: the default clipped the descender/`$` on the price.
    lineHeight: 17,
    textAlign: 'center',
    alignSelf: 'stretch',
    marginTop: 1,
  },
  topTicketRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 1,
  },
  tile: {
    // Fills the height handed down by the grid cell, so all four boxes match.
    flex: 1,
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 6,
    overflow: 'hidden',
    // Prototype centres the icon, value and label within each tile.
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    backgroundColor: '#2E1065',
    borderRadius: radius.card,
    // Prototype: padding 14px 16px, gap 12.
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  bannerSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    // Lavender, not white-alpha — measured off the prototype.
    color: '#C9BCE8',
    marginTop: 3,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.buttonSm,
    borderWidth: 1,
    padding: 4,
    marginTop: 18,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Prototype: gap 7, padding 10px 0, radius 10.
    gap: 7,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segmentLabel: {
    // 14px/600 in the prototype, not 13/700.
    fontFamily: fontFamily.semibold,
    fontSize: 14,
  },
  calendar: {
    marginTop: 14,
    padding: 14,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  daysWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  dayCellWrap: {
    width: `${100 / 7}%`,
    padding: 2,
  },
  dayCell: {
    minHeight: layout.calCellMinHeight,
    borderRadius: radius.cell,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    gap: 3,
  },
  dayNum: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  todayPill: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
    color: '#FFFFFF',
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 2,
  },
  dayTotal: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  listRow: {
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
  inChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  inChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
});

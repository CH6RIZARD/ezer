// =============================================================================
// EZER — Subscription savings (the pool)
//
// PATCH-NOTES-subscription-savings.md: a user has at most ONE goal that every
// subscription with smart saving feeds. This screen is that goal: how much it
// holds, which subscriptions fed it, and per source switch Half/Match, Pause /
// Resume or Stop. Stopping keeps the money in the goal; a stopped source can be
// restarted. "Add" lists subscriptions without a live source.
//
// Every write goes through SavingsGoalsContext (server write, then re-read).
// There is no target, so no progress ring: it grows with each charge.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../../utils/appAlert';
import { useTheme } from '../../utils/ThemeContext';
import {
  useSavingsGoals,
  type PoolSource,
  type SubscriptionSavingMode,
  type MoveResult,
  type PoolRecent,
} from '../../utils/SavingsGoalsContext';
import { useData, type Subscription } from '../../contexts/DataContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, radius, layout } from '../../theme/type';
import { Body, Surface, ScreenBody, Skeleton } from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import { useCameraDove, CameraDoveHost } from '../../components/CameraDove';

const money = (dollars: number) => formatCents(Math.round(dollars * 100));

/** "Nov 3". A bare YYYY-MM-DD is a local calendar day, not UTC midnight. */
function monthDay(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const isToday = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString();
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function SubscriptionPoolScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    pool,
    hydrated,
    setSubscriptionSaving,
    pauseSubscriptionSaving,
    resumeSubscriptionSaving,
    stopSubscriptionSaving,
  } = useSavingsGoals();
  const { subscriptions } = useData();

  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** subscriptionId of the write in flight: that row dims and the dove flies. */
  const [busy, setBusy] = useState<string | null>(null);
  useCameraDove(busy !== null);

  const sources = pool?.sources ?? [];
  const live = sources.filter(s => s.status !== 'ENDED');
  const active = live.filter(s => s.status === 'ACTIVE');
  const ended = sources.filter(s => s.status === 'ENDED');
  const saved = pool?.saved ?? 0;
  const perCycle = pool?.perCycle ?? 0;
  const sk = !hydrated;

  const subFor = (id: string): Subscription | undefined => subscriptions.find(s => s.id === id);

  /** The subscription's price, else worked back from what the source moves per charge. */
  const priceOf = (s: PoolSource): number => {
    const cents = subFor(s.subscriptionId)?.amountCents;
    if (typeof cents === 'number' && cents > 0) return cents / 100;
    return s.mode === 'HALF' ? s.perCharge * 2 : s.perCharge;
  };
  const perFor = (price: number, mode: SubscriptionSavingMode) =>
    mode === 'HALF' ? Math.round(price * 50) / 100 : price;

  // Subscriptions that could feed the pool: still running, and no live source.
  const eligible = useMemo(
    () =>
      subscriptions.filter(sub => {
        if (/cancel/i.test(sub.status)) return false;
        const src = sources.find(s => s.subscriptionId === sub.id);
        return !src || src.status === 'ENDED';
      }),
    [subscriptions, sources]
  );

  const history = (pool?.recent ?? []).slice(0, 10);

  const run = async (id: string, op: () => Promise<MoveResult>, title: string) => {
    if (busy) return;
    setBusy(id);
    const res = await op();
    setBusy(null);
    if (!res.ok) Alert.alert(title, res.error);
  };

  const add = (sub: Subscription, mode: SubscriptionSavingMode) => {
    setAdding(false);
    void run(sub.id, () => setSubscriptionSaving(sub.id, mode), 'Could not add it');
  };

  const shareColors = [colors.accInk, colors.gold, colors.mut, colors.mut2, colors.line2];
  // `total` (saved + pending + queued): no ACH processor yet, so `saved` alone stays 0.
  const shareBase = sources.filter(s => s.total > 0);
  const shareTotal = shareBase.reduce((a, s) => a + s.total, 0);

  // --- source row ---------------------------------------------------------------

  const renderSource = (s: PoolSource) => {
    const sub = subFor(s.subscriptionId);
    const isOpen = open === s.subscriptionId;
    const paused = s.status === 'PAUSED';
    const next = monthDay(s.renewalDate ?? sub?.renewalDate);
    const half = s.mode === 'HALF';
    const price = priceOf(s);
    const rowBusy = busy === s.subscriptionId;

    return (
      <View
        key={s.subscriptionId}
        style={[
          styles.sourceCard,
          { backgroundColor: colors.card, borderColor: colors.line, opacity: rowBusy ? 0.55 : paused ? 0.7 : 1 },
        ]}
      >
        <Pressable
          onPress={() => setOpen(isOpen ? null : s.subscriptionId)}
          style={styles.sourceHead}
        >
          <MerchantMark name={s.merchantName} merchantId={sub?.merchantId} logoUrl={s.logo ?? sub?.logo} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.sourceName, { color: colors.ink }]} numberOfLines={1}>
                {s.merchantName}
              </Text>
              <View style={[styles.chip, { backgroundColor: half ? colors.goldSoft : colors.accSoft }]}>
                <Text style={[styles.chipText, { color: half ? colors.gold : colors.accInk }]}>
                  {half ? 'SAVE HALF' : 'MATCH FULL'}
                </Text>
              </View>
            </View>
            <Text style={[styles.sourceSub, { color: colors.mut2 }]} numberOfLines={1}>
              {paused
                ? `Paused · was +${money(s.perCharge)} each charge`
                : `+${money(s.perCharge)} each charge${next ? ` · next ${next}` : ''}`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.sourceSaved, { color: s.total > 0 ? colors.success : colors.mut2 }]}>
              {money(s.total)}
            </Text>
            <Text style={[styles.sourceCharges, { color: colors.mut2 }]} numberOfLines={1}>
              {s.charges > 0
                ? plural(s.charges, 'charge', 'charges')
                : next
                ? `starts ${next}`
                : 'no charges yet'}
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={12}
            color={colors.mut2}
            style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
          />
        </Pressable>

        {isOpen && (
          <View style={styles.sourceBody}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['HALF', 'MATCH'] as const).map(mode => {
                const on = s.mode === mode;
                return (
                  <Pressable
                    key={mode}
                    disabled={!!busy || on}
                    onPress={() =>
                      run(s.subscriptionId, () => setSubscriptionSaving(s.subscriptionId, mode), 'Could not switch')
                    }
                    style={[
                      styles.modeBox,
                      { borderColor: on ? colors.gold : colors.line, backgroundColor: on ? colors.goldSoft : 'transparent' },
                    ]}
                  >
                    <Text style={[styles.modeLabel, { color: colors.ink }]} numberOfLines={1}>
                      {mode === 'HALF' ? 'Save half' : 'Match full'}
                    </Text>
                    <Text style={[styles.modeAmt, { color: colors.mut }]} numberOfLines={1}>
                      +{money(perFor(price, mode))} each charge
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sourceActions}>
              <Pressable
                disabled={!!busy}
                onPress={() =>
                  run(
                    s.subscriptionId,
                    () =>
                      paused
                        ? resumeSubscriptionSaving(s.subscriptionId)
                        : pauseSubscriptionSaving(s.subscriptionId),
                    'Could not change that'
                  )
                }
                style={[styles.pausePill, { backgroundColor: colors.bg2, borderColor: colors.line }]}
              >
                <Text style={[styles.pauseText, { color: colors.ink }]}>{paused ? 'Resume' : 'Pause'}</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                disabled={!!busy}
                hitSlop={8}
                onPress={() => {
                  setOpen(null);
                  void run(s.subscriptionId, () => stopSubscriptionSaving(s.subscriptionId), 'Could not stop it');
                }}
              >
                <Text style={[styles.stopText, { color: colors.red }]} numberOfLines={1}>
                  Stop saving from {s.merchantName}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    );
  };

  // --- recent row ---------------------------------------------------------------

  // Each charge-driven save, with the subscription it came from. `queued` waits
  // for the weekly sweep, `pending` is in a transfer still clearing.
  const renderTx = (t: PoolRecent, i: number) => {
    const settled = t.state === 'saved';
    const state = t.state === 'queued' ? ' · next sweep' : t.state === 'pending' ? ' · clearing' : '';
    return (
      <View key={t.id} style={[styles.txRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
        <View style={[styles.txIcon, { backgroundColor: colors.successBg }]}>
          <Ionicons name="checkmark" size={14} color={colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.txTitle, { color: colors.ink }]} numberOfLines={1}>
            {t.merchantName} charged
          </Text>
          <Text style={[styles.txMeta, { color: colors.mut2 }]} numberOfLines={1}>
            {isNaN(t.date.getTime()) ? '' : t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {state}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: colors.success, opacity: settled ? 1 : 0.6 }]}>
          +{money(t.amount)}
        </Text>
      </View>
    );
  };

  // --- render -------------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: layout.screenX,
          paddingBottom: insets.bottom + 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenBody>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
              Subscription savings
            </Text>
            <View style={[styles.tag, { backgroundColor: active.length ? colors.successBg : colors.bg2 }]}>
              {active.length > 0 && <Ionicons name="sparkles" size={10} color={colors.success} />}
              <Text style={[styles.tagText, { color: active.length ? colors.success : colors.mut2 }]}>
                {active.length ? 'AUTO' : 'PAUSED'}
              </Text>
            </View>
          </View>

          {/* --- hero ----------------------------------------------------------- */}
          <Surface style={styles.hero} radius={radius.hero}>
            <Text style={[styles.eyebrow, { color: colors.mut }]}>SAVED FROM SUBSCRIPTIONS</Text>
            {sk ? (
              <Skeleton w={160} h={44} r={12} style={{ marginTop: 8, marginBottom: 4 }} />
            ) : (
              <Text style={[styles.heroValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
                {money(saved)}
              </Text>
            )}
            <Text style={[styles.heroLine, { color: colors.mut }]}>
              {active.length
                ? `+${money(perCycle)} every cycle · from ${plural(live.length, 'subscription', 'subscriptions')}`
                : 'Nothing is adding to it right now'}
            </Text>

            {shareTotal > 0 && (
              <>
                <View style={styles.shareBar}>
                  {shareBase.map((s, i) => (
                    <View
                      key={s.subscriptionId}
                      style={{ flex: s.total, backgroundColor: shareColors[i % shareColors.length] }}
                    />
                  ))}
                </View>
                <View style={styles.legend}>
                  {shareBase.map((s, i) => (
                    <View key={s.subscriptionId} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: shareColors[i % shareColors.length] }]} />
                      <Text style={[styles.legendText, { color: colors.mut }]}>
                        {s.merchantName}{' '}
                        <Text style={{ fontFamily: fontFamily.bold, color: colors.ink }}>
                          {Math.round((s.total / shareTotal) * 100)}%
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <Text style={[styles.heroNote, { color: colors.mut2, borderTopColor: colors.line }]}>
              One goal for every subscription you save alongside. No target: it grows with each charge.
            </Text>
          </Surface>

          {/* --- sources -------------------------------------------------------- */}
          <View style={styles.sectionRow}>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Where it comes from</Text>
            <Pressable onPress={() => setAdding(true)} hitSlop={10} style={styles.addBtn}>
              <Ionicons name="add" size={15} color={colors.accInk} />
              <Text style={[styles.addText, { color: colors.accInk }]}>Add</Text>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            {sk ? (
              [0, 1].map(i => (
                <Surface key={i} style={{ padding: 14, gap: 10 }}>
                  <Skeleton w={i ? '40%' : '55%'} h={14} />
                  <Skeleton w="30%" h={10} />
                </Surface>
              ))
            ) : live.length > 0 ? (
              live.map(renderSource)
            ) : (
              <View style={[styles.noSources, { backgroundColor: colors.card, borderColor: colors.line2 }]}>
                <Body style={{ textAlign: 'center', lineHeight: 18 }}>
                  No subscription is saving right now. Tap Add, or turn on smart saving from any subscription.
                </Body>
              </View>
            )}
          </View>

          {/* --- stopped -------------------------------------------------------- */}
          {ended.length > 0 && (
            <>
              <Text style={[styles.stoppedLabel, { color: colors.mut2 }]}>
                STOPPED · THE MONEY STAYS IN THIS GOAL
              </Text>
              <Surface style={{ paddingHorizontal: 14 }}>
                {ended.map((s, i) => {
                  const sub = subFor(s.subscriptionId);
                  const when = isToday(s.endedAt) ? 'today' : monthDay(s.endedAt);
                  return (
                    <View
                      key={s.subscriptionId}
                      style={[
                        styles.endedRow,
                        i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
                        { opacity: busy === s.subscriptionId ? 0.55 : 1 },
                      ]}
                    >
                      <View style={{ opacity: 0.55 }}>
                        <MerchantMark name={s.merchantName} merchantId={sub?.merchantId} logoUrl={s.logo ?? sub?.logo} size={32} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.endedName, { color: colors.mut }]} numberOfLines={1}>
                          {s.merchantName}
                        </Text>
                        <Text style={[styles.endedMeta, { color: colors.mut2 }]} numberOfLines={1}>
                          {when ? `Stopped ${when} · ` : 'Stopped · '}
                          {plural(s.charges, 'charge', 'charges')}
                        </Text>
                      </View>
                      <Text style={[styles.endedSaved, { color: colors.mut }]}>{money(s.total)}</Text>
                      <Pressable
                        disabled={!!busy}
                        onPress={() =>
                          run(s.subscriptionId, () => setSubscriptionSaving(s.subscriptionId, s.mode), 'Could not restart it')
                        }
                        style={[styles.restart, { borderColor: colors.line2 }]}
                      >
                        <Text style={[styles.restartText, { color: colors.accInk }]}>Restart</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </Surface>
            </>
          )}

          {/* --- recent --------------------------------------------------------- */}
          {history.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.ink, marginTop: 24, marginBottom: 10 }]}>Recent</Text>
              <Surface style={{ paddingHorizontal: 14 }}>{history.map(renderTx)}</Surface>
            </>
          )}

          <Text style={[styles.legal, { color: colors.mut3 }]}>
            EZER is not a bank. Balances and transfers shown here are simulated while bank
            connections are being certified — no funds are held, promised or guaranteed.
          </Text>
        </ScreenBody>
      </ScrollView>

      {/* --- add sheet ---------------------------------------------------------- */}
      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAdding(false)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        </Pressable>
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={[styles.sheet, { backgroundColor: colors.card, borderTopColor: colors.line }]}>
            <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />
            <View style={styles.sheetHead}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Add a subscription</Text>
              <Pressable
                onPress={() => setAdding(false)}
                hitSlop={6}
                style={[styles.closeBtn, { backgroundColor: colors.bg2, borderColor: colors.line }]}
              >
                <Ionicons name="close" size={17} color={colors.ink} />
              </Pressable>
            </View>
            <Body style={{ marginTop: 4, marginBottom: 14, lineHeight: 18 }}>
              Each charge also moves money into Subscription savings. Stop any time; what&rsquo;s saved stays.
            </Body>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={{ gap: 8 }}>
                {eligible.map(sub => {
                  const price = typeof sub.amountCents === 'number' && sub.amountCents > 0 ? sub.amountCents / 100 : null;
                  const next = monthDay(sub.renewalDate);
                  const meta = [price !== null ? `${money(price)}/mo` : null, next ? `next ${next}` : null]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <View key={sub.id} style={[styles.eligRow, { backgroundColor: colors.bg2, borderColor: colors.line }]}>
                      <MerchantMark name={sub.merchantName} merchantId={sub.merchantId} logoUrl={sub.logo} size={38} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.eligName, { color: colors.ink }]} numberOfLines={1}>
                          {sub.merchantName}
                        </Text>
                        {!!meta && (
                          <Text style={[styles.eligMeta, { color: colors.mut2 }]} numberOfLines={1}>
                            {meta}
                          </Text>
                        )}
                      </View>
                      <Pressable onPress={() => add(sub, 'HALF')} style={[styles.eligBtn, { backgroundColor: colors.goldSoft }]}>
                        <Text style={[styles.eligBtnLabel, { color: colors.gold }]}>Half</Text>
                        {price !== null && (
                          <Text style={[styles.eligBtnAmt, { color: colors.gold }]}>+{money(perFor(price, 'HALF'))}</Text>
                        )}
                      </Pressable>
                      <Pressable onPress={() => add(sub, 'MATCH')} style={[styles.eligBtn, { backgroundColor: colors.accSoft }]}>
                        <Text style={[styles.eligBtnLabel, { color: colors.accInk }]}>Match</Text>
                        {price !== null && (
                          <Text style={[styles.eligBtnAmt, { color: colors.accInk }]}>+{money(price)}</Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
                {eligible.length === 0 && (
                  <Body style={{ textAlign: 'center', padding: 16 }}>
                    {subscriptions.length ? 'Every subscription is already saving.' : 'No subscriptions found yet.'}
                  </Body>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
        {/* Sheets draw above the root view on Android: the camera dove draws here while one is open. */}
        <CameraDoveHost nested />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: 21, letterSpacing: -0.4 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: { fontFamily: fontFamily.bold, fontSize: 9, letterSpacing: 0.5 },
  hero: { marginTop: 16, padding: 18 },
  eyebrow: { fontFamily: fontFamily.semibold, fontSize: 11, letterSpacing: 0.5 },
  heroValue: { fontFamily: fontFamily.serif, fontSize: 44, marginTop: 4 },
  heroLine: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 4 },
  shareBar: { flexDirection: 'row', gap: 3, height: 8, marginTop: 14, borderRadius: 4, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fontFamily.regular, fontSize: 11.5 },
  heroNote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  sectionTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 16.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingVertical: 6 },
  addText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  sourceCard: { borderRadius: 18, borderWidth: 1 },
  sourceHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceName: { fontFamily: fontFamily.bold, fontSize: 14.5, flexShrink: 1 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  chipText: { fontFamily: fontFamily.bold, fontSize: 9.5, letterSpacing: 0.3 },
  sourceSub: { fontFamily: fontFamily.regular, fontSize: 11.5, marginTop: 2 },
  sourceSaved: { fontFamily: fontFamily.bold, fontSize: 14 },
  sourceCharges: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  sourceBody: { paddingHorizontal: 14, paddingBottom: 14 },
  modeBox: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 2 },
  modeLabel: { fontFamily: fontFamily.bold, fontSize: 12.5 },
  modeAmt: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  sourceActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  pausePill: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  pauseText: { fontFamily: fontFamily.bold, fontSize: 12 },
  stopText: { fontFamily: fontFamily.bold, fontSize: 12, paddingVertical: 9 },
  noSources: { padding: 18, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed' },
  stoppedLabel: { fontFamily: fontFamily.semibold, fontSize: 10.5, letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  endedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  endedName: { fontFamily: fontFamily.semibold, fontSize: 13.5 },
  endedMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 1 },
  endedSaved: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  restart: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1 },
  restartText: { fontFamily: fontFamily.bold, fontSize: 11 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  txIcon: { width: 30, height: 30, borderRadius: radius.cellSm, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  txMeta: { fontFamily: fontFamily.regular, fontSize: 11.5, marginTop: 2 },
  txAmount: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  legal: { fontFamily: fontFamily.regular, fontSize: 10.5, lineHeight: 16, marginTop: 24 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  // Top edge only: the sheet is full-bleed to the bottom (CLAUDE.md, rounded display corners).
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 34,
  },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', height: 38 },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eligRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
  eligName: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  eligMeta: { fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  eligBtn: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, alignItems: 'center' },
  eligBtnLabel: { fontFamily: fontFamily.bold, fontSize: 10.5 },
  eligBtnAmt: { fontFamily: fontFamily.regular, fontSize: 10 },
});

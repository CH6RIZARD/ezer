// =============================================================================
// EZER Redesign — Drain Review / "Top tickets"
//
// Reached from Wallet's "Review card drain" and the Home "Silent Subs" tile.
// Ranked strictly by cost (highest burn first) so the podium's #1 always
// matches Home's own "Top ticket" figure — both read the same `subscriptions`
// list, sorted the same way.
//
// Two independent interaction models, per the DRAIN_REVIEW_1D_PATCH spec:
//   - Top 3 (podium): tap the card to MARK it (red outline, scissors reveal).
//     Tap the scissors for a confirm sheet; "Cut it" there is what actually
//     opens the merchant's cancellation page. Tapping a marked card again
//     un-marks it — the "changed my mind / it failed" path.
//   - The other N: a plain three-state row (idle → pending → done). "Cut it"
//     opens cancellation immediately and moves to pending; ✓ confirms (row
//     reds out, struck through); ← undoes an accidental tap.
//
// Cancellation itself is unchanged existing logic — resolveCancellationUrlSync
// / resolveCancellationUrl / openCancellation from utils/cancellation.ts. This
// screen only decides WHEN to call it, never how a link is resolved.
//
// Persistence + auto-clear (logic, not UI): every mark/cut/rest change is
// mirrored to AsyncStorage so leaving the screen never loses red state. A
// row that goes red is snapshotted (its renewalDate at that moment); on every
// data refresh, if that subscription's renewalDate has since moved forward
// (a new charge posted — the merchant is still live), the row's state resets
// so the user sees it's still active. If instead its due date has passed by
// 2+ days with the subscription's renewal date unchanged (no new billing
// cycle started) — or the subscription has vanished from the account
// entirely — the row is treated as a confirmed cancellation and hidden.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Modal, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, typeScale, radius, layout } from '../../theme/type';
import { Body, Label, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import MerchantMark from '../../components/redesign/MerchantMark';
import { useData } from '../../contexts/DataContext';
import {
  resolveCancellationUrl,
  resolveCancellationUrlSync,
  openCancellation,
} from '../../utils/cancellation';

type RestState = 'idle' | 'pending' | 'done';
type PersistShape<T> = Record<string, T>;

interface DrainRow {
  id: string;
  merchantId: string;
  name: string;
  logo?: string;
  amountCents: number;
  website?: string;
  cancellationUrl?: string;
  renewalDate?: string;
}

/** A row's renewalDate at the moment it went red, so a later refresh can tell
 *  "still hasn't billed" apart from "billed again, still live." */
interface Snapshot {
  renewalDate: string | null;
  markedAt: string;
}

const MARKED_KEY = '@ezer_drain_marked';
const CUT_KEY = '@ezer_drain_cut';
const REST_KEY = '@ezer_drain_rest';
const SNAPSHOT_KEY = '@ezer_drain_snapshot';
const HIDDEN_KEY = '@ezer_drain_hidden';

/** Days past a snapshotted due date, with no sign of a new billing cycle,
 *  before a red row is treated as a confirmed cancellation and hidden. */
const AUTO_CLEAR_DAYS = 2;

async function loadJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
    // A missed persist just means this one toggle doesn't survive a restart —
    // not worth surfacing an error for.
  });
}

export default function DrainReviewScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { subscriptions, risks } = useData();

  // --- persisted state ---------------------------------------------------
  const [marked, setMarked] = useState<PersistShape<boolean>>({});
  const [cut, setCut] = useState<PersistShape<boolean>>({});
  const [rest, setRest] = useState<PersistShape<RestState>>({});
  const [snapshot, setSnapshot] = useState<PersistShape<Snapshot>>({});
  const [hidden, setHidden] = useState<PersistShape<true>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const [m, c, r, s, h] = await Promise.all([
        loadJSON(MARKED_KEY, {} as PersistShape<boolean>),
        loadJSON(CUT_KEY, {} as PersistShape<boolean>),
        loadJSON(REST_KEY, {} as PersistShape<RestState>),
        loadJSON(SNAPSHOT_KEY, {} as PersistShape<Snapshot>),
        loadJSON(HIDDEN_KEY, {} as PersistShape<true>),
      ]);
      setMarked(m);
      setCut(c);
      setRest(r);
      setSnapshot(s);
      setHidden(h);
      setHydrated(true);
    })();
  }, []);

  // Persist on every change, but only once the initial load has landed —
  // otherwise the empty initial state would overwrite whatever was saved
  // before this effect's first real run.
  useEffect(() => {
    if (hydrated) saveJSON(MARKED_KEY, marked);
  }, [marked, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(CUT_KEY, cut);
  }, [cut, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(REST_KEY, rest);
  }, [rest, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(SNAPSHOT_KEY, snapshot);
  }, [snapshot, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(HIDDEN_KEY, hidden);
  }, [hidden, hydrated]);

  // --- rows, strictly by cost — #1 here must be Home's own "Top ticket" ---
  const allRows = useMemo<DrainRow[]>(() => {
    const priceBySubId = new Map<string, number>();
    for (const r of risks) {
      if (r.amountCents > 0) priceBySubId.set(r.subscriptionId, r.amountCents);
    }

    const withNullableName = subscriptions.map(sub => ({
      id: sub.id,
      merchantId: sub.merchantId,
      name: sub.merchantName?.trim() || null,
      logo: sub.logo,
      amountCents: sub.amountCents ?? priceBySubId.get(sub.id) ?? 0,
      website: sub.website,
      cancellationUrl: sub.cancellationUrl,
      renewalDate: sub.renewalDate,
    }));

    // Same rule as before: no name and no price is a sync artefact, not a
    // subscription the user can act on.
    return withNullableName
      .filter((r): r is typeof r & { name: string } => !!r.name && r.amountCents > 0)
      .filter(r => !hidden[r.id])
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [subscriptions, risks, hidden]);

  const top3 = allRows.slice(0, 3);
  const restRows = allRows.slice(3);
  // Podium display order per the mock: #2 left, #1 centre (tallest), #3
  // right. Degrades gracefully when there are fewer than 3 subscriptions.
  const podiumOrder =
    top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumMeta =
    top3.length === 3
      ? [
          { h: 176, logo: 36 },
          { h: 208, logo: 46 },
          { h: 164, logo: 36 },
        ]
      : top3.map(() => ({ h: 190, logo: 40 }));

  // --- auto-clear + re-charge reset, on every fresh subscriptions load ----
  useEffect(() => {
    if (!hydrated) return;
    const snapIds = Object.keys(snapshot);
    if (snapIds.length === 0) return;

    const now = Date.now();
    let changed = false;
    const nextSnap = { ...snapshot };
    const nextCut = { ...cut };
    const nextRest = { ...rest };
    const nextMarked = { ...marked };
    const nextHidden = { ...hidden };

    for (const id of snapIds) {
      const snap = snapshot[id];
      const sub = subscriptions.find(s => s.id === id);

      if (!sub) {
        // Gone from the account entirely — the strongest possible signal
        // that it's actually cancelled. Stop tracking it; it's already
        // filtered out of allRows once hidden is set, so hide it too.
        delete nextSnap[id];
        nextHidden[id] = true;
        changed = true;
        continue;
      }

      const currentRenewal = sub.renewalDate ?? null;
      if (currentRenewal && snap.renewalDate && currentRenewal !== snap.renewalDate) {
        // Renewal date moved forward since this row went red — a new
        // billing cycle started, so the merchant is still charging. Reset
        // every bit of this row's state rather than leaving it stuck red.
        delete nextSnap[id];
        delete nextCut[id];
        delete nextRest[id];
        delete nextMarked[id];
        changed = true;
        continue;
      }

      if (snap.renewalDate) {
        const daysPast = (now - new Date(snap.renewalDate).getTime()) / 86_400_000;
        if (daysPast >= AUTO_CLEAR_DAYS) {
          // Due date passed with no new cycle — confirmed cancelled.
          delete nextSnap[id];
          nextHidden[id] = true;
          changed = true;
        }
      }
    }

    if (changed) {
      setSnapshot(nextSnap);
      setCut(nextCut);
      setRest(nextRest);
      setMarked(nextMarked);
      setHidden(nextHidden);
    }
    // Only re-run when the underlying subscription data actually refreshes —
    // not on every local toggle, which would fight the snapshot it just wrote.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptions, hydrated]);

  function snapshotRow(row: DrainRow) {
    setSnapshot(s => ({
      ...s,
      [row.id]: { renewalDate: row.renewalDate ?? null, markedAt: new Date().toISOString() },
    }));
  }

  // --- cancellation opening (existing logic, unchanged resolution order) --
  const [busyId, setBusyId] = useState<string | null>(null);

  async function openCancellationFor(row: DrainRow) {
    const quick = resolveCancellationUrlSync(row.name, row.merchantId, row.cancellationUrl);
    if (quick) {
      void openCancellation(quick);
      return;
    }
    setBusyId(row.id);
    try {
      const target = await resolveCancellationUrl(row.name, row.merchantId, row.cancellationUrl, row.website);
      await openCancellation(target);
    } finally {
      setBusyId(null);
    }
  }

  // --- top-3 podium interactions ------------------------------------------
  const [sheetFor, setSheetFor] = useState<DrainRow | null>(null);

  function onCardTap(row: DrainRow) {
    if (marked[row.id]) {
      // Un-mark. The "failed / changed my mind" path — also clears any
      // in-flight cut/snapshot so a re-mark starts clean.
      setMarked(m => {
        const n = { ...m };
        delete n[row.id];
        return n;
      });
      setCut(c => {
        const n = { ...c };
        delete n[row.id];
        return n;
      });
      setSnapshot(s => {
        const n = { ...s };
        delete n[row.id];
        return n;
      });
    } else {
      setMarked(m => ({ ...m, [row.id]: true }));
    }
  }

  function onSheetCutIt() {
    if (!sheetFor) return;
    const row = sheetFor;
    setCut(c => ({ ...c, [row.id]: true }));
    snapshotRow(row);
    void openCancellationFor(row);
    setSheetFor(null);
  }

  // --- "the other N" row interactions -------------------------------------
  //
  // "Cut it" here does NOT open a cancellation link directly — unlike the
  // podium sheet above (left as-is; that's the confirmed "yes, cut this"
  // moment). These are the rows the user hasn't looked at yet, so it opens
  // the real in-app subscription screen instead — the one with the price-
  // over-time chart and full charge history (apps/mobile/app/screens/
  // SubscriptionDetail.tsx) — and cancellation itself happens from there,
  // via that screen's own existing Cancel action. Marking this row 'pending'
  // here just means "sent to review"; the ✓/← still resolve it on return.
  function onRestCutIt(row: DrainRow) {
    setRest(r => ({ ...r, [row.id]: 'pending' }));
    router.push({ pathname: '/screens/SubscriptionDetail', params: { id: row.id } });
  }
  function onRestBack(row: DrainRow) {
    setRest(r => ({ ...r, [row.id]: 'idle' }));
  }
  function onRestConfirm(row: DrainRow) {
    setRest(r => ({ ...r, [row.id]: 'done' }));
    snapshotRow(row);
  }
  /** The small X on a "Cancelled" pill — reverts a row confirmed by mistake.
   *  Clears the snapshot too, not just the rest state: leaving a stale one
   *  behind would let the AUTO_CLEAR_DAYS check below hide this row again a
   *  couple of days later, silently undoing the very undo the user just did. */
  function onRestUndo(row: DrainRow) {
    setRest(r => ({ ...r, [row.id]: 'idle' }));
    setSnapshot(s => {
      const n = { ...s };
      delete n[row.id];
      return n;
    });
  }

  // --- summary + hints ------------------------------------------------------
  const counted = allRows.filter(r => marked[r.id] || (rest[r.id] && rest[r.id] !== 'idle'));
  const freed = counted.reduce((sum, r) => sum + r.amountCents, 0);

  const anyTopMarked = top3.some(r => marked[r.id]);
  const podiumHint = anyTopMarked
    ? 'Tap the card again if it failed or you decided not to cancel'
    : 'Tap a ticket to see where it drains';

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
          <View style={styles.header}>
            <PressScale onPress={() => router.back()} scaleTo={0.9}>
              <View style={[styles.back, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </View>
            </PressScale>
            <Text style={[typeScale.screenTitle, { color: colors.ink, marginLeft: 12 }]}>
              Top tickets
            </Text>
          </View>

          {top3.length > 0 && (
            <>
              {/* --- podium ----------------------------------------------- */}
              <View style={styles.podiumRow}>
                {podiumOrder.map((row, i) => {
                  const isMarked = !!marked[row.id];
                  const isCut = !!cut[row.id];
                  const meta = podiumMeta[i];
                  const rank =
                    allRows[0]?.id === row.id ? '#1 · TOP TICKET' : `#${allRows.findIndex(r => r.id === row.id) + 1}`;
                  const label = isCut
                    ? 'TAP ✂ AGAIN IF NOT CANCELLED'
                    : isMarked
                    ? 'TAP ✂ TO CUT'
                    : 'TAP TO SEE';

                  return (
                    <View key={row.id} style={{ flex: 1, height: meta.h }}>
                      <PressScale
                        onPress={() => onCardTap(row)}
                        style={{ flex: 1 }}
                        scaleTo={0.97}
                      >
                        <View
                          style={[
                            styles.podiumCard,
                            {
                              borderColor: isMarked ? colors.red : colors.line,
                              backgroundColor: isMarked ? colors.red + '29' : colors.card,
                            },
                          ]}
                        >
                          <Text style={[styles.rank, { color: colors.gold }]} numberOfLines={1}>
                            {rank}
                          </Text>
                          <MerchantMark name={row.name} merchantId={row.merchantId} logoUrl={row.logo} size={meta.logo} />
                          <Text style={[styles.podiumName, { color: colors.ink }]} numberOfLines={2}>
                            {row.name}
                          </Text>
                          <Text style={[styles.podiumPrice, { color: colors.red }]} numberOfLines={1}>
                            {formatCents(row.amountCents)}
                          </Text>
                          <Text
                            style={[styles.podiumLabel, { color: isMarked ? colors.red : colors.mut }]}
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                        </View>
                      </PressScale>

                      {isMarked && (
                        <Pressable
                          onPress={() => setSheetFor(row)}
                          hitSlop={6}
                          style={[
                            styles.scissors,
                            {
                              borderColor: isCut ? colors.red : colors.line2,
                              backgroundColor: isCut ? colors.red : colors.bg,
                            },
                          ]}
                        >
                          <Ionicons name="cut" size={14} color={isCut ? '#FFFFFF' : colors.mut} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
              <Text
                style={[styles.podiumHint, { color: anyTopMarked ? colors.red : colors.mut2 }]}
              >
                {podiumHint}
              </Text>
            </>
          )}

          <Surface style={[styles.totalCard, { borderColor: colors.goldLine }]}>
            <View style={{ flex: 1 }}>
              <Label color={colors.gold}>You could free up</Label>
              <Text style={[typeScale.totalValue, { color: colors.red, marginTop: 4 }]}>
                {formatCents(freed)}
                <Text style={{ fontSize: 14 }}>/mo</Text>
              </Text>
            </View>
            <Text style={[styles.countText, { color: colors.mut }]}>
              {counted.length} of {allRows.length}{'\n'}marked
            </Text>
          </Surface>

          {restRows.length > 0 && (
            <>
              {/* No helper text here — the pill/back-arrow/checkmark controls
                  on each row already say what they do. */}
              <View style={styles.restHeader}>
                <Label>The other {restRows.length}</Label>
              </View>

              <View style={{ gap: 6 }}>
                {restRows.map(row => {
                  const state: RestState = rest[row.id] ?? 'idle';
                  const done = state === 'done';
                  return (
                    <Surface
                      key={row.id}
                      style={[
                        styles.restRow,
                        done && { backgroundColor: colors.red + '29', borderColor: colors.red },
                      ]}
                    >
                      <View style={{ opacity: done ? 0.55 : 1 }}>
                        <MerchantMark name={row.name} merchantId={row.merchantId} logoUrl={row.logo} size={30} />
                      </View>
                      <Text
                        style={[
                          styles.restName,
                          {
                            color: colors.ink,
                            opacity: done ? 0.55 : 1,
                            textDecorationLine: done ? 'line-through' : 'none',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {row.name}
                      </Text>
                      <Text style={[styles.restPrice, { color: colors.mut, opacity: done ? 0.55 : 1 }]}>
                        {formatCents(row.amountCents)}
                      </Text>

                      {state === 'idle' && (
                        <PressScale scaleTo={0.94} onPress={() => onRestCutIt(row)}>
                          <View style={[styles.restPill, { borderColor: colors.line2 }]}>
                            <Text style={[styles.restPillText, { color: colors.ink }]}>Cut it</Text>
                          </View>
                        </PressScale>
                      )}

                      {state === 'pending' && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <Pressable
                            onPress={() => onRestBack(row)}
                            hitSlop={6}
                            style={[styles.restIconBtn, { borderColor: colors.line2 }]}
                          >
                            <Ionicons name="arrow-undo" size={14} color={colors.mut} />
                          </Pressable>
                          <Pressable
                            onPress={() => onRestConfirm(row)}
                            hitSlop={6}
                            style={[styles.restIconBtn, { backgroundColor: colors.red, borderColor: colors.red }]}
                          >
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      )}

                      {done && (
                        <View style={{ position: 'relative' }}>
                          <View style={[styles.restPill, { backgroundColor: colors.red, borderColor: colors.red }]}>
                            <Text style={[styles.restPillText, { color: '#FFFFFF' }]}>Cancelled</Text>
                          </View>
                          {/* Undo for a mistaken confirm — the auto-revert
                              below already handles "it actually billed
                              again," this is for "I didn't mean to tap ✓." */}
                          <Pressable
                            onPress={() => onRestUndo(row)}
                            hitSlop={8}
                            style={[styles.restPillUndo, { backgroundColor: colors.ink, borderColor: colors.bg }]}
                          >
                            <Ionicons name="close" size={10} color="#FFFFFF" />
                          </Pressable>
                        </View>
                      )}
                    </Surface>
                  );
                })}
              </View>
            </>
          )}

          {allRows.length === 0 && (
            <Body style={{ textAlign: 'center', marginTop: 24 }}>
              Nothing left to review — every subscription here has been dealt with.
            </Body>
          )}
        </ScreenBody>
      </ScrollView>

      {/* --- top-3 confirm sheet --------------------------------------------- */}
      <Modal visible={!!sheetFor} transparent animationType="slide" onRequestClose={() => setSheetFor(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheetFor(null)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
        </Pressable>
        {sheetFor && (
          <View style={styles.sheetWrap} pointerEvents="box-none">
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line, paddingBottom: insets.bottom + 20 }]}>
              <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />
              <View style={styles.sheetHead}>
                <MerchantMark name={sheetFor.name} merchantId={sheetFor.merchantId} logoUrl={sheetFor.logo} size={40} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.sheetName, { color: colors.ink }]}>{sheetFor.name}</Text>
                  <Text style={[styles.sheetPrice, { color: colors.mut }]}>
                    {formatCents(sheetFor.amountCents)}/mo
                  </Text>
                </View>
              </View>
              <Body style={{ marginTop: 14, lineHeight: 19 }}>
                Cut it opens {sheetFor.name}&rsquo;s cancellation right now. Go back if you&rsquo;ve changed your mind.
              </Body>
              <View style={styles.sheetButtons}>
                <PressScale onPress={() => setSheetFor(null)} style={{ flex: 1 }}>
                  <View style={[styles.sheetBtnOutline, { borderColor: colors.line2 }]}>
                    <Text style={[styles.sheetBtnOutlineText, { color: colors.ink }]}>Go back</Text>
                  </View>
                </PressScale>
                <PressScale onPress={onSheetCutIt} style={{ flex: 1.4 }}>
                  <View style={[styles.sheetBtnFill, { backgroundColor: colors.red }]}>
                    <Text style={styles.sheetBtnFillText}>Cut it</Text>
                  </View>
                </PressScale>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  podiumCard: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 7,
  },
  rank: {
    fontFamily: fontFamily.bold,
    fontSize: 9.5,
    letterSpacing: 0.4,
  },
  podiumName: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 14,
  },
  podiumPrice: {
    fontFamily: fontFamily.serif,
    fontStyle: 'italic',
    fontSize: 21,
  },
  podiumLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 9.5,
    textAlign: 'center',
  },
  scissors: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumHint: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    minHeight: 14,
  },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
  },
  countText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 17,
  },
  restHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 22,
    marginBottom: 8,
  },
  restHintText: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  restRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  restName: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
  restPrice: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
  },
  restPill: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
  },
  restPillUndo: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: layout.screenX,
    paddingTop: 10,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetName: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  sheetPrice: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  sheetBtnOutline: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtnOutlineText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  sheetBtnFill: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBtnFillText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
});

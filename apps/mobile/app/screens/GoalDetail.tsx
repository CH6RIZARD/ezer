// =============================================================================
// EZER — Goal screen (any standard goal)
//
// Opened by tapping a goal on the Savings tab. The redesign has no mock for a
// standard goal, so this is composed from the owner's handoff pieces in the
// pool screen's visual language (SubscriptionPool.tsx, "Savings Pool"): its
// header with the AUTO / FUNDED / PAUSED tag and an edit button, its hero card
// (saved, progress to the target, a bar) carrying "SavingsTab"'s Add /
// Withdraw / Move row (MoneyActions, shared with the Savings tab), "Goal 1a"'s
// purple automatic-saving card (AutoSaveCard, shared with GoalFormSheet), and
// its Recent list and legal footnote. The copy is the old screen's, unchanged.
//
// There is no auto-save amount or cadence control, deliberately. The user says
// WHETHER this goal saves; the engine says how much, from their checking
// balance. The note under the card states the rule in plain terms rather than
// hiding it — an app that moves money out of your checking account has to be
// able to explain itself on the screen where it happens.
//
// It uses the SAME sheets as the Savings tab (MoveMoneySheet, GoalFormSheet)
// so a withdrawal cannot behave differently depending on where it started.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Alert } from '../../utils/appAlert';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals, type SavingsTransaction } from '../../utils/SavingsGoalsContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, radius, layout } from '../../theme/type';
import { Label, Body, Surface, ScreenBody, Skeleton } from '../../components/redesign/Primitives';
import MoveMoneySheet, { type MoveMode } from '../../components/redesign/MoveMoneySheet';
import GoalFormSheet from '../../components/redesign/GoalFormSheet';
import AutoSaveCard from '../../components/redesign/AutoSaveCard';
import MoneyActions from '../../components/redesign/MoneyActions';
import { useCameraDove } from '../../components/CameraDove';

const money = (dollars: number) => formatCents(Math.round(dollars * 100));

/** A sweep and a manual deposit look the same on the wire, so both read "Money in". */
const TX = {
  transfer: { title: 'Money in', icon: 'arrow-down' },
  withdraw: { title: 'Withdrawn to bank', icon: 'arrow-up' },
  move: { title: 'Moved between goals', icon: 'swap-horizontal' },
} as const;

export default function GoalDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const {
    goals,
    movableGoals,
    autoSave,
    // checkingBalance / checkingLabel were only ever read by the removed
    // "How this works" card. The goal screen has no business showing a
    // checking-account balance.
    preview,
    hydrated,
    transactionsForGoal,
    setGoalAutoSave,
    closeGoal,
  } = useSavingsGoals();

  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [editing, setEditing] = useState(false);
  // The switch's PATCH and the re-read after it: the card dims and ignores
  // taps while the dove flies, like the Savings tab's Pause/Resume.
  const [toggling, setToggling] = useState(false);
  useCameraDove(toggling);

  const goal = goals.find(g => g.id === params.id) ?? null;
  const history = useMemo(
    () => (goal ? transactionsForGoal(goal.id) : []),
    [goal, transactionsForGoal]
  );

  // Money that has come INTO this goal, however it arrived. Sweeps and manual
  // deposits are indistinguishable on the wire (both DEBIT transfers with a
  // hashed idempotency key), so this counts both rather than claiming a split
  // it cannot actually see.
  const paidInHere = useMemo(
    () =>
      history
        .filter(t => t.type !== 'withdraw')
        .reduce((sum, t) => sum + Math.round(t.amountDollars * 100), 0) / 100,
    [history]
  );

  const pad = {
    paddingTop: insets.top + 10,
    paddingHorizontal: layout.screenX,
    paddingBottom: insets.bottom + 48,
  };

  const backBtn = (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      accessibilityLabel="Back"
      style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <Ionicons name="chevron-back" size={18} color={colors.ink} />
    </Pressable>
  );

  // Goals not loaded yet: the pool screen's skeletons, not a false "gone".
  // A goal deleted from this very screen unmounts one render before the router
  // pops; rendering a "not found" card is calmer than crashing on `goal!`.
  if (!goal) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.bg }, pad]}>
        <View style={styles.header}>
          {backBtn}
          {!hydrated && (
            <View style={{ flex: 1 }}>
              <Skeleton w="55%" h={18} />
            </View>
          )}
        </View>
        {hydrated ? (
          <Surface style={{ padding: 20, marginTop: 16, alignItems: 'center' }}>
            <Body style={{ textAlign: 'center' }}>This goal is no longer here.</Body>
          </Surface>
        ) : (
          <>
            <Surface style={styles.hero} radius={radius.hero}>
              <Text style={[styles.eyebrow, { color: colors.mut }]}>SAVED</Text>
              <Skeleton w={160} h={44} r={12} style={{ marginTop: 8, marginBottom: 4 }} />
              <Skeleton w="50%" h={12} style={{ marginTop: 4 }} />
              <Skeleton h={8} r={4} style={{ marginTop: 14 }} />
            </Surface>
            <View style={{ gap: 8, marginTop: 24 }}>
              {[0, 1].map(i => (
                <Surface key={i} style={{ padding: 14, gap: 10 }}>
                  <Skeleton w={i ? '40%' : '55%'} h={14} />
                  <Skeleton w="30%" h={10} />
                </Surface>
              ))}
            </View>
          </>
        )}
      </View>
    );
  }

  const pctRaw = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
  const pct = Math.min(100, Math.round(pctRaw * 100));
  const funded = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const tag = funded ? 'FUNDED' : goal.autoSave && autoSave.enabled ? 'AUTO' : 'PAUSED';
  const tagOn = tag !== 'PAUSED';

  // Goals share each run in proportion to what they still need, so this goal's
  // share of the next sweep is its share of the total remaining need.
  const activeGoals = goals.filter(g => g.autoSave && g.currentAmount < g.targetAmount);
  const totalNeed = activeGoals.reduce((s, g) => s + (g.targetAmount - g.currentAmount), 0);
  const shareOfNext =
    goal.autoSave && !funded && totalNeed > 0 && preview.amountDollars > 0
      ? (remaining / totalNeed) * preview.amountDollars
      : 0;

  const toggleAuto = async () => {
    if (toggling) return;
    setToggling(true);
    const res = await setGoalAutoSave(goal.id, !goal.autoSave);
    setToggling(false);
    if (!res.ok) Alert.alert('Could not change that', res.error);
  };

  const confirmDelete = () => {
    // Closing is a server-side status change, and the API has no
    // "close and sweep the balance elsewhere" operation. Rather than invent
    // one on the client — which would mean a move and a close that could
    // half-fail — the user is asked to empty the goal first. An explicit extra
    // step beats a two-step money operation with no transaction around it.
    if (goal.currentAmount > 0) {
      Alert.alert(
        'Move the money first',
        `${goal.name} still holds ${money(goal.currentAmount)}. Withdraw it or move it to another goal, then close this one.`
      );
      return;
    }

    Alert.alert(`Close ${goal.name}?`, 'This goal is empty, so nothing moves.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Close goal',
        style: 'destructive',
        onPress: async () => {
          const res = await closeGoal(goal.id);
          if (!res.ok) Alert.alert('Could not close goal', res.error);
          else router.back();
        },
      },
    ]);
  };

  // --- recent row ---------------------------------------------------------------

  const renderTx = (t: SavingsTransaction, i: number) => {
    const inbound = t.type !== 'withdraw';
    const { title, icon } = TX[t.type];
    return (
      <View key={t.id} style={[styles.txRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}>
        <View style={[styles.txIcon, { backgroundColor: inbound ? colors.successBg : colors.goldSoft }]}>
          <Ionicons name={icon} size={14} color={inbound ? colors.success : colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.txTitle, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.txMeta, { color: colors.mut2 }]} numberOfLines={1}>
            {t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {t.pending ? ' · clearing' : ''}
          </Text>
        </View>
        <Text
          style={[styles.txAmount, { color: inbound ? colors.success : colors.red, opacity: t.pending ? 0.6 : 1 }]}
        >
          {inbound ? '+' : '−'}
          {money(t.amountDollars)}
        </Text>
      </View>
    );
  };

  // --- render -------------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
        <ScreenBody>
          <View style={styles.header}>
            {backBtn}
            <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
              {goal.name}
            </Text>
            <View style={[styles.tag, { backgroundColor: tagOn ? colors.successBg : colors.bg2 }]}>
              {tagOn && <Ionicons name={funded ? 'checkmark' : 'sparkles'} size={10} color={colors.success} />}
              <Text style={[styles.tagText, { color: tagOn ? colors.success : colors.mut2 }]}>{tag}</Text>
            </View>
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={8}
              accessibilityLabel="Edit goal"
              style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              <Ionicons name="create-outline" size={18} color={colors.ink} />
            </Pressable>
          </View>

          {/* --- hero ----------------------------------------------------------- */}
          <Surface style={styles.hero} radius={radius.hero}>
            <Text style={[styles.eyebrow, { color: colors.mut }]}>SAVED</Text>
            <Text style={[styles.heroValue, { color: colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
              {money(goal.currentAmount)}
            </Text>
            <Text style={[styles.heroLine, { color: colors.mut }]}>
              {funded
                ? 'Funded — nice work'
                : `${pct}% of ${money(goal.targetAmount)} · ${money(remaining)} to go`}
            </Text>
            <View style={[styles.bar, { backgroundColor: colors.line }]}>
              <View
                style={[styles.barFill, { width: `${pct}%`, backgroundColor: funded ? colors.success : goal.color }]}
              />
            </View>

            {funded && (
              <View style={[styles.banner, { backgroundColor: colors.successBg }]}>
                <Text style={[styles.bannerText, { color: colors.success }]}>
                  Target reached — automatic saving has moved on to your other goals
                </Text>
              </View>
            )}

            {/* Move counts Subscription savings too: the sheet offers it. */}
            <MoneyActions
              onPress={setMoveMode}
              dim
              disabled={{
                withdraw: goal.currentAmount <= 0,
                move: movableGoals.length < 2 || goal.currentAmount <= 0,
              }}
            />
          </Surface>

          {/* --- automatic saving ----------------------------------------------- */}
          <Text style={[styles.section, { color: colors.ink }]}>Automatic saving</Text>
          <AutoSaveCard
            on={goal.autoSave}
            onToggle={toggleAuto}
            style={toggling && { opacity: 0.55 }}
            body={
              goal.autoSave
                ? funded
                  ? 'This goal is funded, so spare money goes to your other goals.'
                  : shareOfNext > 0
                  ? `About ${money(shareOfNext)} of this week's save should land here.`
                  : preview.explanation || 'Nothing spare right now. We check again each week.'
                : 'Turn this on and we decide what you can spare and move it here.'
            }
            footer={
              paidInHere > 0 ? (
                <>
                  <Label color={goal.autoSave ? 'rgba(255,255,255,.72)' : undefined}>Paid in so far</Label>
                  <Text style={[styles.paidValue, { color: colors.success }]}>{money(paidInHere)}</Text>
                </>
              ) : undefined
            }
          />

          {!autoSave.enabled && goal.autoSave && (
            <View style={[styles.warnBanner, { backgroundColor: colors.goldSoft }]}>
              <Ionicons name="pause-circle" size={14} color={colors.gold} />
              <Text style={[styles.warnText, { color: colors.gold }]}>
                Automatic saving is paused for every goal. Resume it on the Savings tab.
              </Text>
            </View>
          )}

          {/* What the goal does on its own, not the sweep's inputs (balance,
              buffer, cap): those are the engine's vocabulary, and the controls
              that change them live on the Savings tab, so this points there. */}
          <Text style={[styles.note, { color: colors.mut2 }]}>
            {goal.autoSave
              ? 'This goal grows on its own. Every week we set aside whatever you can comfortably spare, and this goal takes a share of it based on how much it still needs — so it fills faster when you have room and pauses when you do not.'
              : 'Automatic saving is off for this goal, so it only grows when you add money yourself.'}
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/savings')} hitSlop={8} style={styles.link}>
            <Text style={[styles.linkText, { color: colors.accInk }]}>Adjust automatic saving</Text>
          </Pressable>

          {/* --- recent --------------------------------------------------------- */}
          <Text style={[styles.section, { color: colors.ink }]}>Recent</Text>
          {history.length > 0 ? (
            <Surface style={{ paddingHorizontal: 14 }}>{history.slice(0, 25).map(renderTx)}</Surface>
          ) : (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line2 }]}>
              <Body style={{ textAlign: 'center', lineHeight: 18 }}>Nothing has moved in or out yet.</Body>
            </View>
          )}

          <Pressable onPress={confirmDelete} style={styles.closeBtn}>
            <Ionicons name="trash-outline" size={15} color={colors.red} />
            <Text style={[styles.closeText, { color: colors.red }]}>Close this goal</Text>
          </Pressable>

          <Text style={[styles.legal, { color: colors.mut3 }]}>
            EZER is not a bank. Balances and transfers shown here are simulated while bank
            connections are being certified — no funds are held, promised or guaranteed.
          </Text>
        </ScreenBody>
      </ScrollView>

      <MoveMoneySheet
        visible={moveMode !== null}
        mode={moveMode ?? 'add'}
        goalId={goal.id}
        onClose={() => setMoveMode(null)}
      />

      <GoalFormSheet visible={editing} goal={goal} onClose={() => setEditing(false)} />
    </View>
  );
}

// Values copied from SubscriptionPool.tsx (header, hero, tag, rows, empty,
// legal) and SubscriptionDetail.tsx (the success banner).
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundBtn: {
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
  bar: { height: 8, marginTop: 14, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  banner: { marginTop: 12, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14 },
  bannerText: { fontFamily: fontFamily.semibold, fontSize: 12.5, lineHeight: 18 },
  section: { fontFamily: fontFamily.bold, fontSize: 16.5, marginTop: 24, marginBottom: 10 },
  paidValue: { fontFamily: fontFamily.bold, fontSize: 17 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: radius.chip,
  },
  warnText: { fontFamily: fontFamily.medium, fontSize: 11.5, flex: 1, lineHeight: 16 },
  note: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, marginTop: 12 },
  link: { alignSelf: 'flex-start', marginTop: 8 },
  linkText: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  txIcon: { width: 30, height: 30, borderRadius: radius.cellSm, alignItems: 'center', justifyContent: 'center' },
  txTitle: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  txMeta: { fontFamily: fontFamily.regular, fontSize: 11.5, marginTop: 2 },
  txAmount: { fontFamily: fontFamily.bold, fontSize: 13.5 },
  empty: { padding: 18, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed' },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 24,
    paddingVertical: 12,
  },
  closeText: { fontFamily: fontFamily.semibold, fontSize: 13 },
  legal: { fontFamily: fontFamily.regular, fontSize: 10.5, lineHeight: 16, marginTop: 24 },
});

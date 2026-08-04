// =============================================================================
// EZER — Goal detail
//
// Opened by tapping any goal. This is where a goal stops being a progress bar
// and becomes something you can operate: rename it, re-target it, switch
// automatic saving on or off for it, add money, withdraw to a bank account,
// move money to another goal, or close it out.
//
// There is no auto-save amount or cadence control, deliberately. The user says
// WHETHER this goal saves; the engine says how much, from their checking
// balance. The "How this works" card states the rule in plain terms rather
// than hiding it — an app that moves money out of your checking account has to
// be able to explain itself on the screen where it happens.
//
// It uses the SAME sheets as the Savings tab (MoveMoneySheet, GoalFormSheet)
// so a withdrawal cannot behave differently depending on where it started.
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Switch, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals, type SavingsTransaction } from '../../utils/SavingsGoalsContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, typeScale, radius, layout, motion } from '../../theme/type';
import { Label, Body, SectionHeader, Surface, PressScale, ScreenBody } from '../../components/redesign/Primitives';
import ProgressRing from '../../components/redesign/ProgressRing';
import MoveMoneySheet, { type MoveMode } from '../../components/redesign/MoveMoneySheet';
import GoalFormSheet from '../../components/redesign/GoalFormSheet';

const dollarsToCents = (d: number) => Math.round(d * 100);

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function GoalDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const {
    goals,
    autoSave,
    checkingBalance,
    checkingLabel,
    preview,
    transactionsForGoal,
    setGoalAutoSave,
    closeGoal,
  } = useSavingsGoals();

  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [editing, setEditing] = useState(false);

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

  // A goal deleted from this very screen unmounts one render before the router
  // pops. Rendering a "not found" card is calmer than crashing on `goal!`.
  if (!goal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 20 }}>
        <View style={{ paddingHorizontal: layout.screenX }}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </Pressable>
          <Surface style={{ padding: 20, marginTop: 16, alignItems: 'center' }}>
            <Body style={{ textAlign: 'center' }}>This goal is no longer here.</Body>
          </Surface>
        </View>
      </View>
    );
  }

  const pctRaw = goal.targetAmount > 0 ? goal.currentAmount / goal.targetAmount : 0;
  const pct = Math.min(100, Math.round(pctRaw * 100));
  const funded = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const ringColor = funded ? colors.success : goal.color;

  // Goals share each run in proportion to what they still need, so this goal's
  // share of the next sweep is its share of the total remaining need.
  const activeGoals = goals.filter(g => g.autoSave && g.currentAmount < g.targetAmount);
  const totalNeed = activeGoals.reduce((s, g) => s + (g.targetAmount - g.currentAmount), 0);
  const shareOfNext =
    goal.autoSave && !funded && totalNeed > 0 && preview.amountDollars > 0
      ? (remaining / totalNeed) * preview.amountDollars
      : 0;

  const goalName = (id: string) => goals.find(g => g.id === id)?.name ?? 'another goal';

  const confirmDelete = () => {
    // Closing is a server-side status change, and the API has no
    // "close and sweep the balance elsewhere" operation. Rather than invent
    // one on the client — which would mean a move and a close that could
    // half-fail — the user is asked to empty the goal first. An explicit extra
    // step beats a two-step money operation with no transaction around it.
    if (goal.currentAmount > 0) {
      Alert.alert(
        'Move the money first',
        `${goal.name} still holds ${formatCents(
          dollarsToCents(goal.currentAmount)
        )}. Withdraw it or move it to another goal, then close this one.`
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

  // --- activity ---------------------------------------------------------------

  const renderTx = (t: SavingsTransaction, i: number) => {
    const inbound = t.type !== 'withdraw';
    const meta: Record<SavingsTransaction['type'], { title: string; icon: any }> = {
      transfer: { title: 'Money in', icon: 'arrow-down' },
      withdraw: { title: 'Withdrawn to bank', icon: 'arrow-up' },
      move: { title: 'Moved between goals', icon: 'swap-horizontal' },
    };
    const { title, icon } = meta[t.type];

    return (
      <View
        key={t.id}
        style={[styles.txRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }]}
      >
        <View
          style={[styles.txIcon, { backgroundColor: inbound ? colors.successBg : colors.goldSoft }]}
        >
          <Ionicons name={icon} size={14} color={inbound ? colors.success : colors.gold} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.txTitle, { color: colors.ink }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.txMeta, { color: colors.mut2 }]} numberOfLines={1}>
            {t.date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
            {t.pending ? ' · clearing' : ''}
          </Text>
        </View>
        <Text
          style={[styles.txAmount, { color: inbound ? colors.success : colors.red }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {inbound ? '+' : '−'}
          {formatCents(dollarsToCents(t.amountDollars))}
        </Text>
      </View>
    );
  };

  // --- render -----------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: layout.screenX,
          paddingBottom: 48,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenBody>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setEditing(true)} hitSlop={12} style={styles.editBtn}>
              <Ionicons name="create-outline" size={15} color={colors.accInk} />
              <Text style={[styles.editText, { color: colors.accInk }]}>Edit</Text>
            </Pressable>
          </View>

          {/* --- hero: ring carries the progress, so no bar is needed ------- */}
          <Surface style={styles.hero} radius={radius.hero}>
            <View style={styles.heroTop}>
              <ProgressRing
                progress={pctRaw}
                size={76}
                stroke={6}
                color={ringColor}
                trackColor={colors.line}
              >
                <Ionicons name={goal.icon as any} size={26} color={ringColor} />
              </ProgressRing>

              <View style={{ flex: 1 }}>
                <Text style={[typeScale.sectionHeader, { color: colors.ink }]} numberOfLines={2}>
                  {goal.name}
                </Text>
                <Text
                  style={[typeScale.totalValueSm, { color: colors.ink, marginTop: 2 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatCents(dollarsToCents(goal.currentAmount))}
                </Text>
                <Text style={[styles.heroMeta, { color: colors.mut }]} numberOfLines={1}>
                  {pct}% of {formatCents(dollarsToCents(goal.targetAmount))}
                  {!funded && ` · ${formatCents(dollarsToCents(remaining))} to go`}
                </Text>
              </View>
            </View>

            {funded && (
              <View style={[styles.fundedBanner, { backgroundColor: colors.successBg }]}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={[styles.fundedText, { color: colors.success }]}>
                  Target reached — automatic saving has moved on to your other goals
                </Text>
              </View>
            )}

            <View style={styles.actions}>
              <PressScale
                onPress={() => setMoveMode('add')}
                scaleTo={motion.pressScaleStrong}
                style={styles.actionSlot}
              >
                <View style={[styles.actionBtn, { backgroundColor: colors.accent }]}>
                  <Ionicons name="add" size={16} color="#FFFFFF" />
                  <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Add</Text>
                </View>
              </PressScale>

              <PressScale
                onPress={() => setMoveMode('withdraw')}
                scaleTo={motion.pressScaleStrong}
                style={styles.actionSlot}
                disabled={goal.currentAmount <= 0}
              >
                <View
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.bg2, borderColor: colors.line, borderWidth: 1 },
                  ]}
                >
                  <Ionicons name="arrow-up" size={15} color={colors.ink} />
                  <Text style={[styles.actionText, { color: colors.ink }]}>Withdraw</Text>
                </View>
              </PressScale>

              <PressScale
                onPress={() => setMoveMode('move')}
                scaleTo={motion.pressScaleStrong}
                style={styles.actionSlot}
                disabled={goals.length < 2 || goal.currentAmount <= 0}
              >
                <View
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.bg2, borderColor: colors.line, borderWidth: 1 },
                  ]}
                >
                  <Ionicons name="swap-horizontal" size={15} color={colors.ink} />
                  <Text style={[styles.actionText, { color: colors.ink }]}>Move</Text>
                </View>
              </PressScale>
            </View>
          </Surface>

          {/* --- automatic saving -------------------------------------------- */}
          <SectionHeader style={styles.section}>Automatic saving</SectionHeader>

          <Surface style={{ padding: 16 }}>
            <View style={styles.autoHead}>
              <View
                style={[
                  styles.autoIcon,
                  { backgroundColor: goal.autoSave ? colors.successBg : colors.bg2 },
                ]}
              >
                <Ionicons
                  name={goal.autoSave ? 'sparkles' : 'pause'}
                  size={16}
                  color={goal.autoSave ? colors.success : colors.mut2}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[typeScale.cardTitle, { color: colors.ink }]}>
                  {goal.autoSave ? 'On for this goal' : 'Off for this goal'}
                </Text>
                <Body style={{ marginTop: 3, lineHeight: 17 }}>
                  {goal.autoSave
                    ? funded
                      ? 'This goal is funded, so runs skip it.'
                      : shareOfNext > 0
                      ? `About ${formatCents(
                          dollarsToCents(shareOfNext)
                        )} of this week's save should land here.`
                      : preview.explanation ||
                        'Nothing spare right now. We check again each week.'
                    : 'Turn this on and we decide what you can spare and move it here.'}
                </Body>
              </View>

              <Switch
                value={goal.autoSave}
                onValueChange={v => { void setGoalAutoSave(goal.id, v); }}
                trackColor={{ false: colors.line, true: colors.accSoft }}
                thumbColor={goal.autoSave ? colors.accInk : colors.mut2}
              />
            </View>

            {paidInHere > 0 && (
              <View style={[styles.autoStat, { borderTopColor: colors.line }]}>
                <Label>Paid in so far</Label>
                <Text style={[styles.autoStatValue, { color: colors.success }]}>
                  {formatCents(dollarsToCents(paidInHere))}
                </Text>
              </View>
            )}

            {!autoSave.enabled && goal.autoSave && (
              <View style={[styles.warnBanner, { backgroundColor: colors.goldSoft }]}>
                <Ionicons name="pause-circle" size={14} color={colors.gold} />
                <Text style={[styles.warnText, { color: colors.gold }]}>
                  Automatic saving is paused for every goal. Resume it on the Savings tab.
                </Text>
              </View>
            )}
          </Surface>

          {/* --- the rule, stated ------------------------------------------- */}
          <SectionHeader style={styles.section}>How this works</SectionHeader>
          <Surface style={{ padding: 16, gap: 12 }}>
            <Body style={{ lineHeight: 18 }}>
              Once a week we look at your checking account and work out what you can spare above
              the buffer you set, without going over your weekly cap. Whatever is spare gets split
              across your active goals by how much each still needs. You never pick an amount.
            </Body>

            <View style={[styles.ruleRow, { borderTopColor: colors.line }]}>
              <Text style={[styles.ruleLabel, { color: colors.mut }]}>
                {checkingLabel ?? 'Checking balance'}
              </Text>
              <Text style={[styles.ruleValue, { color: colors.ink }]}>
                {/* null means no bank linked yet — an em dash, not a fake $0.00. */}
                {checkingBalance === null
                  ? 'Not linked'
                  : formatCents(dollarsToCents(checkingBalance))}
              </Text>
            </View>
            <View style={styles.ruleRow}>
              <Text style={[styles.ruleLabel, { color: colors.mut }]}>Your buffer</Text>
              <Text style={[styles.ruleValue, { color: colors.ink }]}>
                −{formatCents(dollarsToCents(autoSave.bufferDollars))}
              </Text>
            </View>
            <View style={styles.ruleRow}>
              <Text style={[styles.ruleLabel, { color: colors.mut }]}>Most we move per week</Text>
              <Text style={[styles.ruleValue, { color: colors.ink }]}>
                {formatCents(dollarsToCents(autoSave.weeklyCapDollars))}
              </Text>
            </View>
            <View
              style={[
                styles.ruleRow,
                { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: 10 },
              ]}
            >
              <Text
                style={[styles.ruleLabel, { color: colors.ink, fontFamily: fontFamily.semibold }]}
              >
                This week
              </Text>
              <Text style={[styles.ruleValue, { color: colors.success }]}>
                {preview.unknown
                  ? 'Unknown'
                  : preview.wouldSweep
                  ? formatCents(dollarsToCents(preview.amountDollars))
                  : 'Skipping'}
              </Text>
            </View>
          </Surface>

          {/* --- activity ---------------------------------------------------- */}
          <SectionHeader style={styles.section}>Activity</SectionHeader>
          {history.length > 0 ? (
            <Surface style={{ paddingHorizontal: 14 }}>{history.slice(0, 25).map(renderTx)}</Surface>
          ) : (
            <Surface style={{ padding: 20, alignItems: 'center' }}>
              <Body style={{ textAlign: 'center' }}>Nothing has moved in or out yet.</Body>
            </Surface>
          )}

          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={15} color={colors.red} />
            <Text style={[styles.deleteText, { color: colors.red }]}>Close this goal</Text>
          </Pressable>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  editText: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  hero: {
    marginTop: 12,
    padding: 18,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 4,
  },
  fundedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: radius.chip,
  },
  fundedText: {
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionSlot: {
    flex: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: radius.button,
    minHeight: layout.hitTarget,
  },
  actionText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  section: {
    marginTop: 26,
    marginBottom: 10,
  },
  autoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  autoIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.cellSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoStat: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 3,
  },
  autoStatValue: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: radius.chip,
  },
  warnText: {
    fontFamily: fontFamily.medium,
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ruleLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    flex: 1,
  },
  ruleValue: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 12,
  },
  txIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.cellSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
  },
  txMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  txAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 13.5,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 26,
    paddingVertical: 12,
  },
  deleteText: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
});

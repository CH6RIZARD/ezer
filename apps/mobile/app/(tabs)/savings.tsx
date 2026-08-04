// =============================================================================
// EZER Redesign — Savings (4th tab)
//
// The account the app was missing, and the one thing it does that a bank does
// not: it decides how much you can spare and moves it, without asking you for
// a number.
//
// The screen is ordered by what the user actually wants to know, in order:
//
//   1. how much is saved                    (hero)
//   2. what the app is about to do next     (autopilot card — the differentiator)
//   3. how each goal is doing               (rings, tappable)
//   4. what already happened                (activity)
//
// Every goal card opens its own detail screen; the hero actions open the shared
// MoveMoneySheet. A row that shows a number the user cannot act on does not
// belong here.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import {
  useSavingsGoals,
  type SavingsGoal,
  type SavingsTransaction,
} from '../../utils/SavingsGoalsContext';
import { formatCents } from '../../utils/calculations';
import { fontFamily, typeScale, radius, layout, motion } from '../../theme/type';
import {
  Label,
  Body,
  SectionHeader,
  Surface,
  PressScale,
  ScreenBody,
  Wordmark,
} from '../../components/redesign/Primitives';
import ProgressRing from '../../components/redesign/ProgressRing';
import MoveMoneySheet, { type MoveMode } from '../../components/redesign/MoveMoneySheet';
import GoalFormSheet from '../../components/redesign/GoalFormSheet';

/** Goals store dollars; formatCents wants cents. One conversion, one place. */
const dollarsToCents = (d: number) => Math.round(d * 100);

/** Short, human date — "Sat, Aug 2". */
const shortDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function SavingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const {
    goals,
    transactions,
    autoSave,
    checkingBalance,
    checkingLabel,
    totalSaved,
    savedThisMonth,
    averageSave,
    preview,
    setAutoSaveEnabled,
    refresh,
    hydrated,
    isLoading,
    error,
  } = useSavingsGoals();

  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [creating, setCreating] = useState(false);

  const activeGoals = goals.filter(g => g.autoSave);
  const hasGoals = goals.length > 0;

  const goalName = (id: string) => goals.find(g => g.id === id)?.name ?? 'Savings';
  const openGoal = (id: string) => router.push({ pathname: '/screens/GoalDetail', params: { id } });

  // --- goal card --------------------------------------------------------------

  const renderGoal = (g: SavingsGoal) => {
    const pct = g.targetAmount > 0 ? g.currentAmount / g.targetAmount : 0;
    const funded = g.targetAmount > 0 && g.currentAmount >= g.targetAmount;
    const ringColor = funded ? colors.success : g.color;

    return (
      <PressScale key={g.id} onPress={() => openGoal(g.id)} scaleTo={motion.pressScale}>
        <Surface style={styles.goalRow}>
          <ProgressRing progress={pct} size={50} stroke={4} color={ringColor} trackColor={colors.line}>
            <Ionicons name={g.icon as any} size={18} color={ringColor} />
          </ProgressRing>

          <View style={{ flex: 1 }}>
            <View style={styles.goalTitleRow}>
              <Text style={[styles.goalName, { color: colors.ink }]} numberOfLines={1}>
                {g.name}
              </Text>
              {g.autoSave ? (
                <View style={[styles.tag, { backgroundColor: colors.successBg }]}>
                  <Ionicons name="sparkles" size={9} color={colors.success} />
                  <Text style={[styles.tagText, { color: colors.success }]}>AUTO</Text>
                </View>
              ) : (
                <View style={[styles.tag, { backgroundColor: colors.bg2 }]}>
                  <Text style={[styles.tagText, { color: colors.mut2 }]}>PAUSED</Text>
                </View>
              )}
            </View>

            <Text style={[styles.goalAmount, { color: colors.ink }]} numberOfLines={1}>
              {formatCents(dollarsToCents(g.currentAmount))}
              <Text style={{ color: colors.mut2, fontFamily: fontFamily.regular }}>
                {'  of '}
                {formatCents(dollarsToCents(g.targetAmount))}
              </Text>
            </Text>

            <Text style={[styles.goalMeta, { color: colors.mut2 }]} numberOfLines={1}>
              {funded
                ? 'Funded — nice work'
                : `${formatCents(dollarsToCents(g.targetAmount - g.currentAmount))} to go`}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={16} color={colors.mut2} />
        </Surface>
      </PressScale>
    );
  };

  // --- activity row -----------------------------------------------------------

  const renderTx = (t: SavingsTransaction, i: number) => {
    const inbound = t.type !== 'withdraw';

    // A sweep and a manual deposit are indistinguishable on the wire, so both
    // read as "Money in" rather than the feed guessing and being confidently
    // wrong about which one moved the user's money.
    const meta: Record<SavingsTransaction['type'], { title: string; icon: any }> = {
      transfer: { title: 'Money in', icon: 'arrow-down' },
      withdraw: { title: 'Withdrawal', icon: 'arrow-up' },
      move: { title: 'Moved between goals', icon: 'swap-horizontal' },
    };
    const { title, icon } = meta[t.type];

    return (
      <View
        key={t.id}
        style={[
          styles.txRow,
          // Hairline between rows only, so the card keeps one border.
          i > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
        ]}
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
            {t.goalId ? `${goalName(t.goalId)} · ` : ''}
            {t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {/* Pending is not cosmetic: this money can still be returned. */}
            {t.pending ? ' · clearing' : ''}
          </Text>
        </View>

        <Text
          style={[
            styles.txAmount,
            { color: inbound ? colors.success : colors.red, opacity: t.pending ? 0.6 : 1 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {inbound ? '+' : '−'}
          {formatCents(dollarsToCents(t.amountDollars))}
        </Text>
      </View>
    );
  };

  // --- autopilot copy ---------------------------------------------------------
  //
  // Every branch is the SERVER's answer, not a local guess. `preview` comes
  // from GET /savings/sweep/preview, which runs the same gate the real sweep
  // runs — so what this card promises is what will actually happen.
  const autopilot = !autoSave.enabled
    ? {
        headline: 'Paused',
        detail: 'Automatic saving is off. Your goals stay put until you turn it back on.',
      }
    : activeGoals.length === 0
    ? {
        headline: 'No goals switched on',
        detail:
          'Turn on automatic saving for a goal and we will start moving money into it.',
      }
    : preview.unknown
    ? {
        // We did not get an answer, so we do not claim one. "Nothing this time"
        // here would be a statement about their money that was never checked.
        headline: 'Not sure yet',
        detail: preview.explanation,
      }
    : preview.wouldSweep
    ? {
        headline: `About ${formatCents(dollarsToCents(preview.amountDollars))}`,
        detail: `this week, split across ${activeGoals.length} ${
          activeGoals.length === 1 ? 'goal' : 'goals'
        }. We only move what you can spare above your buffer.`,
      }
    : {
        headline: 'Nothing this time',
        detail: preview.explanation,
      };

  // --- render -----------------------------------------------------------------

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: layout.screenX,
          paddingBottom: layout.contentBottom,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => { void refresh(); }}
            tintColor={colors.mut}
          />
        }
      >
        <ScreenBody>
          <View style={styles.header}>
            <View style={{ flex: 1 }} />
            <Wordmark />
          </View>

          <Text style={[typeScale.screenTitle, { color: colors.ink, marginTop: 4 }]}>Savings</Text>
          <Body style={{ marginTop: 6 }}>Saved for you · yours to move</Body>

          {/* A failed load must not render as "$0.00 saved". */}
          {error !== null && (
            <Surface style={[styles.errorBanner, { borderColor: colors.red + '55' }]}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.red} />
              <Text style={[styles.errorText, { color: colors.red }]}>{error}</Text>
              <Pressable onPress={() => { void refresh(); }} hitSlop={8}>
                <Text style={[styles.retryText, { color: colors.accInk }]}>Retry</Text>
              </Pressable>
            </Surface>
          )}

          {/* --- hero ------------------------------------------------------- */}
          <Surface style={styles.hero} radius={radius.hero}>
            <Label>Total saved</Label>
            <Text
              style={[typeScale.totalValue, { color: colors.success, marginTop: 4 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {hydrated ? formatCents(dollarsToCents(totalSaved)) : '—'}
            </Text>

            {/* Two facts that earn their space: what the app did this month,
                and what it typically moves. Both are observed, not projected. */}
            <View style={styles.statRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.ink }]} numberOfLines={1}>
                  {formatCents(dollarsToCents(savedThisMonth))}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mut2 }]}>Saved this month</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.line }]} />
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.ink }]} numberOfLines={1}>
                  {averageSave > 0 ? formatCents(dollarsToCents(averageSave)) : '—'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mut2 }]}>Typical save</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <PressScale
                onPress={() => setMoveMode('add')}
                scaleTo={motion.pressScaleStrong}
                style={styles.actionSlot}
                disabled={!hasGoals}
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
                disabled={!hasGoals || totalSaved <= 0}
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
                disabled={goals.length < 2 || totalSaved <= 0}
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

          {/* --- autopilot -------------------------------------------------- */}
          <SectionHeader style={styles.section}>Autopilot</SectionHeader>

          <LinearGradient
            colors={
              autoSave.enabled
                ? ([colors.accent, '#2A0F5C'] as const)
                : ([colors.bg2, colors.bg2] as const)
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.autoCard, { borderColor: autoSave.enabled ? 'transparent' : colors.line }]}
          >
            <View style={styles.autoHead}>
              <View
                style={[
                  styles.autoBadge,
                  { backgroundColor: autoSave.enabled ? 'rgba(255,255,255,.14)' : colors.card },
                ]}
              >
                <Ionicons
                  name={autoSave.enabled ? 'sparkles' : 'pause'}
                  size={15}
                  color={autoSave.enabled ? '#FFFFFF' : colors.mut}
                />
              </View>
              <Text
                style={[
                  styles.autoLabel,
                  { color: autoSave.enabled ? 'rgba(255,255,255,.72)' : colors.mut },
                ]}
              >
                NEXT AUTOMATIC SAVE
              </Text>
            </View>

            <Text
              style={[
                styles.autoHeadline,
                { color: autoSave.enabled ? '#FFFFFF' : colors.ink },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {autopilot.headline}
            </Text>

            <Text
              style={[
                styles.autoDetail,
                { color: autoSave.enabled ? 'rgba(255,255,255,.78)' : colors.mut },
              ]}
            >
              {autopilot.detail}
            </Text>

            {/* The buffer and balance are the two inputs to the decision above,
                so they sit with it rather than in a settings screen. */}
            <View
              style={[
                styles.autoFacts,
                { borderTopColor: autoSave.enabled ? 'rgba(255,255,255,.16)' : colors.line },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.autoFactValue,
                    { color: autoSave.enabled ? '#FFFFFF' : colors.ink },
                  ]}
                  numberOfLines={1}
                >
                  {checkingBalance === null ? '—' : formatCents(dollarsToCents(checkingBalance))}
                </Text>
                <Text
                  style={[
                    styles.autoFactLabel,
                    { color: autoSave.enabled ? 'rgba(255,255,255,.62)' : colors.mut2 },
                  ]}
                  numberOfLines={1}
                >
                  {checkingLabel ?? 'Checking'}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.autoFactValue,
                    { color: autoSave.enabled ? '#FFFFFF' : colors.ink },
                  ]}
                  numberOfLines={1}
                >
                  {formatCents(dollarsToCents(autoSave.bufferDollars))}
                </Text>
                <Text
                  style={[
                    styles.autoFactLabel,
                    { color: autoSave.enabled ? 'rgba(255,255,255,.62)' : colors.mut2 },
                  ]}
                  numberOfLines={1}
                >
                  Your buffer
                </Text>
              </View>

              <Pressable
                onPress={() => { void setAutoSaveEnabled(!autoSave.enabled); }}
                hitSlop={8}
                style={[
                  styles.autoToggle,
                  {
                    backgroundColor: autoSave.enabled ? 'rgba(255,255,255,.16)' : colors.card,
                    borderColor: autoSave.enabled ? 'transparent' : colors.line,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.autoToggleText,
                    { color: autoSave.enabled ? '#FFFFFF' : colors.accInk },
                  ]}
                >
                  {autoSave.enabled ? 'Pause' : 'Resume'}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>

          {/* --- goals ------------------------------------------------------ */}
          <View style={styles.sectionRow}>
            <SectionHeader style={{ flex: 1 }}>Goals</SectionHeader>
            <Pressable onPress={() => setCreating(true)} hitSlop={10} style={styles.addGoal}>
              <Ionicons name="add" size={15} color={colors.accInk} />
              <Text style={[styles.addGoalText, { color: colors.accInk }]}>New goal</Text>
            </Pressable>
          </View>

          {hasGoals ? (
            <View style={{ gap: 8 }}>{goals.map(renderGoal)}</View>
          ) : (
            <Surface style={styles.empty}>
              <Ionicons name="flag-outline" size={22} color={colors.mut2} />
              <Body style={{ textAlign: 'center', marginTop: 8 }}>
                Create a goal and we start putting money aside for it on our own.
              </Body>
              <PressScale onPress={() => setCreating(true)} style={{ marginTop: 14 }}>
                <View style={[styles.emptyCta, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Create a goal</Text>
                </View>
              </PressScale>
            </Surface>
          )}

          {/* --- activity ---------------------------------------------------- */}
          <SectionHeader style={styles.section}>Recent activity</SectionHeader>
          {transactions.length > 0 ? (
            <Surface style={{ paddingHorizontal: 14 }}>
              {transactions.slice(0, 10).map(renderTx)}
            </Surface>
          ) : (
            <Surface style={styles.empty}>
              <Body style={{ textAlign: 'center' }}>No movements yet.</Body>
            </Surface>
          )}

          {/*
            Standing disclosure. The API's savingsEngine cannot custody funds
            until a real ACH processor is wired, so these balances are
            simulated. Saying so in the product is cheaper than explaining it
            to a partner later.
          */}
          <Text style={[styles.legal, { color: colors.mut3 }]}>
            EZER is not a bank. Balances and transfers shown here are simulated while bank
            connections are being certified — no funds are held, promised or guaranteed.
          </Text>
        </ScreenBody>
      </ScrollView>

      <MoveMoneySheet
        visible={moveMode !== null}
        mode={moveMode ?? 'add'}
        onClose={() => setMoveMode(null)}
      />

      <GoalFormSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={id => router.push({ pathname: '/screens/GoalDetail', params: { id } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  section: {
    marginTop: 26,
    marginBottom: 10,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 10,
  },
  addGoal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addGoalText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  hero: {
    marginTop: 16,
    padding: 18,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 14,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
  },
  statValue: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
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
  autoCard: {
    borderRadius: radius.hero,
    borderWidth: 1,
    padding: 18,
  },
  autoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  autoBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.cellSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  autoHeadline: {
    fontFamily: fontFamily.serif,
    fontSize: 32,
    marginTop: 12,
  },
  autoDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
    lineHeight: 18.5,
    marginTop: 6,
  },
  autoFacts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  autoFactValue: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  autoFactLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    marginTop: 2,
  },
  autoToggle: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  autoToggleText: {
    fontFamily: fontFamily.bold,
    fontSize: 11.5,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 14,
  },
  goalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  goalName: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
    flexShrink: 1,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: radius.pill,
  },
  tagText: {
    fontFamily: fontFamily.bold,
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  goalAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    marginTop: 4,
  },
  goalMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  emptyCta: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.button,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 12,
    marginTop: 14,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    flex: 1,
  },
  retryText: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
  },
  legal: {
    fontFamily: fontFamily.regular,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 24,
  },
});

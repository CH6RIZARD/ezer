// =============================================================================
// EZER Redesign — Move money sheet
//
// One sheet for all three ways money moves, because they are the same gesture
// with a different destination: pick a source, pick a destination, type an
// amount, confirm.
//
//   add       linked bank account  →  goal
//   withdraw  goal                 →  linked bank account
//   move      goal                 →  goal
//
// It lives in components/ rather than inside the Savings tab so the goal detail
// screen opens the identical sheet — a withdrawal must not behave differently
// depending on which screen the user started from.
//
// Every action is a SERVER call now, so the sheet has a genuine in-flight state
// and its ceilings come from the API's `withdrawable` figure rather than a
// local balance. Withdrawable is not the same as the balance: money inside the
// ACH return window is real but not yet spendable, and the sheet has to say so
// rather than let the user hit a 409.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals } from '../../utils/SavingsGoalsContext';
import { usePlaid } from '../../utils/usePlaid';
import { formatCents } from '../../utils/calculations';
import { typeScale, fontFamily, radius, layout, motion } from '../../theme/type';
import { Label, Body, Surface, PressScale } from './Primitives';

export type MoveMode = 'add' | 'withdraw' | 'move';

const dollarsToCents = (d: number) => Math.round(d * 100);

/** Quick-amount chips. Round numbers cover most manual transfers in one tap. */
const QUICK_AMOUNTS = [10, 25, 50, 100];

const COPY: Record<MoveMode, { title: string; cta: string; sourceLabel: string; destLabel: string }> = {
  add: { title: 'Add money', cta: 'Transfer in', sourceLabel: 'From account', destLabel: 'To goal' },
  withdraw: { title: 'Withdraw', cta: 'Withdraw', sourceLabel: 'From goal', destLabel: 'To account' },
  move: { title: 'Move money', cta: 'Move', sourceLabel: 'From goal', destLabel: 'To goal' },
};

export default function MoveMoneySheet({
  visible,
  mode,
  /** Goal the sheet opens on — the goal detail screen passes its own. */
  goalId,
  onClose,
}: {
  visible: boolean;
  mode: MoveMode;
  goalId?: string | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const {
    goals,
    checkingBalance,
    checkingLabel,
    depositToGoal,
    withdrawFromGoal,
    moveBetweenGoals,
  } = useSavingsGoals();
  const { openPlaidLink, isLoading: plaidLoading } = usePlaid();

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [destGoalId, setDestGoalId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Latest-value refs so the open effect can read current goals without
  // listing them as dependencies.
  const latestGoals = useRef(goals);
  latestGoals.current = goals;

  // Reset on the OPEN transition only — not on close (that would blank the
  // fields mid dismiss-animation) and not on every dependency change (a
  // refresh landing would wipe a half-typed amount).
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      const first = goalId ?? latestGoals.current[0]?.id ?? null;
      setSelectedGoalId(first);
      setDestGoalId(latestGoals.current.find(g => g.id !== first)?.id ?? null);
      setAmountText('');
      setSubmitError(null);
      setBusy(false);
    }
    wasVisible.current = visible;
  }, [visible, mode, goalId]);

  const copy = COPY[mode];
  const sourceGoal = goals.find(g => g.id === selectedGoalId) ?? null;
  const destGoal = goals.find(g => g.id === destGoalId) ?? null;

  const parsed = Number(amountText);
  const amountDollars = Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;

  /**
   * The ceiling for this move.
   *
   * For `add` it is the checking balance. For the other two it is the goal's
   * WITHDRAWABLE figure, not its balance — the server refuses to release funds
   * still inside the ACH return window, and letting the user type a number the
   * server will reject is a worse experience than showing the real limit.
   */
  const availableDollars =
    mode === 'add' ? checkingBalance ?? 0 : sourceGoal?.withdrawable ?? 0;

  const clearing =
    mode !== 'add' && sourceGoal
      ? Math.max(0, sourceGoal.currentAmount - sourceGoal.withdrawable)
      : 0;

  const availableLabel =
    mode === 'add'
      ? checkingBalance === null
        ? 'Link a bank account to transfer money in.'
        : `${formatCents(dollarsToCents(checkingBalance))} in ${checkingLabel ?? 'checking'}`
      : sourceGoal
      ? `${formatCents(dollarsToCents(availableDollars))} available in ${sourceGoal.name}`
      : null;

  /**
   * Overdraft shows while typing, not only on submit. The whole point of the
   * screen is that the balance is real, so the ceiling should be visible before
   * the user commits to a number.
   */
  const liveError =
    amountDollars > availableDollars && amountDollars > 0
      ? mode === 'add'
        ? `Your checking account only has ${formatCents(
            dollarsToCents(availableDollars)
          )} available.`
        : sourceGoal
        ? `${formatCents(dollarsToCents(availableDollars))} of ${
            sourceGoal.name
          } is available right now.`
        : null
      : null;
  const error = liveError ?? submitError;

  const canSubmit =
    !busy &&
    amountDollars > 0 &&
    !liveError &&
    !!sourceGoal &&
    (mode === 'move' ? !!destGoal && destGoal.id !== sourceGoal.id : true) &&
    (mode !== 'add' || checkingBalance !== null);

  const submit = async () => {
    if (!sourceGoal || busy) return;
    setBusy(true);
    setSubmitError(null);

    let result;
    if (mode === 'add') {
      result = await depositToGoal(sourceGoal.id, amountDollars);
    } else if (mode === 'withdraw') {
      result = await withdrawFromGoal(sourceGoal.id, amountDollars);
    } else {
      if (!destGoal) {
        setSubmitError('Choose a goal to move into.');
        setBusy(false);
        return;
      }
      result = await moveBetweenGoals(sourceGoal.id, destGoal.id, amountDollars);
    }

    setBusy(false);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    onClose();
  };

  const linkBank = () => {
    // The context re-reads /plaid/balance on refresh, so a freshly linked
    // account shows up without this sheet tracking accounts itself.
    openPlaidLink(() => onClose());
  };

  // --- pickers ---------------------------------------------------------------

  const goalPicker = (
    selectedId: string | null,
    onSelect: (id: string) => void,
    excludeId?: string | null,
    /** Show the withdrawable figure rather than the balance. */
    showAvailable = false
  ) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pickerRow}
      keyboardShouldPersistTaps="handled"
    >
      {goals
        .filter(g => g.id !== excludeId)
        .map(g => {
          const active = g.id === selectedId;
          return (
            <Pressable
              key={g.id}
              onPress={() => {
                onSelect(g.id);
                setSubmitError(null);
              }}
              style={[
                styles.pickerCard,
                {
                  backgroundColor: active ? colors.accSoft : colors.bg2,
                  borderColor: active ? colors.accInk : colors.line,
                },
              ]}
            >
              <View style={[styles.pickerIcon, { backgroundColor: g.color + '22' }]}>
                <Ionicons name={g.icon as any} size={15} color={g.color} />
              </View>
              <Text style={[styles.pickerName, { color: colors.ink }]} numberOfLines={1}>
                {g.name}
              </Text>
              <Text style={[styles.pickerMeta, { color: colors.mut2 }]} numberOfLines={1}>
                {formatCents(dollarsToCents(showAvailable ? g.withdrawable : g.currentAmount))}
              </Text>
            </Pressable>
          );
        })}
    </ScrollView>
  );

  const accountRow = (
    <View style={{ gap: 8 }}>
      {checkingLabel ? (
        <View
          style={[styles.accountRow, { backgroundColor: colors.bg2, borderColor: colors.line }]}
        >
          <View style={[styles.pickerIcon, { backgroundColor: colors.card }]}>
            <Ionicons name="business" size={15} color={colors.accInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pickerName, { color: colors.ink }]} numberOfLines={1}>
              {checkingLabel}
            </Text>
            {checkingBalance !== null && (
              <Text style={[styles.pickerMeta, { color: colors.mut2 }]}>
                {formatCents(dollarsToCents(checkingBalance))} available
              </Text>
            )}
          </View>
          <Ionicons name="checkmark-circle" size={18} color={colors.accInk} />
        </View>
      ) : (
        <Pressable onPress={linkBank} disabled={plaidLoading} style={styles.linkBank}>
          <Ionicons name="add-circle-outline" size={16} color={colors.accInk} />
          <Text style={[styles.linkBankText, { color: colors.accInk }]}>
            {plaidLoading ? 'Opening Plaid…' : 'Link a bank account'}
          </Text>
        </Pressable>
      )}
    </View>
  );

  // --- render ----------------------------------------------------------------

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Pressable>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />

          <View style={styles.head}>
            <Text style={[typeScale.sectionHeader, { color: colors.ink, flex: 1 }]}>
              {copy.title}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} disabled={busy}>
              <Ionicons name="close" size={20} color={colors.mut} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 440 }}
          >
            {/* --- amount, first: it is what the user came to type --------- */}
            <View
              style={[
                styles.amountBox,
                { backgroundColor: colors.bg2, borderColor: error ? colors.red : colors.line },
              ]}
            >
              <Text style={[styles.currency, { color: colors.mut }]}>$</Text>
              <TextInput
                value={amountText}
                // Strip anything that is not a numeral or a dot: decimal-pad
                // still admits locale separators on some Android keyboards.
                onChangeText={txt => {
                  setAmountText(txt.replace(/[^0-9.]/g, ''));
                  setSubmitError(null);
                }}
                placeholder="0.00"
                placeholderTextColor={colors.mut2}
                keyboardType="decimal-pad"
                autoFocus
                editable={!busy}
                style={[styles.amountInput, { color: colors.ink }]}
              />
              {/* MAX is a withdraw/move affordance. Offering it on `add` would
                  invite emptying checking into savings, which is the opposite
                  of what the buffer exists to prevent. */}
              {mode !== 'add' && availableDollars > 0 && (
                <Pressable
                  onPress={() => {
                    setAmountText(availableDollars.toFixed(2));
                    setSubmitError(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={[typeScale.labelSm, { color: colors.gold }]}>MAX</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map(q => (
                <Pressable
                  key={q}
                  onPress={() => {
                    setAmountText(String(q));
                    setSubmitError(null);
                  }}
                  style={[styles.quickChip, { backgroundColor: colors.bg2, borderColor: colors.line }]}
                >
                  <Text style={[styles.quickText, { color: colors.ink }]}>${q}</Text>
                </Pressable>
              ))}
            </View>

            {availableLabel !== null && <Body style={{ marginTop: 8 }}>{availableLabel}</Body>}

            {/* Explains the gap between balance and withdrawable, rather than
                leaving the user to wonder where the rest of their money is. */}
            {clearing > 0 && (
              <Body style={{ marginTop: 4, fontSize: 11.5 }}>
                {formatCents(dollarsToCents(clearing))} more is still clearing and will be
                available in a few business days.
              </Body>
            )}

            {/* --- source ---------------------------------------------------- */}
            <Label style={styles.fieldLabel}>{copy.sourceLabel}</Label>
            {mode === 'add'
              ? accountRow
              : goalPicker(
                  selectedGoalId,
                  id => {
                    setSelectedGoalId(id);
                    if (mode === 'move' && id === destGoalId) {
                      setDestGoalId(goals.find(g => g.id !== id)?.id ?? null);
                    }
                  },
                  null,
                  true
                )}

            {/* --- destination ----------------------------------------------- */}
            <Label style={styles.fieldLabel}>{copy.destLabel}</Label>
            {mode === 'add' && goalPicker(selectedGoalId, setSelectedGoalId)}
            {mode === 'withdraw' && accountRow}
            {mode === 'move' &&
              (goals.length > 1 ? (
                goalPicker(destGoalId, setDestGoalId, selectedGoalId)
              ) : (
                <Surface style={{ padding: 14 }}>
                  <Body>Create a second goal to move money between goals.</Body>
                </Surface>
              ))}

            {error !== null && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}

            {/* Standard-ACH expectation, set before the tap rather than after. */}
            {mode !== 'move' && (
              <Body style={{ marginTop: 10, fontSize: 11.5 }}>
                {mode === 'add'
                  ? 'Standard transfers take 1–3 business days to clear, and become available to withdraw once they do.'
                  : `Standard transfers land in ${
                      checkingLabel ?? 'your account'
                    } within 1–3 business days. No fee.`}
              </Body>
            )}
          </ScrollView>

          <PressScale
            onPress={submit}
            scaleTo={motion.pressScale}
            style={{ marginTop: 14 }}
            disabled={!canSubmit}
          >
            <View
              style={[
                styles.confirm,
                { backgroundColor: canSubmit ? colors.accent : colors.line },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text
                  style={[styles.confirmText, { color: canSubmit ? '#FFFFFF' : colors.mut2 }]}
                >
                  {amountDollars > 0
                    ? `${copy.cta} ${formatCents(dollarsToCents(amountDollars))}`
                    : copy.cta}
                </Text>
              )}
            </View>
          </PressScale>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingHorizontal: layout.screenX,
    paddingTop: 10,
    paddingBottom: 34,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginBottom: 12,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: 14,
  },
  currency: {
    fontFamily: fontFamily.serif,
    fontSize: 22,
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 26,
    paddingVertical: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.button,
    borderWidth: 1,
  },
  quickText: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  pickerRow: {
    gap: 8,
    paddingRight: 4,
  },
  pickerCard: {
    width: 132,
    padding: 11,
    borderRadius: radius.chip,
    borderWidth: 1,
    gap: 4,
  },
  pickerIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.cellSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerName: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  pickerMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  linkBank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  linkBankText: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginTop: 12,
  },
  confirm: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: radius.button,
    minHeight: layout.hitTarget,
  },
  confirmText: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
});

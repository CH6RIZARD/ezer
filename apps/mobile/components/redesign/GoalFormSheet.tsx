// =============================================================================
// EZER Redesign — Goal form sheet
//
// Create a goal, or edit one that exists. Same sheet either way: the fields are
// identical, and keeping one component means a field added to creation cannot
// go missing from editing.
//
// There is NO auto-save amount or cadence here, by design. The user chooses
// whether a goal saves automatically; the SERVER's engine decides how much,
// from their checking balance (apps/api services/savingsEngine.ts). Putting an
// amount field back would turn the feature into the standing order it exists
// to replace.
//
// `currentAmount` is not editable either. Balances only change through the
// ledger, so every dollar in a goal has a transaction explaining how it got
// there.
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
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals, type SavingsGoal } from '../../utils/SavingsGoalsContext';
import { typeScale, fontFamily, radius, layout, motion } from '../../theme/type';
import { Label, Body, PressScale } from './Primitives';

/** Icon set kept small on purpose — a 40-glyph grid is a chore, not a choice. */
const ICON_CHOICES = [
  'shield-checkmark',
  'airplane',
  'home',
  'car-sport',
  'school',
  'gift',
  'heart',
  'laptop',
  'medkit',
  'flag',
];

/** Targets people actually type, offered as one tap each. */
const TARGET_PRESETS = [500, 1000, 2500, 5000];

export default function GoalFormSheet({
  visible,
  /** Goal being edited; omit to create a new one. */
  goal,
  onClose,
  onCreated,
}: {
  visible: boolean;
  goal?: SavingsGoal | null;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const { addGoal, updateGoal, setGoalAutoSave } = useSavingsGoals();
  const [busy, setBusy] = useState(false);

  const isEdit = !!goal;

  const [name, setName] = useState('');
  const [targetText, setTargetText] = useState('');
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [color, setColor] = useState(colors.accInk);
  const [autoSave, setAutoSaveOn] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const palette = [colors.accInk, colors.gold, colors.success, colors.red, '#2C4A8F'];

  // Populate on the OPEN transition so a sweep landing mid-edit cannot reset
  // fields the user is typing into.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setName(goal?.name ?? '');
      setTargetText(goal ? String(goal.targetAmount) : '');
      setIcon(goal?.icon ?? ICON_CHOICES[0]);
      setColor(goal?.color ?? colors.accInk);
      setAutoSaveOn(goal ? goal.autoSave : true);
      setError(null);
    }
    wasVisible.current = visible;
  }, [visible, goal, colors.accInk]);

  const targetAmount = Number(targetText.replace(/[^0-9.]/g, ''));

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the goal a name.');
      return;
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setError('Set a target greater than $0.00.');
      return;
    }

    setBusy(true);
    setError(null);

    // Every write goes to the server and the context re-reads afterwards.
    // Nothing is applied locally first: a goal that appears instantly and then
    // vanishes when the request fails is worse than a moment of latency.
    const res =
      isEdit && goal
        ? await updateGoal(goal.id, { name: trimmed, targetAmount, icon, color })
        : await addGoal({ name: trimmed, targetAmount, icon, color, autoSave });

    // Auto-save is a separate status field server-side, so an edit that changed
    // it needs its own call. Skipped when nothing changed.
    if (res.ok && isEdit && goal && goal.autoSave !== autoSave) {
      await setGoalAutoSave(goal.id, autoSave);
    }

    setBusy(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!isEdit && res.id) onCreated?.(res.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
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
              {isEdit ? 'Edit goal' : 'New goal'}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.mut} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: 460 }}
          >
            {/* --- identity: icon + name on one line ---------------------- */}
            <View style={styles.identityRow}>
              <View style={[styles.identityIcon, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon as any} size={22} color={color} />
              </View>
              <TextInput
                value={name}
                onChangeText={t => {
                  setName(t);
                  setError(null);
                }}
                placeholder="Emergency fund"
                placeholderTextColor={colors.mut2}
                maxLength={40}
                style={[
                  styles.input,
                  { backgroundColor: colors.bg2, borderColor: colors.line, color: colors.ink },
                ]}
              />
            </View>

            <Label style={styles.fieldLabel}>Target</Label>
            <View
              style={[styles.amountBox, { backgroundColor: colors.bg2, borderColor: colors.line }]}
            >
              <Text style={[styles.currency, { color: colors.mut }]}>$</Text>
              <TextInput
                value={targetText}
                onChangeText={t => {
                  setTargetText(t.replace(/[^0-9.]/g, ''));
                  setError(null);
                }}
                placeholder="5,000"
                placeholderTextColor={colors.mut2}
                keyboardType="decimal-pad"
                style={[styles.amountInput, { color: colors.ink }]}
              />
            </View>

            <View style={styles.presetRow}>
              {TARGET_PRESETS.map(p => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setTargetText(String(p));
                    setError(null);
                  }}
                  style={[styles.preset, { backgroundColor: colors.bg2, borderColor: colors.line }]}
                >
                  <Text style={[styles.presetText, { color: colors.ink }]}>
                    ${p.toLocaleString('en-US')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Label style={styles.fieldLabel}>Icon</Label>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              {ICON_CHOICES.map(ic => {
                const active = ic === icon;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    style={[
                      styles.iconTile,
                      {
                        backgroundColor: active ? color + '22' : colors.bg2,
                        borderColor: active ? color : colors.line,
                      },
                    ]}
                  >
                    <Ionicons name={ic as any} size={18} color={active ? color : colors.mut} />
                  </Pressable>
                );
              })}
            </ScrollView>

            <Label style={styles.fieldLabel}>Colour</Label>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {palette.map(c => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[
                    styles.swatch,
                    { backgroundColor: c, borderColor: c === color ? colors.ink : 'transparent' },
                  ]}
                >
                  {c === color && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </Pressable>
              ))}
            </View>

            {/* --- automatic saving: one switch, no numbers ---------------- */}
            <View style={[styles.autoRow, { borderTopColor: colors.line }]}>
              <View style={[styles.autoIcon, { backgroundColor: colors.successBg }]}>
                <Ionicons name="sparkles" size={15} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typeScale.cardTitle, { color: colors.ink }]}>Save automatically</Text>
                <Body style={{ marginTop: 3, lineHeight: 17 }}>
                  We work out what you can spare from your checking balance and move it here. You
                  never set an amount.
                </Body>
              </View>
              <Switch
                value={autoSave}
                onValueChange={setAutoSaveOn}
                trackColor={{ false: colors.line, true: colors.accSoft }}
                thumbColor={autoSave ? colors.accInk : colors.mut2}
              />
            </View>

            {error !== null && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}
          </ScrollView>

          <PressScale
            onPress={save}
            scaleTo={motion.pressScale}
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            <View
              style={[
                styles.confirm,
                { backgroundColor: busy ? colors.line : colors.accent },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.mut} />
              ) : (
                <Text style={styles.confirmText}>{isEdit ? 'Save changes' : 'Create goal'}</Text>
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  identityIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.button,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fontFamily.semibold,
    fontSize: 15,
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
    fontSize: 20,
  },
  amountInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    paddingVertical: 12,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.button,
    borderWidth: 1,
  },
  presetText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radius.chip,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginTop: 20,
    paddingTop: 18,
    borderTopWidth: 1,
  },
  autoIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.cellSm,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FFFFFF',
  },
});

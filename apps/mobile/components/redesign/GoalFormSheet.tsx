// =============================================================================
// EZER Redesign — Goal form sheet ("Goal 1a — Centered amount" handoff)
//
// Create a goal, or edit one that exists. Same sheet either way: the fields are
// identical, and keeping one component means a field added to creation cannot
// go missing from editing.
//
// Layout: the target leads, centred, with presets under it. The name field
// carries the "look" chip (icon + colour, one small picker). Auto-save is a
// full purple card with its own toggle; while the keyboard is up it shrinks to
// a chip so you still see it's on, and Create docks above the decimal pad.
// Create stays disabled until there is a name and a target above $0.
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
  StyleSheet,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraDoveHost, DoveLoader } from '../CameraDove';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals, type SavingsGoal } from '../../utils/SavingsGoalsContext';
import { fontFamily, motion } from '../../theme/type';
import { themeKeys } from '../../theme/tokens';
import { PressScale } from './Primitives';

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

const commas = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Raw "5000.5" -> "5,000.5" for the big display. */
function showAmount(raw: string): string {
  if (!raw) return '';
  const [i, d] = raw.split('.');
  const int = commas((i || '0').replace(/^0+(?=\d)/, '') || '0');
  return d === undefined ? int : `${int}.${d}`;
}

/** Keep typing to digits, one dot, 7 whole digits and 2 decimals (the mock's keypad rules). */
function cleanAmount(t: string): string {
  const s = t.replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  const int = (dot < 0 ? s : s.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, 7);
  if (dot < 0) return int;
  return `${int || '0'}.${s.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`;
}

/** Shrinks the serif figure so it never runs past `max` dp (mock's `fit`). */
function fitSize(txt: string, base = 96, max = 290): number {
  let w = 0;
  for (const ch of txt) w += /[0-9]/.test(ch) ? 0.5 : 0.26;
  w *= base;
  return Math.round(w > max ? (base * max) / w : base);
}

const EASE = Easing.bezier(...motion.easeOut);

/** The amount's caret: the real input is invisible, so the display draws its own. */
function Caret({ color }: { color: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setOn(v => !v), 530);
    return () => clearInterval(t);
  }, []);
  return <View style={[styles.caret, { backgroundColor: color, opacity: on ? 1 : 0 }]} />;
}

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

  const [focus, setFocus] = useState<'amt' | 'name' | null>(null);
  const [kbUp, setKbUp] = useState(false);
  const [look, setLook] = useState(false);
  const amtRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);

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
      setLook(false);
    }
    wasVisible.current = visible;
  }, [visible, goal, colors.accInk]);

  // Android's back key hides the keyboard without blurring the input, so the
  // compact layout follows the keyboard itself, not focus.
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbUp(true));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setKbUp(false);
      amtRef.current?.blur();
      nameRef.current?.blur();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Toggle knob: native-driven slide, easeOut.
  const knob = useRef(new Animated.Value(autoSave ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(knob, { toValue: autoSave ? 1 : 0, duration: 220, easing: EASE, useNativeDriver: true }).start();
  }, [autoSave, knob]);

  const targetAmount = Number(targetText.replace(/[^0-9.]/g, ''));
  const ok = name.trim().length > 0 && Number.isFinite(targetAmount) && targetAmount > 0;

  const dismiss = () => {
    Keyboard.dismiss();
    setLook(false);
  };

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

    dismiss();
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

  const amtShown = showAmount(targetText) || '0';
  const on = autoSave;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      </Pressable>

      <KeyboardAvoidingView
        behavior="padding" // both platforms: see app/auth/login.tsx
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={dismiss}
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.line, paddingBottom: kbUp ? 12 : 34 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />

          <View style={styles.head}>
            <Pressable
              onPress={onClose}
              hitSlop={6}
              style={[styles.closeBtn, { backgroundColor: colors.bg2, borderColor: colors.line }]}
            >
              <Ionicons name="close" size={17} color={colors.ink} />
            </Pressable>
            <Text style={[styles.title, { color: colors.ink }]}>{isEdit ? 'Edit goal' : 'New goal'}</Text>
            <View style={{ width: 38 }} />
          </View>

          {/* --- target: centred serif figure over an invisible decimal-pad input --- */}
          <Text style={[styles.targetLabel, { color: colors.mut }]}>TARGET</Text>
          <View style={styles.amtRow}>
            <Text style={[styles.amtDollar, { color: colors.mut2 }]}>$</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.amtText,
                { fontSize: fitSize(amtShown), color: targetText ? colors.ink : colors.mut2 },
              ]}
            >
              {amtShown}
            </Text>
            {focus === 'amt' && kbUp && <Caret color={colors.accInk} />}
            <TextInput
              ref={amtRef}
              value={targetText}
              onChangeText={t => {
                setTargetText(cleanAmount(t));
                setError(null);
              }}
              onFocus={() => {
                setFocus('amt');
                setLook(false);
              }}
              onBlur={() => setFocus(f => (f === 'amt' ? null : f))}
              keyboardType="decimal-pad"
              caretHidden
              contextMenuHidden
              accessibilityLabel="Target amount"
              style={styles.amtInput}
            />
          </View>

          <View style={styles.presetRow}>
            {TARGET_PRESETS.map(p => {
              const active = targetAmount === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => {
                    setTargetText(String(p));
                    setError(null);
                  }}
                  style={[
                    styles.preset,
                    {
                      backgroundColor: active ? colors.accSoft : 'transparent',
                      borderColor: active ? colors.accInk + '59' : colors.line,
                    },
                  ]}
                >
                  <Text style={[styles.presetText, { color: active ? colors.accInk : colors.mut }]}>
                    ${p.toLocaleString('en-US')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* --- name, carrying the look chip -------------------------------- */}
          <View style={styles.nameWrap}>
            <View
              style={[
                styles.nameBox,
                {
                  backgroundColor: colors.bg2,
                  borderColor: focus === 'name' && kbUp ? colors.accInk + '8C' : colors.line,
                },
              ]}
            >
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setLook(v => !v);
                }}
                accessibilityLabel="Icon and colour"
                style={[styles.lookChip, { backgroundColor: color + '22', borderColor: color + '66' }]}
              >
                <Ionicons name={icon as any} size={21} color={color} />
                <View style={[styles.lookBadge, { backgroundColor: colors.line2, borderColor: colors.bg2 }]}>
                  <Ionicons name="chevron-down" size={9} color={colors.ink} />
                </View>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.smallLabel, { color: colors.mut2 }]}>NAME</Text>
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={t => {
                    setName(t);
                    setError(null);
                  }}
                  onFocus={() => {
                    setFocus('name');
                    setLook(false);
                  }}
                  onBlur={() => setFocus(f => (f === 'name' ? null : f))}
                  placeholder="Emergency fund"
                  placeholderTextColor={colors.mut2}
                  maxLength={40}
                  autoComplete="off"
                  selectionColor={colors.accInk}
                  style={[styles.nameInput, { color: colors.ink }]}
                />
              </View>
            </View>

            {look && (
              <View style={[styles.lookPop, { backgroundColor: colors.bg2, borderColor: colors.line2 }]}>
                <Text style={[styles.smallLabel, { color: colors.mut2, marginBottom: 10 }]}>ICON</Text>
                <View style={styles.iconGrid}>
                  {ICON_CHOICES.map(ic => {
                    const active = ic === icon;
                    return (
                      <Pressable
                        key={ic}
                        onPress={() => setIcon(ic)}
                        style={[
                          styles.iconTile,
                          {
                            backgroundColor: active ? color + '22' : 'transparent',
                            borderColor: active ? color : colors.line2,
                          },
                        ]}
                      >
                        <Ionicons name={ic as any} size={19} color={active ? color : colors.mut} />
                      </Pressable>
                    );
                  })}
                </View>
                <View style={[styles.popDivider, { backgroundColor: colors.line2 }]} />
                <Text style={[styles.smallLabel, { color: colors.mut2, marginBottom: 10 }]}>COLOUR</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  {palette.map(c => (
                    <Pressable
                      key={c}
                      onPress={() => setColor(c)}
                      style={[styles.swatch, { backgroundColor: c, borderColor: c === color ? colors.ink : 'transparent' }]}
                    >
                      {c === color && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* --- automatic saving: a full card at rest, a chip while typing ---- */}
          {kbUp ? (
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setAutoSaveOn(v => !v)}
                style={[styles.autoChip, { backgroundColor: on ? colors.accSoft : colors.bg2 }]}
              >
                <Ionicons name="sparkles" size={14} color={on ? colors.accInk : colors.mut} />
                <Text style={[styles.autoChipText, { color: on ? colors.accInk : colors.mut }]}>
                  Saves automatically · {on ? 'On' : 'Off'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setAutoSaveOn(v => !v)} style={{ marginTop: 16 }}>
              <LinearGradient
                colors={on ? ([colors.accent, '#2A0F5C'] as const) : ([colors.bg2, colors.bg2] as const)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.autoCard, { borderColor: on ? colors.accInk + '2E' : colors.line }]}
              >
                <View style={styles.autoHead}>
                  <View style={[styles.autoBadge, { backgroundColor: on ? 'rgba(255,255,255,.14)' : colors.card }]}>
                    <Ionicons name="sparkles" size={15} color={on ? '#FFFFFF' : colors.mut} />
                  </View>
                  <Text style={[styles.autoLabel, { color: on ? 'rgba(255,255,255,.72)' : colors.mut2 }]}>
                    AUTOMATIC SAVING
                  </Text>
                  <View style={[styles.track, { backgroundColor: on ? colors.accInk : 'rgba(255,255,255,.12)' }]}>
                    <Animated.View
                      style={[
                        styles.knob,
                        {
                          backgroundColor: on ? '#2A0F5C' : colors.mut2,
                          transform: [{ translateX: knob.interpolate({ inputRange: [0, 1], outputRange: [0, 20] }) }],
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={[styles.autoTitle, { color: on ? '#FFFFFF' : colors.ink }]}>Save automatically</Text>
                <Text style={[styles.autoSub, { color: on ? 'rgba(255,255,255,.8)' : colors.mut }]}>
                  We work out what you can spare from your checking balance and move it here. You never set
                  an amount.
                </Text>
              </LinearGradient>
            </Pressable>
          )}

          {error !== null && <Text style={[styles.error, { color: colors.red }]}>{error}</Text>}

          <PressScale
            onPress={save}
            scaleTo={motion.pressScale}
            style={{ marginTop: kbUp ? 12 : 20 }}
            disabled={busy || !ok}
          >
            <LinearGradient
              colors={ok ? themeKeys.ezer : ([colors.line, colors.line] as const)}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.8 }}
              style={[
                styles.confirm,
                { opacity: busy ? 0.7 : 1 },
                ok && { boxShadow: '0 14px 30px -8px rgba(98,48,184,.7), inset 0 1px 0 rgba(255,255,255,.18)' },
              ]}
            >
              <DoveLoader active={busy} />
              <Text style={[styles.confirmText, { color: ok ? '#FFFFFF' : colors.mut2 }]}>
                {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create goal'}
              </Text>
            </LinearGradient>
          </PressScale>
        </Pressable>
      </KeyboardAvoidingView>
      {/* Sheets draw above the root view on Android: the camera dove draws here while one is open. */}
      <CameraDoveHost nested />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 16.5,
  },
  targetLabel: {
    marginTop: 22,
    textAlign: 'center',
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  amtRow: {
    marginTop: 6,
    height: 100,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amtDollar: {
    alignSelf: 'flex-start',
    marginTop: 14,
    marginRight: 4,
    fontFamily: fontFamily.serif,
    fontSize: 44,
    lineHeight: 48,
  },
  amtText: {
    fontFamily: fontFamily.serif,
    letterSpacing: -1,
    includeFontPadding: false,
  },
  caret: {
    width: 3,
    height: 72,
    marginLeft: 4,
    borderRadius: 2,
  },
  // Covers the whole row so any tap on the figure focuses it; draws nothing.
  amtInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    color: 'transparent',
    opacity: 0.02,
    textAlign: 'center',
  },
  presetRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  preset: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
  },
  presetText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  nameWrap: {
    marginTop: 26,
    zIndex: 10,
  },
  nameBox: {
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 7,
    paddingRight: 14,
  },
  lookChip: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookBadge: {
    position: 'absolute',
    right: -5,
    bottom: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  nameInput: {
    marginTop: 2,
    padding: 0,
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  lookPop: {
    position: 'absolute',
    top: 68,
    left: 0,
    width: 282,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    elevation: 12,
    boxShadow: '0 24px 50px rgba(0,0,0,.55)',
  },
  iconGrid: {
    width: 5 * 44 + 4 * 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  popDivider: {
    height: 1,
    marginTop: 14,
    marginBottom: 12,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    marginTop: 12,
    alignItems: 'center',
  },
  autoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  autoChipText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  autoCard: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
  },
  autoHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  autoBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoLabel: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  track: {
    width: 50,
    height: 30,
    borderRadius: 15,
  },
  knob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    boxShadow: '0 2px 6px rgba(0,0,0,.3)',
  },
  autoTitle: {
    marginTop: 12,
    fontFamily: fontFamily.serif,
    fontSize: 28,
    lineHeight: 31,
  },
  autoSub: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  confirm: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontFamily: fontFamily.bold,
    fontSize: 15.5,
  },
});

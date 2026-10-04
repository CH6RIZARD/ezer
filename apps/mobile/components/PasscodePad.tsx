// =============================================================================
// EZER — passcode keypad
//
// Presentational: dots, a 0–9 keypad, a message line. It owns only the digits
// being typed; what a submitted code MEANS (unlock, create, confirm) belongs to
// the caller. Paints no background of its own, so it sits on onboarding's
// gradient and on LockGate's themed sheet alike.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily } from '../theme/type';
import type { ThemeTokens } from '../theme/tokens';
import { PASSCODE_MAX, PASSCODE_MIN } from '../utils/passcodeCore';

export type PadPalette = Pick<ThemeTokens, 'ink' | 'mut' | 'gold' | 'line' | 'card' | 'red'>;

export interface PasscodePadProps {
  palette: PadPalette;
  title: string;
  subtitle?: string;
  /** Unlock: the code's exact length, submitted as soon as it is reached.
   *  Omitted: choosing a new code — 4 to 6 digits, with a Continue button. */
  length?: number;
  /** Resolve false to reject the code: the dots shake and clear. */
  onSubmit: (code: string) => Promise<boolean>;
  message?: string | null;
  messageTone?: 'error' | 'info';
  disabled?: boolean;
  footer?: React.ReactNode;
  /** Shown above the title — LockGate puts the wordmark here. */
  header?: React.ReactNode;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

const tap = () => {
  if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export function PasscodePad({
  palette: P, title, subtitle, length, onSubmit, message, messageTone = 'error', disabled, footer, header,
}: PasscodePadProps) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const max = length ?? PASSCODE_MAX;
  const locked = disabled || busy;

  const submit = async (value: string) => {
    setBusy(true);
    let ok = false;
    try {
      ok = await onSubmit(value);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (ok) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence(
      [10, -10, 8, -8, 4, 0].map(toValue =>
        Animated.timing(shake, { toValue, duration: 45, useNativeDriver: true })
      )
    ).start();
    setCode('');
  };

  // Auto-submit at the exact length (unlock) or at the maximum (choosing).
  useEffect(() => {
    if (code.length === max && !busy) void submit(code);
    // submit is recreated each render; code/max are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, max]);

  const press = (k: (typeof KEYS)[number]) => {
    if (locked || k === '') return;
    tap();
    if (k === 'del') setCode(c => c.slice(0, -1));
    else setCode(c => (c.length < max ? c + k : c));
  };

  const canContinue = length === undefined && code.length >= PASSCODE_MIN && code.length < PASSCODE_MAX;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.top}>
        {header}
        <Text style={[styles.title, { color: P.ink }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: P.mut }]}>{subtitle}</Text> : null}

        <Animated.View
          style={[styles.dots, { transform: [{ translateX: shake }] }]}
          accessible
          accessibilityLabel={`${code.length} of ${length ?? `${PASSCODE_MIN} to ${PASSCODE_MAX}`} digits entered`}
        >
          {Array.from({ length: max }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { borderColor: i < PASSCODE_MIN || length ? P.gold : P.line },
                i < code.length && { backgroundColor: P.gold, borderColor: P.gold },
              ]}
            />
          ))}
        </Animated.View>

        <Text
          style={[styles.message, { color: messageTone === 'error' ? P.red : P.mut }]}
          accessibilityLiveRegion="polite"
        >
          {message ?? ' '}
        </Text>
      </View>

      <View style={styles.grid}>
        {KEYS.map((k, i) => (
          <View key={i} style={styles.cell}>
            {k === '' ? (
              canContinue ? (
                <Pressable
                  onPress={() => void submit(code)}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  style={styles.key}
                >
                  <Ionicons name="arrow-forward" size={26} color={P.gold} />
                </Pressable>
              ) : null
            ) : (
              <Pressable
                onPress={() => press(k)}
                disabled={locked}
                accessibilityRole="button"
                accessibilityLabel={k === 'del' ? 'Delete' : k}
                style={({ pressed }) => [
                  styles.key,
                  k !== 'del' && { backgroundColor: P.card, borderColor: P.line, borderWidth: 1 },
                  pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] },
                  locked && { opacity: 0.4 },
                ]}
              >
                {k === 'del' ? (
                  <Ionicons name="backspace-outline" size={26} color={P.mut} />
                ) : (
                  <Text style={[styles.digit, { color: P.ink }]}>{k}</Text>
                )}
              </Pressable>
            )}
          </View>
        ))}
      </View>

      <View style={styles.footer}>{footer}</View>
    </View>
  );
}

const KEY = 74;

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  top: { alignItems: 'center', gap: 10 },
  title: { fontFamily: fontFamily.semibold, fontSize: 22, textAlign: 'center' },
  subtitle: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  dots: { flexDirection: 'row', gap: 16, marginTop: 22, height: 16 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  message: { fontFamily: fontFamily.medium, fontSize: 13, minHeight: 18, textAlign: 'center', marginTop: 4 },
  // Three cells a row: each key plus 28px of gutter, so the row is 306 wide.
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', width: (KEY + 28) * 3 },
  cell: { width: KEY + 28, height: KEY + 14, alignItems: 'center', justifyContent: 'center' },
  key: { width: KEY, height: KEY, borderRadius: KEY / 2, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: fontFamily.medium, fontSize: 28 },
  footer: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});

export default PasscodePad;

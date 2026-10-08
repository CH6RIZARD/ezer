// =============================================================================
// In-app replacement for the OS alert dialog.
//
// Every `Alert.alert` in the app (utils/appAlert.ts) lands here:
//   · no buttons / one button  → a notice card at the top, in the app's own
//     type and colours, dismissed by a tap or after a few seconds
//   · two or more buttons       → a bottom sheet with the choices, the same
//     shape as the "Cut it" sheet; `destructive` buttons fill red, `cancel`
//     is the outline
//
// Rendered inside its own transparent Modal so it sits above everything,
// including the passcode lock (also a Modal on Android): a Modal presented
// later is on top. Mounted once in app/_layout.tsx.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { fontFamily, radius } from '../theme/type';
import { subscribeAlerts, type AppAlert } from '../utils/appAlert';

const NOTICE_MS = 5000;
const BAD = /fail|could not|couldn|can't|cannot|error|invalid|wrong|denied|unable|not available|too many/i;

export default function AppAlertHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<AppAlert[]>([]);
  const current = queue[0];
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => subscribeAlerts(a => setQueue(q => [...q, a])), []);

  const dismiss = (a: AppAlert, pressed?: AppAlert['buttons'][number]) => {
    setQueue(q => q.filter(x => x.id !== a.id));
    pressed?.onPress?.();
  };

  const isNotice = !!current && current.buttons.length <= 1;

  // Notice: slide in from the top, auto-dismiss.
  useEffect(() => {
    if (!current || !isNotice) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const t = setTimeout(() => dismiss(current, current.buttons[0]), NOTICE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;
  const bad = BAD.test(current.title) || BAD.test(current.message ?? '');

  if (isNotice) {
    return (
      <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => dismiss(current)}>
        <View style={styles.fill} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.notice,
              {
                top: insets.top + 10,
                backgroundColor: colors.card,
                borderColor: bad ? colors.red : colors.line,
                transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
                opacity: slide,
              },
            ]}
          >
            <Pressable onPress={() => dismiss(current, current.buttons[0])} style={styles.noticeRow}>
              <Ionicons
                name={bad ? 'alert-circle' : 'information-circle'}
                size={22}
                color={bad ? colors.red : colors.accInk}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.title, { color: colors.ink }]}>{current.title}</Text>
                {current.message ? (
                  <Text style={[styles.message, { color: colors.mut }]}>{current.message}</Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  const cancel = current.buttons.find(b => b.style === 'cancel');
  const actions = current.buttons.filter(b => b.style !== 'cancel');
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => dismiss(current, cancel)}>
      <Pressable style={styles.scrim} onPress={() => dismiss(current, cancel)} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.line, paddingBottom: insets.bottom + 20 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>{current.title}</Text>
          {current.message ? (
            <Text style={[styles.sheetMessage, { color: colors.mut }]}>{current.message}</Text>
          ) : null}
          <View style={styles.buttons}>
            {cancel ? (
              <Pressable onPress={() => dismiss(current, cancel)} style={[styles.btn, styles.btnOutline, { borderColor: colors.line2 }]}>
                <Text style={[styles.btnText, { color: colors.ink }]}>{cancel.text}</Text>
              </Pressable>
            ) : null}
            {actions.map(b => (
              <Pressable
                key={b.text}
                onPress={() => dismiss(current, b)}
                style={[styles.btn, { backgroundColor: b.style === 'destructive' ? colors.red : colors.accent, flex: 1.3 }]}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF' }]}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: radius.card,
    borderWidth: 1,
    padding: 14,
  },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: fontFamily.bold, fontSize: 15 },
  message: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, marginTop: 3 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: 18 },
  sheetMessage: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 18 },
  btn: { flex: 1, height: 50, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1 },
  btnText: { fontFamily: fontFamily.bold, fontSize: 15 },
});

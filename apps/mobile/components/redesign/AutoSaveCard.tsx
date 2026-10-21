// =============================================================================
// EZER Redesign — Automatic saving card ("Goal 1a" handoff)
//
// The purple AUTOMATIC SAVING card with its toggle: the whole card is the
// switch. ONE component for the goal sheet (GoalFormSheet) and the goal screen
// (GoalDetail), so the two can never drift. The caller owns the state and the
// body copy; the title is always "Save automatically". An optional footer sits
// under a hairline inside the card (the goal screen's "Paid in so far").
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, motion } from '../../theme/type';

const EASE = Easing.bezier(...motion.easeOut);

export default function AutoSaveCard({
  on,
  onToggle,
  body,
  footer,
  style,
}: {
  on: boolean;
  onToggle: () => void;
  body: string;
  footer?: React.ReactNode;
  /** Lands on the Pressable: margins, a busy dim. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useTheme();

  // Toggle knob: native-driven slide, easeOut.
  const knob = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(knob, { toValue: on ? 1 : 0, duration: 220, easing: EASE, useNativeDriver: true }).start();
  }, [on, knob]);

  return (
    // No accessibilityLabel: a screen reader reads the card's own text (body,
    // footer figures), then the switch state.
    <Pressable
      onPress={onToggle}
      style={style}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
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
          {/* Off on Light: white at 12% vanishes into the cream bg2, so line2. */}
          <View
            style={[
              styles.track,
              { backgroundColor: on ? colors.accInk : isDark ? 'rgba(255,255,255,.12)' : colors.line2 },
            ]}
          >
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
        <Text style={[styles.autoSub, { color: on ? 'rgba(255,255,255,.8)' : colors.mut }]}>{body}</Text>
        {footer != null && (
          <View style={[styles.footer, { borderTopColor: on ? 'rgba(255,255,255,.16)' : colors.line }]}>
            {footer}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  footer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 3,
  },
});

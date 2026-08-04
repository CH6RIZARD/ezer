// =============================================================================
// EZER Redesign — shared primitives
//
// Small building blocks every redesigned screen uses, so the handoff's spacing,
// radii, press feedback and type scale live in ONE place instead of being
// re-typed per screen.
//
// Source of truth: "Handoff: Ezer Redesign — Full Light + Dark Patch".
// =============================================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { useTheme } from '../../utils/ThemeContext';
import { typeScale, radius, motion, layout } from '../../theme/type';

// -----------------------------------------------------------------------------
// Text helpers
// -----------------------------------------------------------------------------

type TextProps = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Shrink to fit rather than wrapping — tiles are narrow. */
  adjustsFontSizeToFit?: boolean;
  color?: string;
};

/** UPPERCASE 10–11px/700 label with tracking. */
export function Label({ children, style, color, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[typeScale.label, { color: color ?? colors.mut }, style]}>
      {children}
    </Text>
  );
}

/** Instrument Serif Italic display numeral. */
export function Serif({ children, style, color, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[typeScale.statValue, { color: color ?? colors.ink }, style]}>
      {children}
    </Text>
  );
}

/** Section header, 16–17px/700. */
export function SectionHeader({ children, style, color, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[typeScale.sectionHeader, { color: color ?? colors.ink }, style]}>
      {children}
    </Text>
  );
}

/** Body copy, 12–13px. */
export function Body({ children, style, color, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <Text {...rest} style={[typeScale.body, { color: color ?? colors.mut }, style]}>
      {children}
    </Text>
  );
}

/** EZER wordmark — 15px/700, 2.5 tracking, gold. */
export function Wordmark({ style }: { style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Text style={[typeScale.wordmark, { color: colors.gold }, style]}>EZER</Text>;
}

// -----------------------------------------------------------------------------
// Surfaces
// -----------------------------------------------------------------------------

/** Standard card surface: `card` bg, `line` border, r18. */
export function Surface({
  children,
  style,
  radius: r = radius.card,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.line,
          borderWidth: 1,
          borderRadius: r,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Pressable that scales on press (.93–.98 over 150ms per the handoff).
 * Uses the native driver so the feedback stays smooth during list scrolling.
 */
export function PressScale({
  children,
  onPress,
  style,
  scaleTo = motion.pressScale,
  disabled,
  hitSlop = 0,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: motion.press,
      useNativeDriver: true,
    }).start();

  // The layout style MUST land on the Pressable, not the inner Animated.View.
  // Putting `width: '48%'` on the inner view sized it against a Pressable that
  // had itself collapsed to its content width — which is what squeezed the
  // dashboard stat tiles and calendar cells into one-letter-per-line columns.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      style={style}
    >
      {/* alignSelf stretches across the cross axis (width); flexGrow fills the
          main axis (height). Without flexGrow a tile whose Pressable has a
          minHeight renders shorter than its neighbour, which is why the
          bottom-right grid box came out smaller than the bottom-left one. */}
      <Animated.View style={{ transform: [{ scale }], alignSelf: 'stretch', flexGrow: 1 }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Pill chip. Used for range selectors, trial/renewal tags, status chips. */
export function Chip({
  label,
  active,
  tone = 'neutral',
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  tone?: 'neutral' | 'gold' | 'red' | 'accent';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();

  const toneMap = {
    neutral: { bg: colors.card, fg: colors.ink, border: colors.line },
    gold: { bg: colors.goldSoft, fg: colors.gold, border: colors.goldLine },
    red: { bg: colors.red + '1F', fg: colors.red, border: colors.red + '40' },
    accent: { bg: colors.accSoft, fg: colors.accInk, border: 'transparent' },
  } as const;

  // Active range chips invert to a solid gold fill with white text.
  const c = active
    ? { bg: colors.goldBg, fg: '#FFFFFF', border: colors.goldBg }
    : toneMap[tone];

  const body = (
    <View
      style={[
        styles.chip,
        { backgroundColor: c.bg, borderColor: c.border },
        style,
      ]}
    >
      <Text style={[typeScale.labelSm, { color: c.fg }]}>{label}</Text>
    </View>
  );

  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} scaleTo={0.95}>
      {body}
    </PressScale>
  );
}

/**
 * Gold pulse ring — a 0→9px shadow that fades on a 2–2.6s loop.
 * React Native cannot animate shadowRadius on the native driver, so this
 * renders an absolutely-positioned ring whose opacity and scale animate
 * instead. Visually equivalent, and it stays on the native driver.
 */
export function PulseRing({ radius: r = radius.card }: { radius?: number }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: motion.pulse,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: r,
          borderWidth: 2,
          borderColor: colors.goldLine,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [
            { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
          ],
        },
      ]}
    />
  );
}

/** Screen wrapper: fade + rise entrance, 20px gutters, tab-bar clearance. */
export function ScreenBody({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: motion.screenIn,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
  },
});

export { radius, typeScale, layout, motion };

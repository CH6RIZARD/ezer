// =============================================================================
// EZER Redesign — shared primitives
//
// Small building blocks every redesigned screen uses, so the handoff's spacing,
// radii, press feedback and type scale live in ONE place instead of being
// re-typed per screen.
//
// Source of truth: "Handoff: Ezer Redesign — Full Light + Dark Patch".
// =============================================================================

import React, { useContext, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type TextStyle,
  type StyleProp,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DoveMark } from '../DoveReveal';
import { LockOpenContext } from '../LockGate';
import { useCameraDoveOut } from '../CameraDove';
import { useTheme } from '../../utils/ThemeContext';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { typeScale, radius, motion, layout } from '../../theme/type';
import { darkTokens } from '../../theme/tokens';

const EASE_OUT = Easing.bezier(...motion.easeOut);

/**
 * The OS "Reduce motion" setting, live. Reduced means fewer and gentler, not
 * none: keep fades that explain a change, drop travel, scale and idle loops.
 */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => alive && setReduced(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

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

/** The EZER at the top right of every tab (the lock screen's Cinzel mark with
 *  the perched dove). ONE size and ONE place on every tab, at the owner's
 *  request ("hard locked in placement and size whenever it's on the screen";
 *  he picked 56 dp, word on the right margin, Oct 12 2026). Absolute, so it
 *  ignores each screen's padding: render it as a direct child of the tab's
 *  ScrollView, after ScreenBody (it scrolls with the page, never fades or rises
 *  with it). TAB_MARK_TOP puts EZER's floor on the baseline of a screenTitle
 *  whose box starts at insets.top + 10 (Wallet, Pay in 4, Savings, Alerts),
 *  measured on the k62. */
export const TAB_MARK_W = 56;
const TAB_MARK_TOP = 26;
export function TabMark() {
  const insets = useSafeAreaInsets();
  // No perched dove while the lock is up: P1 flies into the camera WHILE the
  // lock lifts and this tab shows through, and the owner saw two doves at once
  // (Oct 13 2026). Exactly one dove on screen: this one appears once P1 is in
  // the camera and the lock is open.
  const lockOpen = useContext(LockOpenContext);
  // Nor while the camera dove is out: it is this dove, off its perch.
  const doveOut = useCameraDoveOut();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + TAB_MARK_TOP, right: layout.screenX }}>
      <DoveMark width={TAB_MARK_W} perched={lockOpen && !doveOut} />
    </View>
  );
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
 * Runs on the UI thread (Reanimated) so the feedback stays smooth during list scrolling.
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
  // Reanimated: the scale runs on the UI thread, so press feedback stays
  // immediate even while JS is busy rendering the tap's result.
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const to = (v: number) => scale.set(withTiming(v, { duration: motion.press, easing: EASE_OUT }));

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
      <Animated.View style={[{ alignSelf: 'stretch', flexGrow: 1 }, scaleStyle]}>
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
 * shadowRadius is not cheap to animate, so this
 * renders an absolutely-positioned ring whose opacity and scale animate
 * instead. Visually equivalent, and it stays on the UI thread.
 */
export function PulseRing({ radius: r = radius.card }: { radius?: number }) {
  const { colors } = useTheme();
  const pulse = useSharedValue(0);
  const reduced = useReduceMotion();
  // Hidden tabs stay mounted; don't pulse on one nobody can see (see the
  // float note in SpinCard).
  const focused = useIsFocused();

  useEffect(() => {
    if (reduced || !focused) return; // a static ring at full strength still marks it
    // Three pulses each time the screen comes into view, then it rests at
    // t=1 (ring faded out). An endless loop kept the k62 redrawing Home at
    // ~50 frames a second with nothing else moving.
    pulse.set(0);
    pulse.set(withRepeat(withTiming(1, { duration: motion.pulse, easing: Easing.linear }), 3, false));
    return () => cancelAnimation(pulse);
  }, [pulse, reduced, focused]);

  const ringStyle = useAnimatedStyle(() => {
    const t = pulse.get();
    return { opacity: 0.55 * (1 - t), transform: [{ scale: 1 + 0.06 * t }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderRadius: r,
          borderWidth: 2,
          borderColor: colors.goldLine,
        },
        ringStyle,
      ]}
    />
  );
}

/**
 * Skeleton screens (owner, Oct 14 2026): while a page's content loads it shows
 * shapes in the theme's line colour in the layout of what is coming, next to the camera dove
 * (the dove says "loading", the shapes keep the page's structure so nothing
 * jumps when the data lands). One slow breathing pulse; Reduced Motion: still.
 */
export function Skeleton({ w = '100%', h = 14, r = 8, style, color }: {
  w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle>;
  /** Over a coloured card (Savings' purple Autopilot) the line colour vanishes; pass one. */
  color?: string;
}) {
  const { colors, mode } = useTheme();
  const reduced = useReduceMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(pulse);
  }, [pulse, reduced]);
  const a = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * pulse.get() }));
  // The app's own line colour, not a neutral grey (black theme: EZER's purple line, its own is near-grey) (owner, Oct 14 2026: "shouldn't be grey, use the app hexes").
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: color ?? (mode === 'black' ? darkTokens.line : colors.line) }, a, style]} />;
}

/**
 * True once `on` has been true for `ms` (300, the same grace the camera dove
 * gives a wait): skeletons for a refresh the user asked for, without flashing
 * them over data for a wait that was over before anyone could read them.
 */
export function useSlow(on: boolean, ms = 300): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!on) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return slow;
}

/** `count` list rows: a round mark, a title line and a shorter detail line, an amount on the right. */
export function SkeletonRows({ count = 4, card = true }: { count?: number; card?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }, (_, i) => {
        const row = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: card ? 14 : 0, paddingVertical: card ? 14 : 8 }}>
            <Skeleton w={36} h={36} r={18} />
            <View style={{ flex: 1, gap: 7 }}>
              <Skeleton w={`${60 - (i % 3) * 12}%`} h={12} />
              <Skeleton w={`${35 - (i % 2) * 8}%`} h={10} />
            </View>
            <Skeleton w={52} h={14} />
          </View>
        );
        return card ? <Surface key={i}>{row}</Surface> : <View key={i}>{row}</View>;
      })}
    </View>
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
  const anim = useSharedValue(0);
  const reduced = useReduceMotion();

  useEffect(() => {
    anim.set(withTiming(1, { duration: motion.screenIn, easing: EASE_OUT }));
  }, [anim]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: anim.get(),
    transform: [{ translateY: (reduced ? 0 : 14) * (1 - anim.get()) }],
  }));

  return (
    <Animated.View
      style={[enterStyle, style]}
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

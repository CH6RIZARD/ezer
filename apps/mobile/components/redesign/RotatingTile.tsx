// =============================================================================
// EZER — bottom-left dashboard tile: two features on one rotation
//
// Holds two CTAs that cycle so both get eye time:
//   1. "Get your physical card" — card-taps-NFC-terminal animation as the icon
//   2. "Top ticket" — the three costliest subscriptions, real logos
//
// Behaviour:
//   * auto-advances on a dwell timer long enough to actually read the card
//   * left/right arrows let the user drive it themselves
//   * ANY arrow press stops the auto-rotation; it only resumes after a period
//     of arrow inactivity (RESUME_AFTER_MS), and that countdown restarts on
//     every single press
//   * tapping the body opens that feature's own full screen
//
// Layout note: the arrows and dots live in their own row BELOW the content, so
// the slide gets the tile's full width. Nothing is squeezed between the arrows.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { radius } from '../../theme/type';

/**
 * How long each feature sits on screen before auto-advancing. 6.5s is long
 * enough to read three merchant marks plus a price without feeling stuck.
 */
const DWELL_MS = 6500;
/** Idle time after the last arrow press before auto-rotation resumes (spec: 8-10s). */
const RESUME_AFTER_MS = 9000;
/** Total cross-fade: half out, half in. */
const FADE_MS = 300;

/**
 * 24px chip + 11px slop on every side = 46px target (design system min 44).
 * The chip stays small so it reads as chrome; the slop makes it easy to hit.
 */
const ARROW_SIZE = 24;
const ARROW_HIT = { top: 11, bottom: 11, left: 11, right: 11 };

export interface RotatingSlide {
  key: string;
  /** Rendered inside the tile. */
  render: () => React.ReactNode;
  onPress?: () => void;
}

export function RotatingTile({
  slides,
  style,
}: {
  slides: RotatingSlide[];
  style?: any;
}) {
  const { colors } = useTheme();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  /** True while a cross-fade is in flight — stops two fades overlapping. */
  const animating = useRef(false);

  // Guard against a slides array that shrinks underneath us.
  const count = slides.length;
  const index = count > 0 ? Math.min(i, count - 1) : 0;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resumeTimer.current) {
        clearTimeout(resumeTimer.current);
        resumeTimer.current = null;
      }
      // Never leave the value stranded mid-fade: stop the driver and restore
      // full opacity, so a re-mount / re-use can't render an invisible tile.
      fade.stopAnimation(() => fade.setValue(1));
      fade.setValue(1);
    };
  }, [fade]);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      // A press (or a stray interval tick) landing mid-transition is dropped
      // rather than stacking a second animation on the same value.
      if (animating.current) return;
      animating.current = true;

      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_MS / 2,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!mounted.current) return;
        if (!finished) {
          // Interrupted: bail out without swapping slides, and make sure the
          // tile is visible again rather than stuck at opacity 0.
          animating.current = false;
          fade.setValue(1);
          return;
        }
        setI(prev => (prev + dir + count) % count);
        Animated.timing(fade, {
          toValue: 1,
          duration: FADE_MS / 2,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(({ finished: settled }) => {
          animating.current = false;
          if (mounted.current && !settled) fade.setValue(1);
        });
      });
    },
    [fade, count]
  );

  // Auto-rotation. Disabled entirely while `paused`.
  useEffect(() => {
    if (paused || count < 2) return;
    const t = setInterval(() => go(1), DWELL_MS);
    return () => clearInterval(t);
  }, [paused, go, count]);

  /**
   * Manual arrow. Pauses first so the interval effect tears down before the
   * fade runs, then restarts the resume countdown from zero — every press,
   * including presses that arrive while a fade is still finishing.
   */
  const manual = useCallback(
    (dir: 1 | -1) => {
      setPaused(true);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
      resumeTimer.current = setTimeout(() => {
        if (mounted.current) setPaused(false);
      }, RESUME_AFTER_MS);
      go(dir);
    },
    [go]
  );

  /** Touching an arrow at all halts the rotation, before the press resolves. */
  const holdRotation = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const slide = slides[index];

  const arrowStyle = useMemo(
    () => [styles.arrow, { backgroundColor: colors.accSoft, borderColor: colors.line2 }],
    [colors.accSoft, colors.line2]
  );

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: colors.line },
        style,
      ]}
    >
      <Pressable onPress={slide?.onPress} style={styles.body}>
        <Animated.View style={[styles.bodyInner, { opacity: fade }]}>
          {slide?.render()}
        </Animated.View>
      </Pressable>

      {count > 1 && (
        <View style={styles.controls}>
          <Pressable
            onPressIn={holdRotation}
            onPress={() => manual(-1)}
            hitSlop={ARROW_HIT}
            accessibilityRole="button"
            accessibilityLabel="Previous"
            style={({ pressed }) => [...arrowStyle, pressed && styles.arrowPressed]}
          >
            <Ionicons name="chevron-back" size={14} color={colors.accInk} />
          </Pressable>

          <View style={styles.dots}>
            {slides.map((s, idx) => (
              <View
                key={s.key}
                style={[
                  styles.dot,
                  {
                    backgroundColor: idx === index ? colors.accInk : colors.line2,
                    width: idx === index ? 12 : 5,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable
            onPressIn={holdRotation}
            onPress={() => manual(1)}
            hitSlop={ARROW_HIT}
            accessibilityRole="button"
            accessibilityLabel="Next"
            style={({ pressed }) => [...arrowStyle, pressed && styles.arrowPressed]}
          >
            <Ionicons name="chevron-forward" size={14} color={colors.accInk} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1,
    borderRadius: radius.card,
    // Lean chrome: the tile has to hold content + an arrow row inside the same
    // 132px cell the three static tiles occupy, so every pixel here is content
    // the slide does not get.
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 6,
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    // Content must be free to shrink so a large font scale never clips it.
    minHeight: 0,
  },
  bodyInner: {
    flex: 1,
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  arrow: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
    borderRadius: ARROW_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: {
    opacity: 0.6,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
});

export default RotatingTile;

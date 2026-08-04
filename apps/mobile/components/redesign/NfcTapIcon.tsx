// =============================================================================
// EZER — "card taps an NFC terminal" icon animation
//
// A card nudges toward a phone terminal and three contactless arcs fan out from
// it in sequence, then everything retreats and repeats.
//
// Deliberately built from Views + Ionicons rather than a Lottie file: no new
// dependency, no asset to ship, and it stays on the native driver.
//
// LAYOUT. The three elements sit in fixed, non-overlapping zones — card on the
// left, arcs in the middle gap, phone pinned right — and the card animates only
// within its own zone. The earlier version centred a flex row and slid the card
// to `-size * 0.05`, which parked it on top of the terminal glyph; the arcs
// then rendered underneath the card and read as a stray gold wedge rather than
// as a signal.
//
// The arcs are drawn with the border trick (a circle whose only coloured edge
// is `borderRightColor`) instead of a rotated `wifi` glyph. `wifi` is a
// three-band symbol with its own baseline padding, so rotating it -90° left the
// arcs visually off-centre from the card no matter where the box was placed.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';

/** When each arc lights up, as a fraction of the approach. Outermost last. */
const ARC_STEPS = [0.5, 0.66, 0.82] as const;

export function NfcTapIcon({ size = 34 }: { size?: number }) {
  const { colors } = useTheme();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        // approach
        Animated.timing(t, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        // hold at the terminal while the arcs sit lit
        Animated.delay(500),
        // retreat
        Animated.timing(t, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(350),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      // Leave the value at rest so a re-mounted icon starts from the beginning
      // rather than from wherever the loop happened to be cut off.
      t.setValue(0);
    };
  }, [t]);

  // Geometry. Every number is a fraction of `size` so the icon scales cleanly.
  const W = size * 1.62;
  const cardSize = size * 0.62;
  const phoneSize = size * 0.86;
  const arcBox = size * 0.62;
  /** Centre of the arc fan — the gap between the card and the phone. */
  const arcCenterX = size * 0.72;

  // The card travels a short hop and stops well clear of the phone.
  const cardX = t.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.16] });

  return (
    <View style={[styles.wrap, { width: W, height: size }]}>
      {/* terminal — pinned right, never moves */}
      <View style={[styles.layer, { right: 0 }]}>
        <Ionicons name="phone-portrait-outline" size={phoneSize} color={colors.mut} />
      </View>

      {/* contactless arcs */}
      <View
        style={[
          styles.arcBox,
          { left: arcCenterX - arcBox / 2, width: arcBox, height: arcBox },
        ]}
        pointerEvents="none"
      >
        {ARC_STEPS.map((step, i) => {
          // Concentric: each arc is one third wider than the one inside it.
          const d = arcBox * (0.36 + i * 0.32);
          const opacity = t.interpolate({
            inputRange: [0, step, Math.min(1, step + 0.14)],
            outputRange: [0, 0, 1],
          });
          return (
            <Animated.View
              key={step}
              style={[
                styles.arc,
                {
                  width: d,
                  height: d,
                  borderRadius: d / 2,
                  borderWidth: Math.max(1.4, size * 0.055),
                  borderRightColor: colors.gold,
                  opacity,
                },
              ]}
            />
          );
        })}
      </View>

      {/* the card — animates inside its own zone on the left */}
      <Animated.View style={[styles.layer, { left: 0, transform: [{ translateX: cardX }] }]}>
        <Ionicons name="card" size={cardSize} color={colors.accInk} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    justifyContent: 'center',
  },
  /** Vertically centred layer, positioned by an inline left/right. */
  layer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  arcBox: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arc: {
    position: 'absolute',
    // Only the right edge is coloured, which renders the visible 90° arc.
    // The other three must be explicitly transparent, not omitted — an
    // uncoloured border still defaults to black on Android.
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
});

export default NfcTapIcon;

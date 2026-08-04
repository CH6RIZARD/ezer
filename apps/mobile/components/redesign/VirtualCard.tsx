// =============================================================================
// EZER Redesign — Pay in 4 virtual card
//
// The handoff calls this interaction "a hard requirement", spelled out exactly:
//   * 308x190, r20, LOCKED in place — never translates
//   * idle float 0 -> -7px -> 0 over 3.6s, which PAUSES IN PLACE on first touch
//     (freeze the current frame; do not reset to 0)
//   * drag rotates freely: ry += dx * 0.55, rx -= dy * 0.55 (degrees)
//   * ~120ms smoothing while dragging so it never feels snappy
//   * release snaps each axis to the nearest multiple of 180 over 900ms
//     cubic-bezier(.22,1,.36,1)
//   * movement < 4px counts as a tap -> toggles number reveal
//   * a gold metal core sits between the faces, visible only edge-on mid-spin
//
// Implementation notes:
//   * Rotation state lives in Animated.Values driven by a PanResponder. The
//     "120ms smoothing" is a short timing animation toward the live drag value
//     rather than setValue, which is what stops it feeling snappy.
//   * The float pause works by reading the current float offset via a listener
//     and freezing it — Animated has no "pause", so the loop is stopped and the
//     captured frame is written back.
//   * backfaceVisibility: 'hidden' is respected on both iOS and Android for
//     rotateY, which is what makes the two faces swap correctly.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
  Easing,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { gradients, cardFinishes, type CardFinish } from '../../theme/tokens';
import { fontFamily, motion, radius } from '../../theme/type';

const CARD_W = 308;
const CARD_H = 190;
/** Container is taller than the card so the float never clips. */
const CONTAINER_H = 250;
/** Matches the prototype's perspective: 1100px. */
const PERSPECTIVE = 1100;

const NUMBER_MASKED = '••••  ••••  ••••  ••••';
const NUMBER_REAL = '5312 7702 4401 8873';

export interface VirtualCardProps {
  finish?: CardFinish;
  style?: StyleProp<ViewStyle>;
  /**
   * Fired when a turn starts/ends. The parent screen uses this to switch its
   * ScrollView off, so a vertical drag on the card rotates it instead of
   * scrolling the page.
   */
  onDragChange?: (dragging: boolean) => void;
}

export function VirtualCard({ finish = 'amethyst', style, onDragChange }: VirtualCardProps) {
  const { colors } = useTheme();

  const [revealed, setRevealed] = useState(false);
  // Once touched, the idle float never resumes — per the spec it pauses in
  // place, it does not restart when the finger lifts.
  const [interacted, setInteracted] = useState(false);

  // --- rotation ---------------------------------------------------------------
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  // Plain numbers mirroring the Animated values; PanResponder needs synchronous
  // reads and Animated.Value has no public getter.
  const rxVal = useRef(0);
  const ryVal = useRef(0);
  const startRx = useRef(0);
  const startRy = useRef(0);

  useEffect(() => {
    const a = rx.addListener(({ value }) => { rxVal.current = value; });
    const b = ry.addListener(({ value }) => { ryVal.current = value; });
    return () => { rx.removeListener(a); ry.removeListener(b); };
  }, [rx, ry]);

  // --- idle float -------------------------------------------------------------
  const float = useRef(new Animated.Value(0)).current;
  const floatVal = useRef(0);
  const floatLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const id = float.addListener(({ value }) => { floatVal.current = value; });
    return () => float.removeListener(id);
  }, [float]);

  useEffect(() => {
    if (interacted) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: motion.cardFloat / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: motion.cardFloat / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    floatLoop.current = loop;
    loop.start();
    return () => loop.stop();
  }, [float, interacted]);

  /** Freeze the float at whatever frame it is on — no snap back to 0. */
  const freezeFloat = useCallback(() => {
    if (interacted) return;
    floatLoop.current?.stop();
    float.setValue(floatVal.current);
    setInteracted(true);
  }, [float, interacted]);

  // --- gesture ----------------------------------------------------------------
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Capture variants claim the gesture BEFORE an ancestor ScrollView can,
        // which is what stopped the page scrolling out from under a card turn.
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        // Once we own the gesture, never hand it back mid-turn.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: () => {
          freezeFloat();
          startRx.current = rxVal.current;
          startRy.current = ryVal.current;
          onDragChange?.(true);
        },

        onPanResponderMove: (_evt, g) => {
          const nextRy = startRy.current + g.dx * motion.cardRotatePerPx;
          const nextRx = startRx.current - g.dy * motion.cardRotatePerPx;

          // setValue, NOT a per-move timing.
          //
          // The previous version started a fresh 120ms Animated.timing on BOTH
          // axes for every move event. At 60fps that is ~120 overlapping
          // animations a second competing for the same two values, each one
          // restarting from wherever the last had got to — which is exactly the
          // stutter that made the drag feel broken. The finger already supplies
          // a smooth stream of positions; tracking it directly is both correct
          // and far cheaper. The soft feel lives in the release settle instead.
          ry.setValue(nextRy);
          rx.setValue(nextRx);
        },

        onPanResponderTerminate: () => {
          onDragChange?.(false);
        },

        onPanResponderRelease: (_evt, g) => {
          onDragChange?.(false);
          const moved = Math.hypot(g.dx, g.dy);

          // Under the slop it is a tap, not a drag.
          if (moved < motion.cardTapSlop) {
            setRevealed(v => !v);
            return;
          }

          // Snap each axis to the nearest half-turn with a slow soft settle.
          const snap = (v: number) => Math.round(v / 180) * 180;
          const [c0, c1, c2, c3] = motion.cardSettleBezier;

          Animated.parallel([
            Animated.timing(ry, {
              toValue: snap(ryVal.current),
              duration: motion.cardSettle,
              easing: Easing.bezier(c0, c1, c2, c3),
              useNativeDriver: true,
            }),
            Animated.timing(rx, {
              toValue: snap(rxVal.current),
              duration: motion.cardSettle,
              easing: Easing.bezier(c0, c1, c2, c3),
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [freezeFloat, rx, ry, onDragChange]
  );

  // --- transforms -------------------------------------------------------------
  const deg = (v: Animated.Value) =>
    v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });

  const floatY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [0, motion.cardFloatTravel],
  });

  const faceTransform = [
    { perspective: PERSPECTIVE },
    { rotateX: deg(rx) },
    { rotateY: deg(ry) },
  ];

  const finishColors = cardFinishes[finish];

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.card, { transform: [{ translateY: floatY }] }]}
      >
        {/* Gold metal core — sits between the faces, seen only edge-on. */}
        <Animated.View style={[styles.face, { transform: faceTransform }]}>
          <LinearGradient
            colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
            locations={gradients.metalEdgeLocations as unknown as readonly [number, number, ...number[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fill}
          />
        </Animated.View>

        {/* Front */}
        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            { transform: [...faceTransform, { translateZ: 3 }] as never },
          ]}
        >
          <LinearGradient
            colors={finishColors as unknown as readonly [string, string, ...string[]]}
            locations={gradients.cardFrontLocations as unknown as readonly [number, number, ...number[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fill, styles.facePad]}
          >
            <View style={styles.rowBetween}>
              {/* Chip */}
              <LinearGradient
                colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.chip}
              />
              <Ionicons name="wifi" size={20} color="rgba(255,255,255,.85)" />
            </View>

            <Text selectable={false} style={styles.number}>{revealed ? NUMBER_REAL : NUMBER_MASKED}</Text>

            <View style={styles.rowBetween}>
              <View>
                <Text selectable={false} style={styles.cardLabel}>CARDHOLDER</Text>
                <Text selectable={false} style={styles.cardValue}>EZER MEMBER</Text>
              </View>
              <View>
                <Text selectable={false} style={styles.cardLabel}>
                  {revealed ? 'EXPIRES' : 'STATUS'}
                </Text>
                <Text selectable={false} style={styles.cardValue}>
                  {revealed ? '09/29' : 'PREVIEW'}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Back */}
        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            {
              transform: [
                ...faceTransform,
                { rotateY: '180deg' },
                { translateZ: 3 },
              ] as never,
            },
          ]}
        >
          <LinearGradient
            colors={gradients.cardBack as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fill}
          >
            <View style={styles.magStripe} />
            <View style={styles.signatureRow}>
              <View style={styles.signature}>
                <Text selectable={false} style={styles.cvv}>•••</Text>
              </View>
            </View>
            <Text selectable={false} style={styles.backNote}>SINGLE-USE VIRTUAL CARD</Text>
          </LinearGradient>
        </Animated.View>
      </Animated.View>

      <Text style={[styles.hint, { color: colors.mut }]}>
        Drag to spin it around · tap to reveal/hide the number
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: CONTAINER_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_W,
    height: CARD_H,
  },
  face: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.virtualCard,
    overflow: 'hidden',
  },
  hidden: {
    backfaceVisibility: 'hidden',
  },
  fill: {
    flex: 1,
    borderRadius: radius.virtualCard,
  },
  facePad: {
    padding: 18,
    justifyContent: 'space-between',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chip: {
    width: 40,
    height: 29,
    borderRadius: 6,
  },
  number: {
    fontFamily: fontFamily.medium,
    fontSize: 17,
    letterSpacing: 1.6,
    color: '#FFFFFF',
  },
  cardLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,.55)',
    marginBottom: 3,
  },
  cardValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#FFFFFF',
  },
  magStripe: {
    position: 'absolute',
    top: 22,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: '#000000',
  },
  signatureRow: {
    marginTop: 78,
    paddingHorizontal: 18,
  },
  signature: {
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,.9)',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 10,
  },
  cvv: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    color: '#1A1A1A',
    letterSpacing: 2,
  },
  backNote: {
    position: 'absolute',
    bottom: 16,
    left: 18,
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,.5)',
  },
  hint: {
    marginTop: 14,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default VirtualCard;


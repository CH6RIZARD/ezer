// =============================================================================
// EZER Redesign — free-drag spin card
//
// The physics behind the Pay in 4 virtual card, factored out so any card that
// wants the same "hard requirement" interaction — Card Studio's finished-design
// review included — gets it from one place instead of a second hand-copied
// implementation drifting out of sync with this one. VirtualCard.tsx now just
// supplies its front/back JSX and reads a tap callback; this component owns
// every pixel of the physics:
//
//   * 308x190, r20, LOCKED in place — never translates
//   * idle float 0 -> -7px -> 0 over 3.6s, which PAUSES IN PLACE on first touch
//     (freeze the current frame; do not reset to 0)
//   * drag rotates freely: ry += dx * 0.55, rx -= dy * 0.55 (degrees)
//   * release snaps each axis to the nearest multiple of 180 over 900ms
//     cubic-bezier(.22,1,.36,1)
//   * movement < 4px counts as a tap -> onTap
//   * a gold metal core sits between the faces, visible only edge-on mid-spin
//
// Rotation state lives in Animated.Values driven by a PanResponder, tracked
// with setValue on every move (see the comment at onPanResponderMove below for
// why NOT a fresh timing animation per move event). backfaceVisibility:
// 'hidden' is what makes `front`/`back` swap correctly as it turns.
//
// Move handling is throttled to one update per animation frame (see
// scheduleMove below). On native this changes nothing — the native driver was
// already running at the display's own rate. On the web export, a mouse fires
// far more pointermove events per second than 60, and this component used to
// apply a direct style write for every single one on the ONE thread the
// browser also has to use for everything else. The visible symptom was not
// mere jank but a hang right at release: the settle animation could not even
// start until the main thread had chewed through however many queued moves
// had piled up during the drag. Collapsing to one applied move per frame is
// the standard fix for that class of bug.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../utils/ThemeContext';
import { gradients } from '../../theme/tokens';
import { fontFamily, motion, radius } from '../../theme/type';

const CARD_W = 308;
const CARD_H = 190;
/** Container is taller than the card so the float never clips. */
const CONTAINER_H = 250;
/** Matches the prototype's perspective: 1100px. */
const PERSPECTIVE = 1100;

export interface SpinCardProps {
  front: React.ReactNode;
  back: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Movement under the tap slop — a drag never fires this. */
  onTap?: () => void;
  /**
   * Fired when a turn starts/ends. The parent screen uses this to switch its
   * ScrollView off, so a vertical drag on the card rotates it instead of
   * scrolling the page.
   */
  onDragChange?: (dragging: boolean) => void;
  /** "Drag to spin it around" by default — pass '' to hide the hint entirely. */
  hint?: string;
}

export function SpinCard({ front, back, style, onTap, onDragChange, hint = 'Drag to spin it around' }: SpinCardProps) {
  const { colors } = useTheme();

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

  // --- move throttle ------------------------------------------------------
  // At most one applied rotation update per animation frame, however many
  // raw pointer/touch move events actually arrived. See the header comment.
  const pendingMove = useRef<{ dx: number; dy: number } | null>(null);
  const rafId = useRef<number | null>(null);

  const applyMove = useCallback(
    (m: { dx: number; dy: number }) => {
      const nextRy = startRy.current + m.dx * motion.cardRotatePerPx;
      const nextRx = startRx.current - m.dy * motion.cardRotatePerPx;
      // setValue, NOT a per-move timing — a fresh Animated.timing per move
      // event is dozens of overlapping animations a second fighting each
      // other, which is its own, different stutter. The finger/cursor
      // already supplies a smooth stream of positions; tracking it directly
      // is both correct and far cheaper. The soft feel lives in the release
      // settle instead.
      ry.setValue(nextRy);
      rx.setValue(nextRx);
    },
    [rx, ry]
  );

  const scheduleMove = useCallback(
    (m: { dx: number; dy: number }) => {
      pendingMove.current = m;
      if (rafId.current != null) return; // a frame is already pending
      rafId.current = requestAnimationFrame(() => {
        rafId.current = null;
        if (pendingMove.current) applyMove(pendingMove.current);
      });
    },
    [applyMove]
  );

  /** Cancel any queued frame and, if one was pending, apply it right now —
   * called on release so the snap target is never one frame stale. */
  const flushMove = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    if (pendingMove.current) {
      applyMove(pendingMove.current);
      pendingMove.current = null;
    }
  }, [applyMove]);

  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

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
          pendingMove.current = null;
          if (rafId.current != null) {
            cancelAnimationFrame(rafId.current);
            rafId.current = null;
          }
          startRx.current = rxVal.current;
          startRy.current = ryVal.current;
          onDragChange?.(true);
        },

        onPanResponderMove: (_evt, g) => {
          scheduleMove({ dx: g.dx, dy: g.dy });
        },

        onPanResponderTerminate: () => {
          flushMove();
          onDragChange?.(false);
        },

        onPanResponderRelease: (_evt, g) => {
          // Apply whatever move was still queued for the next frame BEFORE
          // reading rxVal/ryVal below, or the snap target could be one frame
          // behind where the card visually stopped.
          flushMove();
          onDragChange?.(false);
          const moved = Math.hypot(g.dx, g.dy);

          // Under the slop it is a tap, not a drag.
          if (moved < motion.cardTapSlop) {
            onTap?.();
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
    [freezeFloat, scheduleMove, flushMove, rx, ry, onDragChange, onTap]
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

        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            { transform: [...faceTransform, { translateZ: 3 }] as never },
          ]}
        >
          {front}
        </Animated.View>

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
          {back}
        </Animated.View>
      </Animated.View>

      {hint ? (
        <Text style={[styles.hint, { color: colors.mut }]}>{hint}</Text>
      ) : null}
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
  hint: {
    marginTop: 14,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default SpinCard;

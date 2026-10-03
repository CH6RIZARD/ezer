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
import { View, Text, Animated, PanResponder, Platform, StyleSheet, Easing, type StyleProp, type ViewStyle } from 'react-native';
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
/**
 * How far the gold core sits inside the faces, on every side. Each face is
 * pushed 3 units along its normal (translateZ: 3), which after projection
 * offsets its silhouette from the core's by 3·sin(angle) px — so a core the
 * same size as the faces peeks out past the near face at EVERY angle: a
 * continuous 1.5px gold sliver down one side at 30° of Y-rotation, and at a
 * few degrees of X-tilt a 0.26px sub-pixel strip along the top/bottom that
 * rasterizes as a row of gold dashes. That was the "botched edges" report.
 * With an inset the core's own edge sits 4·cos(angle) px inside the face,
 * so it shows only once 3·sin(a) > 4·cos(a), i.e. past ~53° — exactly the
 * approach to edge-on where a visible gold thickness is the intent.
 *
 * That geometry is the WEB export's. On native, React Native 0.81 has no
 * `translateZ` transform at all: Android's TransformHelper.kt logs
 * "Unsupported transform type" and skips it, iOS's RCTConvert+Transform.m
 * does the same, and Fabric's conversions.h has no branch for it — only a
 * three-element `translate: [x, y, z]` carries a Z. So on a phone the two
 * faces and the core are coplanar, and a full-size core could only ever
 * show through the faces' anti-aliased edge pixels; the inset takes it out
 * from under those edges entirely, which is why the fix held on the iOS
 * screenshots too. Do not swap `translateZ` for `translate: [0, 0, 3]` to
 * "make the depth real" without looking at a device first — native would
 * honour it, and the card's edge-on look has never been seen that way.
 */
const CORE_INSET = 4;

/** How far each face sits off the core along its normal (web: translateZ). */
const FACE_DEPTH = 3;
/** Sample points for the native sin/cos lookup (15° steps; ≤0.03px error at FACE_DEPTH). */
const TRIG_DEG = Array.from({ length: 25 }, (_, i) => i * 15);

/**
 * Native has no equivalent of CSS's parent `perspective` property — every RN
 * transform, on every platform, only ever composes perspective as a function
 * inside its OWN transform array, which is why it's there on the metal core
 * and both faces below. On the web export that same per-child pattern maps to
 * CSS's `perspective()` TRANSFORM FUNCTION rather than the `perspective`
 * PROPERTY, and those are not the same thing: the function gives each of the
 * three faces its own independent 3D space instead of one shared between
 * them, and without a shared space `backfaceVisibility: hidden` has no
 * consistent "which way is this facing" to resolve against — so more than
 * one face can stay visible at once, which is what showed up as mirrored and
 * doubled text. Web gets a real shared `perspective` on the parent instead,
 * with `perspective` dropped from each child's own transform.
 */
const IS_WEB = Platform.OS === 'web';

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

  // rxVal/ryVal are kept by hand at the two places THIS code writes the
  // values (applyMove below, and the release settle's known snap target) —
  // NOT via rx.addListener/ry.addListener. A JS listener on a
  // useNativeDriver value forces every animation frame back across the
  // bridge to JS, which defeats the native driver entirely and kept the JS
  // thread busy on every frame of the settle animation.

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
      ryVal.current = nextRy;
      rxVal.current = nextRx;
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
  const floatLoop = useRef<Animated.CompositeAnimation | null>(null);

  // No float.addListener here — see the rx/ry note above. This one was the
  // worst of the three: the idle float loops from mount, this component
  // sits on a tab that stays mounted, and `interacted` is false until the
  // card is first touched — so from app launch, on every screen, the JS
  // thread was receiving ~60 bridge messages a second forever. Measured as
  // "high input latency" on 65-84% of frames app-wide on a Helio P23 device.
  // freezeFloat gets the current value from stopAnimation's callback
  // instead, which is the one-shot read this ever actually needed.

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
    // stopAnimation hands back the value the native driver is currently at —
    // the one-shot read the old per-frame listener was standing in for.
    float.stopAnimation(v => float.setValue(v));
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
          // The snap target is written into rxVal/ryVal up front: once the
          // settle finishes that IS the value, and it's the only place other
          // than applyMove that moves these — so the mirrors stay exact with
          // no per-frame listener.
          const snap = (v: number) => Math.round(v / 180) * 180;
          const [c0, c1, c2, c3] = motion.cardSettleBezier;
          ryVal.current = snap(ryVal.current);
          rxVal.current = snap(rxVal.current);

          Animated.parallel([
            Animated.timing(ry, {
              toValue: ryVal.current,
              duration: motion.cardSettle,
              easing: Easing.bezier(c0, c1, c2, c3),
              useNativeDriver: true,
            }),
            Animated.timing(rx, {
              toValue: rxVal.current,
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

  const faceTransform = IS_WEB
    ? [{ rotateX: deg(rx) }, { rotateY: deg(ry) }]
    : [{ perspective: PERSPECTIVE }, { rotateX: deg(rx) }, { rotateY: deg(ry) }];

  // Face depth. Web: a real translateZ(FACE_DEPTH) along each face's normal.
  // Native has no Z (see CORE_INSET), so the faces sat coplanar with the core
  // and the card read paper-thin on the phone while web showed its gold edge.
  // What translateZ AFTER rotateX·rotateY actually does on screen is shift the
  // face by (d·sin ry, −d·sin rx·cos ry); native reproduces exactly that as a
  // screen-space translate placed BEFORE the rotations. Built from modulo/
  // interpolate/multiply only — all native-driver nodes, so still no JS work
  // per frame (and no listeners; see the rule in CLAUDE.md). The array form
  // `translate: [0, 0, d]` is not an option: the native driver only accepts
  // numeric transform values.
  const depth = useMemo(() => {
    if (IS_WEB) return null;
    const sin = (v: Animated.Value) =>
      Animated.modulo(v, 360).interpolate({ inputRange: TRIG_DEG, outputRange: TRIG_DEG.map(d => Math.sin((d * Math.PI) / 180)) });
    const cos = (v: Animated.Value) =>
      Animated.modulo(v, 360).interpolate({ inputRange: TRIG_DEG, outputRange: TRIG_DEG.map(d => Math.cos((d * Math.PI) / 180)) });
    const dx = Animated.multiply(sin(ry), FACE_DEPTH);
    const dy = Animated.multiply(Animated.multiply(sin(rx), cos(ry)), -FACE_DEPTH);
    // Back face is rotateY(180) first, so its normal points the other way.
    return {
      front: [{ translateX: dx }, { translateY: dy }],
      back: [{ translateX: Animated.multiply(dx, -1) }, { translateY: Animated.multiply(dy, -1) }],
    };
  }, [rx, ry]);
  const withDepth = (side: 'front' | 'back', rest: object[]) =>
    IS_WEB
      ? [...faceTransform, ...rest, { translateZ: FACE_DEPTH }]
      : [faceTransform[0], ...depth![side], ...faceTransform.slice(1), ...rest];

  return (
    <View style={[styles.container, style]}>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.card,
          IS_WEB ? ({ perspective: PERSPECTIVE } as unknown as ViewStyle) : null,
          { transform: [{ translateY: floatY }] },
        ]}
      >
        {/* Gold metal core — sits between the faces, seen only edge-on.
            An earlier attempt added renderToHardwareTextureAndroid here to
            fight z-fighting/tearing at grazing angles — it made that worse,
            not better: flattening each face into a pre-rendered bitmap layer
            broke Android's backfaceVisibility culling entirely, so the FRONT
            face stayed visible (mirrored) even at rest instead of only the
            back showing. Reverted. The hairline highlights below are a
            smaller, purely additive fix for the same edge-on flatness that
            doesn't touch how the faces are composited. */}
        {/* Inset by CORE_INSET on every side (see that constant for the
            geometry) and symmetric, so its centre — and therefore its
            rotation origin — is the same point as both faces'. The two
            2px "edge highlight" strips that used to sit at the core's
            top/bottom are gone: with the core hidden until ~53° they
            could never show except as the sub-pixel peek that produced
            the dashed artifact in the first place. */}
        <Animated.View style={[styles.core, { transform: faceTransform }]}>
          <LinearGradient
            colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
            locations={gradients.metalEdgeLocations as unknown as readonly [number, number, ...number[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.fill, { borderRadius: radius.virtualCard - CORE_INSET }]}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            { transform: withDepth('front', []) as never },
          ]}
        >
          {front}
        </Animated.View>

        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            {
              transform: withDepth('back', [{ rotateY: '180deg' }]) as never,
            },
          ]}
        >
          {back}
        </Animated.View>
      </Animated.View>

      {hint ? (
        <Text selectable={false} style={[styles.hint, { color: colors.mut }]}>{hint}</Text>
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
  core: {
    position: 'absolute',
    left: CORE_INSET,
    top: CORE_INSET,
    width: CARD_W - CORE_INSET * 2,
    height: CARD_H - CORE_INSET * 2,
    // Concentric with the faces' corners, not just smaller.
    borderRadius: radius.virtualCard - CORE_INSET,
    overflow: 'hidden',
  },
  hint: {
    marginTop: 14,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default SpinCard;

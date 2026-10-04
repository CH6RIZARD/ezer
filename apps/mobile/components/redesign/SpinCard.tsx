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
//   * a solid gold side fills the gap between the faces, visible only mid-spin
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
/** How far each face sits off the card's centre plane along its normal (web: translateZ). */
const FACE_DEPTH = 3;
/**
 * The card's gold side: full-size gold sheets stacked between the faces,
 * FACE_DEPTH/4 apart. A single flat core (what this used to be) is a
 * zero-width line edge-on, so at 90° the two faces read as two separate
 * sheets with see-through between them. Stacked, the gap fills solid.
 * The stack fades in with tilt (see `edge` below): at rest and at a few
 * degrees the side is sub-pixel, and a sub-pixel gold strip rasterizes as a
 * row of dashes / a gold rim on the faces' anti-aliased edge — the old
 * "botched edges" report the inset single core used to dodge.
 */
const SIDE_DEPTHS = Array.from({ length: 7 }, (_, i) => ((i - 3) * FACE_DEPTH) / 4);
/**
 * Solid side WALLS, perpendicular to the faces, for the last few degrees
 * before edge-on. The sheet stack above is planes parallel to the faces, and
 * edge-on every plane is a hairline: on Android (no anti-aliasing on 3D-
 * transformed views) the side broke up into seven separate gold stripes with
 * see-through gaps between them, and prongs at the ends (device capture, Oct
 * 2026). A wall turned to face the viewer is one solid band there. Each fades
 * in by how squarely its side faces the viewer (|sin ry·cos rx| for the
 * left/right walls, |sin rx| for top/bottom), between these values.
 */
const WALL_LIT = [0.96, 0.99];
type Side = 'right' | 'left' | 'top' | 'bottom';
const SIDES: Side[] = ['right', 'left', 'top', 'bottom'];
/** Sample points for the native sin/cos lookups (5° steps: walls sit 154px
 *  out, so the table's error is multiplied by that; ≤0.3px near edge-on). */
const TRIG_DEG = Array.from({ length: 73 }, (_, i) => i * 5);

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

  // Depth k along the card's normal. Web: a real translateZ(k). RN 0.81 has
  // no translateZ on native (Android TransformHelper.kt / iOS
  // RCTConvert+Transform.m skip it), so native reproduces what translateZ
  // AFTER rotateX·rotateY does on screen — a shift of (k·sin ry,
  // −k·sin rx·cos ry) — as a screen-space translate placed BEFORE the
  // rotations. Built from modulo/interpolate/multiply only — all
  // native-driver nodes, so no JS work per frame (and no listeners; see the
  // rule in CLAUDE.md). `translate: [0, 0, k]` is not an option: the native
  // driver only accepts numeric transform values.
  const depth = useMemo(() => {
    const table = (f: (rad: number) => number) => (v: Animated.Value) =>
      Animated.modulo(v, 360).interpolate({ inputRange: TRIG_DEG, outputRange: TRIG_DEG.map(d => f((d * Math.PI) / 180)) });
    const sin = table(Math.sin);
    const cos = table(Math.cos);
    const absSin = table(r => Math.abs(Math.sin(r)));
    const absCos = table(r => Math.abs(Math.cos(r)));
    const sinRx = sin(rx), cosRx = cos(rx), sinRy = sin(ry), cosRy = cos(ry);
    const dx = sinRy;
    const dy = Animated.multiply(Animated.multiply(sinRx, cosRy), -1);
    // Side opacity: 0 below ~6° of tilt, full by ~17° (side ≈ 1.8px wide).
    const edge = Animated.add(absSin(rx), absSin(ry)).interpolate({
      inputRange: [0.1, 0.3],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    const lit = (n: Animated.AnimatedInterpolation<number> | Animated.AnimatedMultiplication<number>) =>
      n.interpolate({ inputRange: WALL_LIT, outputRange: [0, 1], extrapolate: 'clamp' });
    const sideLit = lit(Animated.multiply(absSin(ry), absCos(rx)));
    const capLit = lit(absSin(rx));

    // Native has no translateZ, so a wall cannot simply be pushed out to its
    // edge in 3D. It is placed at that edge's PROJECTED centre instead: the
    // centre point (±W/2, 0, 0) or (0, ±H/2, 0) rotated by rotateX·rotateY,
    // then divided by perspective (scale p/(p − z)), applied as a screen-space
    // shift + scale before the rotations. Web uses the real 3D transform.
    const wall = (side: Side) => {
      let x: Animated.AnimatedNode | number, y: Animated.AnimatedNode, negZ: Animated.AnimatedNode;
      if (side === 'right' || side === 'left') {
        const h = ((side === 'right' ? 1 : -1) * CARD_W) / 2;
        x = Animated.multiply(cosRy, h);
        y = Animated.multiply(Animated.multiply(sinRy, sinRx), h);
        negZ = Animated.multiply(Animated.multiply(sinRy, cosRx), h);
      } else {
        const h = ((side === 'bottom' ? 1 : -1) * CARD_H) / 2;
        x = 0;
        y = Animated.multiply(cosRx, h);
        negZ = Animated.multiply(sinRx, -h);
      }
      const f = Animated.divide(PERSPECTIVE, Animated.add(PERSPECTIVE, negZ as Animated.Value));
      return {
        tx: typeof x === 'number' ? 0 : Animated.multiply(x as Animated.Value, f),
        ty: Animated.multiply(y as Animated.Value, f),
        f,
        opacity: side === 'right' || side === 'left' ? sideLit : capLit,
      };
    };
    const walls = Object.fromEntries(SIDES.map(s => [s, wall(s)])) as Record<Side, ReturnType<typeof wall>>;
    return { dx, dy, edge, walls };
  }, [rx, ry]);

  const TURN: Record<Side, object> = {
    right: { rotateY: '90deg' },
    left: { rotateY: '-90deg' },
    top: { rotateX: '90deg' },
    bottom: { rotateX: '-90deg' },
  };
  const ALONG: Record<Side, object> = {
    right: { translateX: CARD_W / 2 },
    left: { translateX: -CARD_W / 2 },
    top: { translateY: -CARD_H / 2 },
    bottom: { translateY: CARD_H / 2 },
  };
  const wallTransform = (side: Side) => {
    if (IS_WEB) return [...faceTransform, ALONG[side], TURN[side]];
    const w = depth.walls[side];
    return [
      faceTransform[0],
      { translateX: w.tx },
      { translateY: w.ty },
      { scale: w.f },
      ...faceTransform.slice(1),
      TURN[side],
    ];
  };
  const at = (k: number, rest: object[] = []) =>
    IS_WEB
      ? [...faceTransform, { translateZ: k }, ...rest]
      : [
          faceTransform[0],
          { translateX: Animated.multiply(depth.dx, k) },
          { translateY: Animated.multiply(depth.dy, k) },
          ...faceTransform.slice(1),
          ...rest,
        ];

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
        {/* Gold side — see SIDE_DEPTHS. Painted before the faces, so with
            no real Z on native the faces still cover it face-on.
            Do not add renderToHardwareTextureAndroid to fight grazing-angle
            tearing: flattening into a bitmap layer broke Android's
            backfaceVisibility culling, so the mirrored FRONT showed at rest. */}
        {SIDE_DEPTHS.map(k => (
          <Animated.View
            key={k}
            pointerEvents="none"
            style={[styles.face, { opacity: depth.edge, transform: at(k) as never }]}
          >
            <LinearGradient
              colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
              locations={gradients.metalEdgeLocations as unknown as readonly [number, number, ...number[]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fill}
            />
          </Animated.View>
        ))}

        {/* Side walls — see WALL_LIT. backfaceVisibility hidden, so only the
            wall on the side turned toward the viewer ever draws. */}
        {SIDES.map(side => {
          const vertical = side === 'right' || side === 'left';
          return (
            <Animated.View
              key={side}
              pointerEvents="none"
              style={[
                vertical ? styles.wallSide : styles.wallCap,
                styles.hidden,
                { opacity: depth.walls[side].opacity, transform: wallTransform(side) as never },
              ]}
            >
              <LinearGradient
                colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
                locations={gradients.metalEdgeLocations as unknown as readonly [number, number, ...number[]]}
                start={{ x: 0, y: 0 }}
                end={vertical ? { x: 0, y: 1 } : { x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          );
        })}

        <Animated.View
          style={[styles.face, styles.hidden, { transform: at(FACE_DEPTH) as never }]}
        >
          {front}
        </Animated.View>

        {/* Back face is rotateY(180) after the shift, so its normal points the other way. */}
        <Animated.View
          style={[
            styles.face,
            styles.hidden,
            { transform: at(-FACE_DEPTH, [{ rotateY: '180deg' }]) as never },
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
  // Centred on the card, so every wall turns about the card's own centre;
  // the transform carries it out to its edge. Rounded ends meet the corners.
  wallSide: {
    position: 'absolute',
    left: CARD_W / 2 - FACE_DEPTH,
    top: 0,
    width: FACE_DEPTH * 2,
    height: CARD_H,
    borderRadius: FACE_DEPTH,
    overflow: 'hidden',
  },
  wallCap: {
    position: 'absolute',
    left: 0,
    top: CARD_H / 2 - FACE_DEPTH,
    width: CARD_W,
    height: FACE_DEPTH * 2,
    borderRadius: FACE_DEPTH,
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

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

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, PanResponder, Platform, StyleSheet, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { useTheme } from '../../utils/ThemeContext';
import { gradients } from '../../theme/tokens';
import { fontFamily, motion, radius } from '../../theme/type';
import { useReduceMotion } from './Primitives';
import { holdTabSwipe } from '../TabSwipe';

const CARD_W = 308;
const CARD_H = 190;
/** Container is taller than the card so the float never clips. */
const CONTAINER_H = 250;
/** Matches the prototype's perspective: 1100px. */
const PERSPECTIVE = 1100;
/** How far each face sits off the card's centre plane along its normal (web: translateZ). */
const FACE_DEPTH = 3;
/**
 * The card's gold side: gold sheets stacked between the faces. A single
 * flat core (what this used to be) is a zero-width line edge-on, so at 90°
 * the two faces read as two separate sheets with see-through between them.
 * Stacked, the gap fills solid.
 *
 * DENSE: 0.25px apart. Every sheet is a plane parallel to the faces, so
 * edge-on each one is a hairline; Android does not anti-alias 3D-transformed
 * views, and at the old 0.75px spacing (7 sheets) it drew seven separate
 * stripes with see-through gaps and prongs at the ends (device capture, Oct
 * 2026). At 0.25px — under a device pixel — neighbouring hairlines overlap
 * into one band. Placing perpendicular "walls" instead was tried and missed
 * on Android: its camera projection does not match a computed placement.
 *
 * Each sheet is FILLED, a plain colour (no gradient, so cheap to draw).
 * Rings with a transparent middle were tried to save overdraw and failed on
 * the k62: just short of edge-on, the line of sight runs between the faces
 * and through the card's interior, and an empty middle showed the page
 * through the band. Shaded darker toward the faces, brighter mid-thickness,
 * like a milled metal edge.
 *
 * The stack fades in with tilt (see `edge` below): at rest and at a few
 * degrees the side is sub-pixel, and a sub-pixel gold strip rasterizes as a
 * row of dashes / a gold rim on the faces' anti-aliased edge.
 */
const SIDE_STEP = 0.25;
const SIDE_DEPTHS = Array.from(
  { length: Math.round((FACE_DEPTH * 2) / SIDE_STEP) - 1 },
  (_, i) => -FACE_DEPTH + SIDE_STEP * (i + 1)
);
/**
 * Every third sheet (0.75px apart — the old 7) draws whenever the card is
 * tilted; that spacing is already solid until ~70°. The other 16 only fade in
 * approaching edge-on, where they are needed and nearly free: a sheet costs
 * its projected area, which edge-on is a sliver. Drawing all 23 full layers
 * at every angle made the spin janky on a low-end phone (S22: 83% of frames
 * over budget).
 */
const isCoarse = (i: number) => (i + 1) % 3 === 0;
const mixHex = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};
/** Colour per sheet: the metal-edge gradient's ends, deep at the faces, bright mid-way. */
const sideColor = (k: number) =>
  mixHex(gradients.metalEdge[1], gradients.metalEdge[0], 1 - Math.abs(k) / FACE_DEPTH);
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

/** A rotation in degrees: the settled base, or base + live drag. */
type Rotation = Animated.Value | Animated.AnimatedAddition<number>;

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
  // place, it does not restart when the finger lifts. A ref, not state: a
  // re-render on the first touch rebuilt every layer's animated style at the
  // exact moment the drag starts (see the memoized `layers` below).
  const interacted = useRef(false);

  // --- rotation ---------------------------------------------------------------
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  // Plain numbers mirroring the Animated values; PanResponder needs synchronous
  // reads and Animated.Value has no public getter.
  const rxVal = useRef(0);
  const ryVal = useRef(0);
  const startRx = useRef(0);
  const startRy = useRef(0);

  // Hand rx/ry to the native driver at mount. A value only becomes native
  // once a useNativeDriver animation runs on it — here, the first release
  // settle — so until then every drag move updated the ~20 layers from JS one
  // by one, and on a slow phone the gold side visibly lagged the face: on the
  // FIRST drag after opening the screen the card came apart into two sheets
  // (S22 frame captures; the second drag was clean). A zero-length native
  // timing makes them native before the first touch, so every layer moves in
  // the same native frame.
  useEffect(() => {
    Animated.timing(rx, { toValue: 0, duration: 0, useNativeDriver: true }).start();
    Animated.timing(ry, { toValue: 0, duration: 0, useNativeDriver: true }).start();
  }, [rx, ry]);

  // Native: the drag itself never touches JS. react-native-gesture-handler
  // writes the finger's translation straight into tx/ty on the native side
  // (Animated.event, useNativeDriver), and the rotation the layers read is
  // base + translation. With PanResponder every move went through the JS
  // thread first, and right after the screen opens that thread is busy
  // rendering and fetching, so the first drags barely turned the card ("takes
  // a couple of touches", S22: 20° instead of 75° for the same swipe). JS only
  // runs at touch-down and release. Web keeps PanResponder (see the header).
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const rotX = useMemo(() => Animated.add(rx, Animated.multiply(ty, -motion.cardRotatePerPx)), [rx, ty]);
  const rotY = useMemo(() => Animated.add(ry, Animated.multiply(tx, motion.cardRotatePerPx)), [ry, tx]);
  const onGestureEvent = useMemo(
    () => Animated.event([{ nativeEvent: { translationX: tx, translationY: ty } }], { useNativeDriver: true }),
    [tx, ty]
  );

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
      // Native: apply now. Touch moves already arrive at most once a display
      // frame there, and holding each for the next frame only added a frame
      // of lag between finger and card. The throttle is for web's mouse.
      if (!IS_WEB) {
        applyMove(m);
        return;
      }
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

  // Reduce Motion: the idle float is decoration, so it simply doesn't run.
  // Drag and settle are the user's own motion and stay as they are.
  const reduced = useReduceMotion();

  useEffect(() => {
    if (interacted.current || reduced) return;
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
    return () => {
      loop.stop();
      // Turning Reduce Motion on mid-loop parks the card at rest, not mid-bob.
      if (!interacted.current) float.setValue(0);
    };
  }, [float, reduced]);

  /** Freeze the float at whatever frame it is on — no snap back to 0. */
  const freezeFloat = useCallback(() => {
    if (interacted.current) return;
    interacted.current = true;
    floatLoop.current?.stop();
    // stopAnimation hands back the value the native driver is currently at —
    // the one-shot read the old per-frame listener was standing in for.
    float.stopAnimation(v => float.setValue(v));
  }, [float]);

  // --- gesture ----------------------------------------------------------------
  // Snap each axis to the nearest half-turn with a slow soft settle. The snap
  // target is written into rxVal/ryVal up front: once the settle finishes that
  // IS the value, and the gesture handlers are the only other writers — so the
  // mirrors stay exact with no per-frame listener.
  const settle = useCallback(() => {
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
  }, [rx, ry]);

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
          holdTabSwipe(); // web: a card turn is not a tab swipe (TabSwipe)
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

          settle();
        },
      }),
    [freezeFloat, scheduleMove, flushMove, settle, onDragChange, onTap]
  );

  // Native gesture: touch-down and release only (the moves are native).
  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, translationY } = e.nativeEvent;
      // No onDragChange here: on native the page's scroll is blocked by
      // gesture-handler itself (the parents use RNGH's ScrollView, which is
      // cancelled when this pan activates first at minDist 2). Calling it set
      // parent state at touch-down, and that whole-screen re-render landed on
      // Android's UI thread exactly as the finger started moving: the
      // "initial lag" on every drag that the web dev page never had.
      if (state === State.BEGAN) {
        freezeFloat();
        return;
      }
      if (state !== State.END && state !== State.CANCELLED && state !== State.FAILED) return;
      // Fold the drag into the base in one batch, so base + translation is
      // unchanged on screen: no jump between the gesture and the settle.
      ryVal.current += translationX * motion.cardRotatePerPx;
      rxVal.current -= translationY * motion.cardRotatePerPx;
      ry.setValue(ryVal.current);
      rx.setValue(rxVal.current);
      tx.setValue(0);
      ty.setValue(0);
      if (state !== State.CANCELLED && Math.hypot(translationX, translationY) < motion.cardTapSlop) {
        onTap?.();
        return;
      }
      settle();
    },
    [freezeFloat, onTap, rx, ry, tx, ty, settle]
  );

  // --- transforms -------------------------------------------------------------
  // EVERY animated node and style below is built once (useMemo on the
  // Animated values, which never change). Built inline, each render made
  // fresh interpolate/multiply nodes for all ~25 layers, and Animated tore
  // down and re-attached the whole native graph — and renders happen exactly
  // when a drag STARTS (first-touch float freeze, the parent disabling its
  // ScrollView), so every drag began with a visible hitch.
  const deg = useCallback(
    (v: Rotation) => v.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }),
    []
  );

  const floatY = useMemo(
    () => float.interpolate({ inputRange: [0, 1], outputRange: [0, motion.cardFloatTravel] }),
    [float]
  );

  const faceTransform = useMemo(
    () =>
      IS_WEB
        ? [{ rotateX: deg(rotX) }, { rotateY: deg(rotY) }]
        : [{ perspective: PERSPECTIVE }, { rotateX: deg(rotX) }, { rotateY: deg(rotY) }],
    [deg, rotX, rotY]
  );

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
    const table = (f: (rad: number) => number) => (v: Rotation) =>
      Animated.modulo(v, 360).interpolate({ inputRange: TRIG_DEG, outputRange: TRIG_DEG.map(d => f((d * Math.PI) / 180)) });
    const sin = table(Math.sin);
    const absSin = table(r => Math.abs(Math.sin(r)));
    const dx = sin(rotY);
    const dy = Animated.multiply(Animated.multiply(sin(rotX), table(Math.cos)(rotY)), -1);
    // Side opacity: 0 below ~6° of tilt, full by ~17° (side ≈ 1.8px wide).
    const edge = Animated.add(absSin(rotX), absSin(rotY)).interpolate({
      inputRange: [0.1, 0.3],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    // Fill-in sheets: |cos rx·cos ry| is how squarely the face still points
    // at the viewer; they fade in from ~65° of tilt and are full by ~75°.
    const absCos = table(r => Math.abs(Math.cos(r)));
    const fine = Animated.multiply(absCos(rotX), absCos(rotY)).interpolate({
      inputRange: [0.26, 0.42],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return { dx, dy, edge, fine };
  }, [rotX, rotY]);
  const layers = useMemo(() => {
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
    return {
      card: [
        styles.card,
        IS_WEB ? ({ perspective: PERSPECTIVE } as unknown as ViewStyle) : null,
        { transform: [{ translateY: floatY }] },
      ],
      sheets: SIDE_DEPTHS.map((k, i) => [
        styles.sheet,
        {
          backgroundColor: sideColor(k),
          opacity: isCoarse(i) ? depth.edge : depth.fine,
          transform: at(k) as never,
        },
      ]),
      front: [styles.face, styles.hidden, { transform: at(FACE_DEPTH) as never }],
      // rotateY(180) after the shift, so its normal points the other way.
      back: [styles.face, styles.hidden, { transform: at(-FACE_DEPTH, [{ rotateY: '180deg' }]) as never }],
    };
  }, [faceTransform, depth, floatY]);

  const card = (
    <Animated.View {...(IS_WEB ? panResponder.panHandlers : null)} style={layers.card}>
        {/* Gold side — see SIDE_DEPTHS. Painted before the faces, so with
            no real Z on native the faces still cover it face-on.
            Do not add renderToHardwareTextureAndroid to fight grazing-angle
            tearing: flattening into a bitmap layer broke Android's
            backfaceVisibility culling, so the mirrored FRONT showed at rest. */}
        {layers.sheets.map((sheetStyle, i) => (
          <Animated.View key={SIDE_DEPTHS[i]} pointerEvents="none" style={sheetStyle} />
        ))}

        <Animated.View style={layers.front}>{front}</Animated.View>
        <Animated.View style={layers.back}>{back}</Animated.View>
    </Animated.View>
  );

  return (
    <View style={[styles.container, style]}>
      {IS_WEB ? (
        card
      ) : (
        // minDist 2: a drag claims the touch before the page's ScrollView
        // (whose slop is larger) can start scrolling it.
        <PanGestureHandler
          minDist={2}
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          {card}
        </PanGestureHandler>
      )}

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
  sheet: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
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

// =============================================================================
// EZER Redesign — Physical card drawing surface
//
// A 308x190 card face (the same geometry as VirtualCard) that doubles as a
// freehand drawing canvas. Used by app/screens/PhysicalCard.tsx.
//
// LOCKED layout, per the Card Studio comp: the front carries ONLY the chip —
// no wording. (The comp's original spec also put a contactless mark next to
// it; removed on request, so the front is chip-only now.) Cardholder name,
// masked number, CVV and expiry live on the back, which the user reaches with
// the flip control. Do not put identifying text back on the front; that is
// the one thing the design explicitly locks against.
//
// Why the strokes are SVG path strings and not point arrays:
//   the design has to survive a JSON round-trip through AsyncStorage AND be
//   handed to a print vendor later. An SVG `d` string is already the printable
//   artwork — storing raw points would mean re-deriving it on both ends.
//
// Coordinates are card-local (0..308 x 0..190), so the same stored design can be
// re-rendered at any scale — a preview thumbnail or a full print sheet — by
// changing the SVG viewBox only.
//
// The flip is built on core `Animated` (no Reanimated in deps — see
// CLAUDE.md). React Native has no reliable cross-platform backfaceVisibility,
// so rather than fight that, the front and back are cross-faded at the
// rotation's halfway point while the whole card keeps spinning — a standard
// RN flip-card recipe that reads as a real turn without needing backface
// support at all.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Reanimated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { LinearGradient } from 'expo-linear-gradient';
import { cardFinishes, cardBackFinishes, gradients, isDarkFinish, type CardFinish } from '../../theme/tokens';
import { fontFamily, radius } from '../../theme/type';
import CardChip from './CardChip';

export const CARD_W = 308;
export const CARD_H = 190;

/** One freehand stroke, in card-local coordinates. */
export interface Stroke {
  /** SVG path data, e.g. "M12 30 L13 31 L15 34". */
  d: string;
  color: string;
  width: number;
}

export interface CardCanvasProps {
  finish: CardFinish;
  strokes: Stroke[];
  /** Colour/width applied to the stroke currently being drawn. */
  color: string;
  width: number;
  /** Showing the back disables drawing — the back is fixed security printing. */
  flipped?: boolean;
  /** Committed when the finger lifts. Never called for a stray tap. */
  onStrokeEnd: (stroke: Stroke) => void;
  /**
   * Fired on grant/release so the parent can freeze its ScrollView. Without
   * this the vertical scroll steals the pan halfway through a stroke.
   */
  onDrawingChange?: (drawing: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

/** Points closer together than this are dropped — keeps `d` strings small. */
const MIN_STEP = 1.6;

const clamp = (v: number, max: number) => {
  'worklet';
  return v < 0 ? 0 : v > max ? max : v;
};
/** One decimal is well under a printed pixel and roughly halves the payload. */
const r1 = (v: number) => {
  'worklet';
  return Math.round(v * 10) / 10;
};

const AnimatedPath = Reanimated.createAnimatedComponent(Path);

const FLIP_MS = 620;

/**
 * The LOCKED front: chip + the artwork, no wording.
 * Exported so anywhere that shows a finished design read-only — currently
 * PhysicalCardReview.tsx's free-spin preview — renders exactly this and
 * cannot drift from what the live designer draws. `liveStroke` is for the
 * designer's in-progress path only (an animated Path, painted in the same
 * place a committed stroke is: above the artwork, under the chip); omit it
 * everywhere else.
 */
export function CardFrontFace({
  finish,
  strokes,
  liveStroke,
}: {
  finish: CardFinish;
  strokes: Stroke[];
  liveStroke?: React.ReactNode;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={cardFinishes[finish] as unknown as readonly [string, string, ...string[]]}
        locations={
          gradients.cardFrontLocations as unknown as readonly [number, number, ...number[]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg
        width={CARD_W}
        height={CARD_H}
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {strokes.map((s, i) => (
          <Path
            key={i}
            d={s.d}
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
        {liveStroke}
      </Svg>
      {/* Card furniture sits ABOVE the artwork so the chip stays readable no
          matter how heavily the user draws. Chip only — no contactless mark,
          removed on request. */}
      <View style={styles.furniture} pointerEvents="none">
        <CardChip />
      </View>
    </View>
  );
}

/** The LOCKED back: security printing — name, masked number, CVV, expiry. */
export function CardBackFace({ finish }: { finish: CardFinish }) {
  const backDark = isDarkFinish(finish);
  const backInk = backDark ? 'rgba(255,255,255,.92)' : '#241A38';
  const backSub = backDark ? 'rgba(255,255,255,.55)' : 'rgba(36,26,56,.55)';
  const backBoxBg = backDark ? 'rgba(255,255,255,.18)' : 'rgba(36,26,56,.12)';
  const backGold = backDark ? '#D6B36F' : '#A87D2F';

  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={cardBackFinishes[finish] as unknown as readonly [string, string, ...string[]]}
        locations={
          gradients.cardFrontLocations as unknown as readonly [number, number, ...number[]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.stripe} />
      <View style={styles.backBody} pointerEvents="none">
        <View style={styles.rowBetween}>
          <View style={[styles.nameBox, { backgroundColor: 'rgba(255,255,255,.92)' }]}>
            <Text selectable={false} style={styles.nameBoxText}>EZER MEMBER</Text>
          </View>
          <View style={[styles.cvvBox, { backgroundColor: backBoxBg }]}>
            <Text selectable={false} style={[styles.cvvLabel, { color: backInk }]}>CVV</Text>
            <Text selectable={false} style={[styles.cvvValue, { color: backInk }]}>•••</Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <Text selectable={false} style={[styles.backNumber, { color: backInk }]}>••••  ••••  ••••  8873</Text>
        <View style={styles.rowBetween}>
          <Text selectable={false} style={[styles.backSub, { color: backSub }]}>PHYSICAL · YOUR DESIGN</Text>
          <Text selectable={false} style={[styles.backWordmark, { color: backGold }]}>EZER</Text>
        </View>
      </View>
    </View>
  );
}

export function CardCanvas({
  finish,
  strokes,
  color,
  width,
  flipped = false,
  onStrokeEnd,
  onDrawingChange,
  style,
}: CardCanvasProps) {
  // The in-progress stroke lives on the UI thread: the gesture worklet
  // appends to `liveD` and the animated Path repaints from it, so drawing
  // runs no React render per touch sample (it used to setState on every
  // move). The parent hears about the stroke once, on release.
  const liveD = useSharedValue('');
  const segs = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);
  const down = useSharedValue(false);
  const liveProps = useAnimatedProps(() => ({ d: liveD.get() }));
  // Cleared only once the committed stroke has rendered, so the line never
  // blinks out between release and the parent's re-render.
  // A finger already down on the next stroke keeps its own live path.
  useEffect(() => {
    if (!down.get()) liveD.set('');
  }, [strokes, liveD, down]);

  const flipAnim = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: flipped ? 1 : 0,
      duration: FLIP_MS,
      useNativeDriver: true,
    }).start();
  }, [flipped, flipAnim]);

  const frontRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backRotate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  // Cross-fade at the midpoint rather than relying on backfaceVisibility,
  // which Android does not honour consistently.
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5001, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.4999, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  // onDrawingChange freezes the parent's scroll on the WEB only. On native
  // the parent is RNGH's ScrollView, which this pan cancels by activating
  // first; a setState at stroke start would re-render the screen on Android's
  // UI thread just as the finger moves (see SpinCard).
  const notifyDrawing = Platform.OS === 'web' ? onDrawingChange : undefined;

  const commit = (d: string) => {
    onStrokeEnd({ d, color, width });
  };

  const pan = Gesture.Pan()
    .enabled(!flipped)
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin(e => {
      const x = clamp(e.x, CARD_W);
      const y = clamp(e.y, CARD_H);
      lastX.set(x);
      lastY.set(y);
      segs.set(0);
      down.set(true);
      liveD.set(`M${r1(x)} ${r1(y)}`);
      if (notifyDrawing) scheduleOnRN(notifyDrawing, true);
    })
    .onUpdate(e => {
      // e.x/e.y are relative to the touch layer, which covers the card
      // exactly; clamped because a fast drag reports points outside it.
      const x = clamp(e.x, CARD_W);
      const y = clamp(e.y, CARD_H);
      if (Math.hypot(x - lastX.get(), y - lastY.get()) < MIN_STEP) return;
      lastX.set(x);
      lastY.set(y);
      segs.set(segs.get() + 1);
      liveD.set(`${liveD.get()} L${r1(x)} ${r1(y)}`);
    })
    .onFinalize(() => {
      down.set(false);
      let d = liveD.get();
      if (!d) return;
      // A tap: a zero-length line so round caps render it as a dot.
      if (segs.get() === 0) d = `${d} L${d.slice(1)}`;
      scheduleOnRN(commit, d);
      if (notifyDrawing) scheduleOnRN(notifyDrawing, false);
    });

  const liveStroke = (
    <AnimatedPath
      animatedProps={liveProps}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );

  return (
    <View style={[styles.perspective, style]}>
      {/* --- Front: chip + the user's artwork. No wording. */}
      <Animated.View
        style={[
          styles.face,
          { opacity: frontOpacity, transform: [{ perspective: 1000 }, { rotateY: frontRotate }] },
        ]}
        pointerEvents={flipped ? 'none' : 'auto'}
      >
        <CardFrontFace
          finish={finish}
          strokes={strokes}
          liveStroke={liveStroke}
        />
        {/* Touch layer, last child so it is on top of everything above. */}
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>
      </Animated.View>

      {/* --- Back: fixed security printing. Never drawable. */}
      <Animated.View
        style={[
          styles.face,
          styles.backFace,
          { opacity: backOpacity, transform: [{ perspective: 1000 }, { rotateY: backRotate }] },
        ]}
        pointerEvents="none"
      >
        <CardBackFace finish={finish} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  perspective: {
    width: CARD_W,
    height: CARD_H,
  },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.virtualCard,
    overflow: 'hidden',
  },
  backFace: {
    // Placeholder kept distinct from `face` so back-only overrides have
    // somewhere to live without touching the front's rules.
  },
  furniture: {
    ...StyleSheet.absoluteFillObject,
    padding: 18,
    justifyContent: 'flex-start',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stripe: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: '#0B0812',
  },
  backBody: {
    ...StyleSheet.absoluteFillObject,
    top: 58,
    padding: 16,
    paddingTop: 10,
  },
  nameBox: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  nameBoxText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: '#241A38',
  },
  cvvBox: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cvvLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    opacity: 0.6,
  },
  cvvValue: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
  },
  backNumber: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  backSub: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 1.1,
  },
  backWordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    letterSpacing: 2.2,
  },
});

export default CardCanvas;

// =============================================================================
// EZER Redesign — Physical card drawing surface
//
// A 308x190 card face (the same geometry as VirtualCard) that doubles as a
// freehand drawing canvas. Used by app/screens/PhysicalCard.tsx.
//
// LOCKED layout, per the Card Studio comp: the front carries ONLY the chip and
// the contactless mark — no wording. Cardholder name, masked number, CVV and
// expiry live on the back, which the user reaches with the flip control. Do
// not put identifying text back on the front; that is the one thing the
// design explicitly locks against.
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { cardFinishes, cardBackFinishes, gradients, isDarkFinish, type CardFinish } from '../../theme/tokens';
import { fontFamily, radius } from '../../theme/type';

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

const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);
/** One decimal is well under a printed pixel and roughly halves the payload. */
const r1 = (v: number) => Math.round(v * 10) / 10;

const FLIP_MS = 620;

/**
 * The LOCKED front: chip + contactless mark + the artwork, no wording.
 * Exported so anywhere that shows a finished design read-only — currently
 * PhysicalCardReview.tsx's free-spin preview — renders exactly this and
 * cannot drift from what the live designer draws. `liveStroke` is for the
 * designer's in-progress path only; omit it everywhere else.
 */
export function CardFrontFace({
  finish,
  strokes,
  liveStroke,
}: {
  finish: CardFinish;
  strokes: Stroke[];
  liveStroke?: Stroke;
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
        {liveStroke ? (
          <Path
            d={liveStroke.d}
            stroke={liveStroke.color}
            strokeWidth={liveStroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
      </Svg>
      {/* Card furniture sits ABOVE the artwork so the chip/contactless stay
          readable no matter how heavily the user draws. */}
      <View style={styles.furniture} pointerEvents="none">
        <View style={styles.rowBetween}>
          <LinearGradient
            colors={gradients.metalEdge as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chip}
          />
          <Ionicons name="wifi" size={20} color="rgba(255,255,255,.85)" />
        </View>
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
            <Text style={styles.nameBoxText}>EZER MEMBER</Text>
          </View>
          <View style={[styles.cvvBox, { backgroundColor: backBoxBg }]}>
            <Text style={[styles.cvvLabel, { color: backInk }]}>CVV</Text>
            <Text style={[styles.cvvValue, { color: backInk }]}>•••</Text>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={[styles.backNumber, { color: backInk }]}>••••  ••••  ••••  8873</Text>
        <View style={styles.rowBetween}>
          <Text style={[styles.backSub, { color: backSub }]}>PHYSICAL · YOUR DESIGN</Text>
          <Text style={[styles.backWordmark, { color: backGold }]}>EZER</Text>
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
  // The in-progress stroke is local state so committing to the parent happens
  // once per stroke instead of once per touch sample.
  const [liveD, setLiveD] = useState<string>('');
  const points = useRef<string[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);

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

  /**
   * locationX/Y is relative to the responder view, which here is the overlay
   * that exactly covers the card — so it is already card-local. Clamped because
   * a fast drag reports coordinates outside the view before the release.
   */
  const readPoint = useCallback((e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    return { x: clamp(locationX, CARD_W), y: clamp(locationY, CARD_H) };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !flipped,
        onMoveShouldSetPanResponder: () => !flipped,
        // A parent ScrollView asks to take over as soon as the drag turns
        // vertical; refusing keeps the whole stroke on this view.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,

        onPanResponderGrant: e => {
          const p = readPoint(e);
          last.current = p;
          points.current = [`M${r1(p.x)} ${r1(p.y)}`];
          setLiveD(points.current[0]);
          onDrawingChange?.(true);
        },

        onPanResponderMove: e => {
          const p = readPoint(e);
          const prev = last.current;
          if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_STEP) return;
          last.current = p;
          points.current.push(`L${r1(p.x)} ${r1(p.y)}`);
          setLiveD(points.current.join(' '));
        },

        onPanResponderRelease: () => {
          const parts = points.current;
          if (parts.length === 1) {
            // A tap: emit a zero-length line so round caps render it as a dot.
            const start = parts[0].slice(1);
            parts.push(`L${start}`);
          }
          if (parts.length > 1) {
            onStrokeEnd({ d: parts.join(' '), color, width });
          }
          points.current = [];
          last.current = null;
          setLiveD('');
          onDrawingChange?.(false);
        },

        onPanResponderTerminate: () => {
          // Interrupted (call, system gesture) — drop the partial stroke rather
          // than committing something the user did not finish.
          points.current = [];
          last.current = null;
          setLiveD('');
          onDrawingChange?.(false);
        },
      }),
    [color, flipped, onDrawingChange, onStrokeEnd, readPoint, width]
  );

  return (
    <View style={[styles.perspective, style]}>
      {/* --- Front: chip + contactless mark + the user's artwork. No wording. */}
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
          liveStroke={liveD ? { d: liveD, color, width } : undefined}
        />
        {/* Touch layer, last child so it is on top of everything above. */}
        <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
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
  chip: {
    width: 40,
    height: 29,
    borderRadius: 6,
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

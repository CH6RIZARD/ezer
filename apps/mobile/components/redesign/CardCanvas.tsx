// =============================================================================
// EZER Redesign — Physical card drawing surface
//
// A 308x190 card face (the same geometry as VirtualCard) that doubles as a
// freehand drawing canvas. Used by app/screens/PhysicalCard.tsx.
//
// Why the strokes are SVG path strings and not point arrays:
//   the design has to survive a JSON round-trip through AsyncStorage AND be
//   handed to a print vendor later. An SVG `d` string is already the printable
//   artwork — storing raw points would mean re-deriving it on both ends.
//
// Coordinates are card-local (0..308 x 0..190), so the same stored design can be
// re-rendered at any scale — a preview thumbnail or a full print sheet — by
// changing the SVG viewBox only.
// =============================================================================

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { cardFinishes, gradients, type CardFinish } from '../../theme/tokens';
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

export function CardCanvas({
  finish,
  strokes,
  color,
  width,
  onStrokeEnd,
  onDrawingChange,
  style,
}: CardCanvasProps) {
  // The in-progress stroke is local state so committing to the parent happens
  // once per stroke instead of once per touch sample.
  const [liveD, setLiveD] = useState<string>('');
  const points = useRef<string[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);

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
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
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
    [color, onDrawingChange, onStrokeEnd, readPoint, width]
  );

  return (
    <View style={[styles.card, style]}>
      <LinearGradient
        colors={cardFinishes[finish] as unknown as readonly [string, string, ...string[]]}
        locations={
          gradients.cardFrontLocations as unknown as readonly [number, number, ...number[]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Artwork layer. pointerEvents none so the PanResponder overlay wins. */}
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
        {liveD ? (
          <Path
            d={liveD}
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
      </Svg>

      {/* Card furniture sits ABOVE the artwork so the card stays readable no
          matter how heavily the user draws. */}
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

        <Text style={styles.number}>••••  ••••  ••••  8873</Text>

        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.cardLabel}>CARDHOLDER</Text>
            <Text style={styles.cardValue}>EZER MEMBER</Text>
          </View>
          <View>
            <Text style={styles.cardLabel}>PHYSICAL</Text>
            <Text style={styles.cardValue}>YOUR DESIGN</Text>
          </View>
        </View>
      </View>

      {/* Touch layer, last child so it is on top of everything above. */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.virtualCard,
    overflow: 'hidden',
  },
  furniture: {
    ...StyleSheet.absoluteFillObject,
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
    // A soft shadow keeps the number legible over a dark scribble.
    textShadowColor: 'rgba(0,0,0,.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 8,
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,.7)',
    marginBottom: 3,
  },
  cardValue: {
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

export default CardCanvas;

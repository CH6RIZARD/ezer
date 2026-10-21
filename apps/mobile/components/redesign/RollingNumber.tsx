// Odometer-style number: each digit is a vertical 0-9 strip that rolls to its
// new value on the UI thread (Reanimated), instead of the text swapping
// instantly. Non-digits ($ , . -) are static.
//
// Instrument Serif has PROPORTIONAL digits ("1" is narrow), so a column can't
// be a fixed width: each column's width eases to the width of the digit it is
// rolling to, measured once from hidden copies of 0-9 in the same style.
// Until that measurement lands (one frame) or with Reduce Motion on, this is a
// plain Text.

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { motion } from '../../theme/type';
import { useReduceMotion } from './Primitives';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ROLL_MS = 650;
const EASE = Easing.bezier(...motion.easeOut);
// Italic glyphs overhang their advance box; the column clips (overflow hidden
// is the only way to mask the strip), so give it slack that the negative
// margin hands back to the layout.
const PAD = 4;

type Metrics = { h: number; w: number[] };

function DigitColumn({ digit, m, style, rollIn }: { digit: number; m: Metrics; style: StyleProp<TextStyle>; rollIn?: boolean }) {
  // rollIn: start at 0 and count up to the digit when the column mounts.
  const y = useSharedValue(rollIn ? 0 : -digit * m.h);
  const w = useSharedValue(m.w[rollIn ? 0 : digit]);
  useEffect(() => {
    y.value = withTiming(-digit * m.h, { duration: ROLL_MS, easing: EASE });
    w.value = withTiming(m.w[digit], { duration: ROLL_MS, easing: EASE });
  }, [digit, m, y, w]);
  const col = useAnimatedStyle(() => ({ width: w.value + PAD * 2 }));
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.col, { height: m.h }, col]}>
      {/* A fixed width (the widest digit's, centred and clipped by the column):
          sized to the column, the strip and its ten Texts were laid out and
          re-measured again on every frame of the width easing. */}
      <Animated.View style={[{ width: Math.max(...m.w) + PAD * 2 }, strip]}>
        {DIGITS.map(d => (
          <Text key={d} style={[style, styles.center, { height: m.h }]}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function RollingNumber({
  value,
  style,
  containerStyle,
  rollIn,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
  /** Row alignment etc. Defaults to hugging the left edge. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Count up from zero on mount, not only on later changes. */
  rollIn?: boolean;
}) {
  const reduce = useReduceMotion();
  const [m, setM] = useState<Metrics | null>(null);
  const acc = useRef<{ h: number; w: number[]; n: number }>({ h: 0, w: [], n: 0 });

  // Hidden copies of 0-9 report their width and the line height.
  const measurer = m ? null : (
    <View style={styles.measure} pointerEvents="none">
      {DIGITS.map((d, i) => (
        <Text
          key={d}
          style={style}
          onLayout={e => {
            const a = acc.current;
            if (a.w[i] === undefined) a.n++;
            a.w[i] = e.nativeEvent.layout.width;
            a.h = Math.max(a.h, e.nativeEvent.layout.height);
            if (a.n === DIGITS.length) setM({ h: a.h, w: [...a.w] });
          }}
        >
          {d}
        </Text>
      ))}
    </View>
  );

  if (!m || reduce) {
    return (
      <View style={containerStyle}>
        <Text style={style}>{value}</Text>
        {measurer}
      </View>
    );
  }

  const chars = value.split('');
  return (
    <View style={[styles.row, containerStyle]} accessible accessibilityRole="text" accessibilityLabel={value}>
      {chars.map((c, i) => {
        // Keyed from the RIGHT so the ones digit stays the ones digit when
        // the number gains a place ($9.99 -> $10.00) and only the new leading
        // column mounts.
        const fromRight = chars.length - i;
        const d = c.charCodeAt(0) - 48;
        return d >= 0 && d <= 9 ? (
          <DigitColumn key={`d${fromRight}`} digit={d} m={m} style={style} rollIn={rollIn} />
        ) : (
          <Text key={`${c}${fromRight}`} style={[style, { height: m.h }]}>
            {c}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'flex-start' },
  col: { overflow: 'hidden', alignItems: 'center', marginHorizontal: -PAD },
  center: { textAlign: 'center' },
  measure: { position: 'absolute', opacity: 0, flexDirection: 'row' },
});

// Memoized: a parent that re-renders for unrelated reasons (and passes a
// stable style) skips ~10 Texts per digit column.
export default React.memo(RollingNumber);

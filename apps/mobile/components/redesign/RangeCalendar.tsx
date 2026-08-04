// =============================================================================
// EZER Redesign — Wallet custom range picker (handoff §4)
//
// goldLine-bordered card, spring-up. Month nav, S–M–T–W–T–F–S header, 32px day
// cells. First tap = start, second = end (auto-swap if reversed). Endpoints get
// a gold fill with white text; days between get `goldSoft`. Footer shows a live
// "{range} · $X drained" (or the prompt copy) plus a gold Done button.
// =============================================================================

import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, motion } from '../../theme/type';
import { formatCents } from '../../utils/calculations';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function RangeCalendar({
  start,
  end,
  onChange,
  onDone,
  drainedCents,
}: {
  start: Date | null;
  end: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
  onDone: () => void;
  /** Live total for the currently selected range. */
  drainedCents: number;
}) {
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: motion.popover,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const month = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    return d;
  }, [offset]);

  const cells = useMemo(() => {
    const lead = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  /** First tap sets start; second sets end, swapping if the user picked backwards. */
  const tap = (d: Date) => {
    const day = startOfDay(d);
    if (!start || (start && end)) {
      onChange(day, null);
      return;
    }
    if (day < start) onChange(day, start);
    else onChange(start, day);
  };

  const inRange = (d: Date) => !!(start && end && d > start && d < end);
  const isEnd = (d: Date) => !!((start && sameDay(d, start)) || (end && sameDay(d, end)));

  const footer = !start
    ? 'Tap a start date'
    : !end
    ? 'Now tap an end date'
    : `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric' }
      )} · ${formatCents(drainedCents)} drained`;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.card,
          borderColor: colors.goldLine,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.monthRow}>
        <Pressable onPress={() => setOffset(o => o - 1)} hitSlop={10}>
          <Ionicons name="chevron-back" size={17} color={colors.ink} />
        </Pressable>
        <Text style={[typeScale.serifTitle, { color: colors.ink, fontSize: 17 }]}>
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <Pressable onPress={() => setOffset(o => o + 1)} hitSlop={10}>
          <Ionicons name="chevron-forward" size={17} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.dowRow}>
        {DOW.map((d, i) => (
          <Text key={i} style={[styles.dow, { color: colors.mut2 }]}>
            {d}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cellWrap} />;
          const end_ = isEnd(d);
          const mid = inRange(d);
          return (
            <View key={i} style={styles.cellWrap}>
              <Pressable
                onPress={() => tap(d)}
                style={[
                  styles.cell,
                  end_ && { backgroundColor: colors.goldBg },
                  mid && { backgroundColor: colors.goldSoft },
                ]}
              >
                <Text
                  style={[
                    styles.cellText,
                    { color: end_ ? '#FFFFFF' : mid ? colors.gold : colors.ink },
                  ]}
                >
                  {d.getDate()}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        <Text style={[styles.footerText, { color: colors.mut }]} numberOfLines={1}>
          {footer}
        </Text>
        <Pressable
          onPress={onDone}
          style={[styles.done, { backgroundColor: colors.goldBg }]}
        >
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: radius.cardLg,
    padding: 14,
    marginTop: 12,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dowRow: { flexDirection: 'row' },
  dow: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  cellWrap: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 2,
  },
  cell: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontFamily: fontFamily.semibold,
    fontSize: 12.5,
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerText: {
    flex: 1,
    fontFamily: fontFamily.semibold,
    fontSize: 11.5,
  },
  done: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.chip,
  },
  doneText: {
    fontFamily: fontFamily.bold,
    fontSize: 12.5,
    color: '#FFFFFF',
  },
});

export default RangeCalendar;

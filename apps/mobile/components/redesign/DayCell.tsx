// One calendar day on Home. Memoised and deliberately CHEAP: 42 of these
// mount at once, and Home's cost on a slow phone is its native view count,
// not its JS (k62 timeline, Oct 2026: Home's JS render+commit ~0.3s, the
// tab taking seconds to show). So: no PressScale (that is a Pressable plus
// a Reanimated view per cell), press feedback is a plain opacity dip, a day
// with no charges is a plain View, and nothing here re-renders unless its
// own props change.

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MerchantMark from './MerchantMark';
import { fontFamily, layout, radius } from '../../theme/type';
import { formatCompactCents } from '../../utils/format';

export type DayMark = { id: string; merchantName: string; merchantId?: string; logo?: string };

type Props = {
  /** Day of month, or 0 for a leading/trailing blank. */
  day: number;
  isToday: boolean;
  totalCents: number;
  marks: DayMark[];
  colors: { cellHl: string; cellBg: string; accent: string; ink: string; red: string };
  onPress?: (day: number) => void;
};

function DayCellImpl({ day, isToday, totalCents, marks, colors, onPress }: Props) {
  const has = marks.length > 0;
  const body = day ? (
    <>
      {isToday ? (
        <View style={[styles.todayPill, { backgroundColor: colors.accent }]}>
          <Text style={styles.todayText}>{day}</Text>
        </View>
      ) : (
        <Text style={[styles.dayNum, { color: colors.ink }]}>{day}</Text>
      )}
      {has ? (
        <>
          <View style={styles.badgeRow}>
            {marks.slice(0, 3).map(m => (
              <MerchantMark key={m.id} name={m.merchantName} merchantId={m.merchantId} logoUrl={m.logo} size={15} />
            ))}
          </View>
          <Text style={[styles.dayTotal, { color: colors.red }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            -{formatCompactCents(totalCents)}
          </Text>
        </>
      ) : null}
    </>
  ) : null;

  const bg = day ? (has ? colors.cellHl : colors.cellBg) : 'transparent';
  if (!has) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.cell, { backgroundColor: bg }]}>{body}</View>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onPress?.(day)}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${day}, ${marks.length} charge${marks.length === 1 ? '' : 's'}`}
    >
      <View style={[styles.cell, { backgroundColor: bg }]}>{body}</View>
    </Pressable>
  );
}

export const DayCell = memo(DayCellImpl);

const styles = StyleSheet.create({
  wrap: { width: `${100 / 7}%`, padding: 2 },
  pressed: { opacity: 0.65 },
  cell: {
    minHeight: layout.calCellMinHeight,
    borderRadius: radius.cell,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    gap: 3,
  },
  dayNum: { fontFamily: fontFamily.semibold, fontSize: 12.5 },
  todayPill: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontFamily: fontFamily.bold, fontSize: 11.5, color: '#FFFFFF' },
  badgeRow: { flexDirection: 'row', gap: 2 },
  dayTotal: { fontFamily: fontFamily.bold, fontSize: 9 },
});

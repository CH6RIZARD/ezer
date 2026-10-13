// =============================================================================
// EZER Redesign — Wallet custom range picker (handoff §4)
//
// A bottom sheet over the Wallet, not a card inline in the page. Month nav,
// S–M–T–W–T–F–S header, 32px day cells. First tap = start, second = end
// (auto-swap if reversed). Endpoints get a gold fill with white text; days
// between get `goldSoft`. Footer shows the picked range (plus its total once
// known) and a gold Done button.
//
// Why it is built this way (owner report, k62: "insanely buggy, laggy, glitches
// the screen when they set"):
//  - The half-picked range is LOCAL state. It used to be the Wallet's own
//    state, so every day tap re-rendered the whole Wallet, and a first tap
//    (start set, end null) made the Wallet fall back to "This month" and swap
//    its numbers mid-pick. Now the Wallet hears about a range exactly once,
//    when Done is pressed with both ends chosen, AFTER the sheet has left.
//  - It is an overlay (Modal), so opening and closing it never changes the
//    page's height. Inline, it pushed Total drained down ~350dp in one frame
//    and Done pulled it back, which also made Android clamp the page scroll.
//  - The footer total comes from `quote` (which warms the Wallet's breakdown
//    cache), never from the Wallet's on-screen total: that was the PREVIOUS
//    range's figure sitting next to the new dates.
//  - "Takes like 10 taps to open" (owner, Oct 12 2026). The scrim and sheet
//    were Reanimated animated styles inside this freshly mounted Modal, and
//    their entrance was started in an effect before the Modal's views were
//    up. Those views kept the style they were FIRST rendered with (p=0: scrim
//    opacity 0, sheet one height below the screen) and never received an
//    update; on web this reproduces every time, on a phone it is a race with
//    how fast the Modal window mounts. Result: a mounted, INVISIBLE,
//    full-screen Modal whose scrim ate the next tap (closing it), then the
//    next tap reopened it, invisible again unless the race went the other
//    way. Now: core Animated with the native driver (the AppAlertHost
//    pattern, reliable in a Modal), the entrance starts from the sheet's own
//    onLayout (its views provably exist), open() is imperative (`ref.open()`)
//    so a tap re-renders only this component and a tap during the exit
//    re-opens instead of being a no-op on a `pickOpen` still true, and the
//    scrim ignores taps for IN_MS after the entrance starts so an impatient
//    second tap can't close what the first just opened. Don't move this back
//    to Reanimated, start the entrance from an effect, or add an `open` prop.
// =============================================================================

import React, { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Animated, Easing, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, motion, layout } from '../../theme/type';
import { formatCents } from '../../utils/calculations';
import { useReduceMotion } from './Primitives';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const IN_MS = 300;
const OUT_MS = 220;
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const EASE_OUT = Easing.bezier(...motion.easeOut);

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** Whole months from this month to d's month (negative = past). */
const monthOffset = (d: Date) => {
  const now = new Date();
  return (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
};

type CellState = 'end' | 'mid' | null;

/**
 * One day. Memoized on primitives with a stable `onTap`, so a tap re-renders
 * only the cells whose state actually changed, not all 42.
 */
const DayCell = memo(function DayCell({
  time,
  day,
  state,
  onTap,
  ink,
  gold,
  goldBg,
  goldSoft,
}: {
  time: number;
  day: number;
  state: CellState;
  onTap: (time: number) => void;
  ink: string;
  gold: string;
  goldBg: string;
  goldSoft: string;
}) {
  return (
    <View style={styles.cellWrap}>
      <Pressable
        onPress={() => onTap(time)}
        // Immediate feedback under the finger, before any render lands.
        style={({ pressed }) => [
          styles.cell,
          state === 'end' && { backgroundColor: goldBg },
          state === 'mid' && { backgroundColor: goldSoft },
          pressed && state !== 'end' && { backgroundColor: goldSoft },
        ]}
      >
        <Text style={[styles.cellText, { color: state === 'end' ? '#FFFFFF' : state === 'mid' ? gold : ink }]}>
          {day}
        </Text>
      </Pressable>
    </View>
  );
});

export type RangeCalendarHandle = { open: () => void };

export function RangeCalendar({
  ref,
  initialStart,
  initialEnd,
  quote,
  onClose,
}: {
  ref?: React.Ref<RangeCalendarHandle>;
  /** The range already applied, if any; the picker starts from it. */
  initialStart: Date | null;
  initialEnd: Date | null;
  /** Total drained for a complete range (end = 23:59:59.999 handled by the
   *  caller), or null if it can't be had. Only used for the footer. */
  quote: (start: Date, end: Date) => Promise<number | null>;
  /** Called once the sheet has finished leaving. `range` is the picked range
   *  when Done was pressed with both ends chosen; null means "change nothing". */
  onClose: (range: { start: Date; end: Date } | null) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();

  const [mounted, setMounted] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [offset, setOffset] = useState(0);
  const [quoted, setQuoted] = useState<{ key: string; cents: number } | null>(null);

  // Core Animated + native driver, NOT Reanimated: see the header.
  const p = useRef(new Animated.Value(0)).current;
  const sheetH = useRef(new Animated.Value(600)).current;
  const sheetY = useRef(Animated.multiply(Animated.subtract(1, p), sheetH)).current;
  const closing = useRef(false);
  /** When the entrance last started; the scrim ignores taps for IN_MS after. */
  const shownAt = useRef(0);
  /** Up (mounted) right now, and an entrance waiting for the sheet's layout. */
  const up = useRef(false);
  const wantIn = useRef(false);
  const slideIn = () => {
    wantIn.current = false;
    shownAt.current = Date.now();
    // From the CURRENT p: a re-open mid-exit turns around instead of jumping.
    Animated.timing(p, { toValue: 1, duration: IN_MS, easing: EASE_SHEET, useNativeDriver: true }).start();
  };
  const initial = useRef({ s: initialStart, e: initialEnd });
  initial.current = { s: initialStart, e: initialEnd };

  // Open: seed from the applied range. Every call opens, including one made
  // while the exit is still running (that exit is cancelled, see finish).
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        closing.current = false;
        const { s, e } = initial.current;
        setStart(s);
        setEnd(e);
        setOffset(e ? monthOffset(e) : 0);
        if (up.current) slideIn(); // still on screen (exiting): turn around now
        else {
          up.current = true;
          wantIn.current = true; // onSheetLayout starts it
          setMounted(true);
        }
      },
    }),
    []
  );

  // Footer total for a complete range. Keyed so a late answer for an older
  // pick can never land next to newer dates.
  const rangeKey = start && end ? `${start.getTime()}|${end.getTime()}` : null;
  useEffect(() => {
    if (!start || !end || !rangeKey) return;
    let live = true;
    quote(start, end)
      .then(cents => {
        if (live && cents != null) setQuoted({ key: rangeKey, cents });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const startRef = useRef(start);
  const endRef = useRef(end);
  startRef.current = start;
  endRef.current = end;

  /** First tap sets start; second sets end, swapping if the user picked backwards. */
  const tap = useCallback((time: number) => {
    const day = startOfDay(new Date(time));
    const s = startRef.current;
    if (!s || endRef.current) {
      setStart(day);
      setEnd(null);
    } else if (day < s) {
      setStart(day);
      setEnd(s);
    } else {
      setEnd(day);
    }
  }, []);

  // The picked range waits here rather than riding through the worklet:
  // a Date is not a value the UI runtime can carry back.
  const pending = useRef<{ start: Date; end: Date } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const finish = useCallback(() => {
    // Re-opened during the exit: stay up, change nothing.
    if (!closing.current) return;
    up.current = false;
    setMounted(false);
    onCloseRef.current(pending.current);
  }, []);

  const close = (apply: boolean) => {
    if (closing.current) return;
    closing.current = true;
    const s = startRef.current;
    const e = endRef.current;
    pending.current = apply && s && e ? { start: s, end: e } : null;
    // The Wallet applies the range only once the sheet is gone, so its
    // re-render never competes with the exit and the total rolls in view.
    // A re-open mid-exit stops this timing: finished=false, finish skipped.
    Animated.timing(p, { toValue: 0, duration: OUT_MS, easing: EASE_OUT, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) finish();
      }
    );
  };

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

  const sT = start?.getTime();
  const eT = end?.getTime();
  const stateOf = (t: number): CellState =>
    t === sT || t === eT ? 'end' : sT != null && eT != null && t > sT && t < eT ? 'mid' : null;

  const footer = !start
    ? 'Tap a start date'
    : !end
    ? 'Now tap an end date'
    : `${fmt(start)} – ${fmt(end)}${
        quoted && quoted.key === rangeKey ? ` · ${formatCents(quoted.cents)} drained` : ''
      }`;

  const scrimStyle = { opacity: p };
  const sheetStyle = reduce ? { opacity: p } : { transform: [{ translateY: sheetY }] };
  const onSheetLayout = (e: LayoutChangeEvent) => {
    sheetH.setValue(e.nativeEvent.layout.height);
    // The sheet's views exist natively now, so the animation can reach them.
    if (wantIn.current) slideIn();
  };
  // A second tap on the chip (made while a slow phone was still mounting the
  // sheet) lands here; it must not close what it just asked to open.
  const onScrim = () => {
    if (Date.now() - shownAt.current < IN_MS) return;
    close(false);
  };

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close(false)}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onScrim} />
      </Animated.View>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <Animated.View
          onLayout={onSheetLayout}
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.goldLine, paddingBottom: insets.bottom + 18 },
            sheetStyle,
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.line2 }]} />
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

          {/* Always six rows, so changing month never resizes the sheet. */}
          <View style={styles.grid}>
            {cells.map((d, i) =>
              d ? (
                <DayCell
                  key={i}
                  time={d.getTime()}
                  day={d.getDate()}
                  state={stateOf(d.getTime())}
                  onTap={tap}
                  ink={colors.ink}
                  gold={colors.gold}
                  goldBg={colors.goldBg}
                  goldSoft={colors.goldSoft}
                />
              ) : (
                <View key={i} style={styles.cellWrap} />
              )
            )}
          </View>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <Text style={[styles.footerText, { color: colors.mut }]} numberOfLines={1}>
              {footer}
            </Text>
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [styles.done, { backgroundColor: colors.goldBg, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ROW_H = 36;

const styles = StyleSheet.create({
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: layout.screenX,
    paddingTop: 10,
  },
  grabber: { width: 44, height: 5, borderRadius: radius.pill, alignSelf: 'center', marginBottom: 12 },
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
    alignContent: 'flex-start',
    marginTop: 4,
    height: ROW_H * 6,
  },
  cellWrap: {
    width: `${100 / 7}%`,
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
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

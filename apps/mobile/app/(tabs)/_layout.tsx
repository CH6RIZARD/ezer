// =============================================================================
// EZER Redesign — floating tab bar (handoff §9)
//
// Floating: 12px from the side edges, 14px from the bottom, `tabBg` under a
// blur, `line` border, r24. Four tabs in this order: Home, Pay in 4, Wallet,
// Savings. Active tab gets an `accSoft` pill behind an accent icon + 10px/700
// label.
//
// `saved` and `alerts` stay as routes (other screens still link to them) but
// are hidden from the bar — the handoff specifies exactly four tabs.
//
// HEADLESS TABS (expo-router/ui), not the bottom-tabs navigator, so that
// every tab stays MOUNTED AND LAID OUT while hidden. Both of bottom-tabs'
// ways of hiding an inactive tab — detaching its native view (the default)
// or `display: none` — made switching BACK cost a full re-layout/re-mount of
// that tab's whole view tree, scaling with its size: S22 frame timeline,
// Oct 2026: Savings 0.03s, Pay in 4 1.3s, Wallet 1.7s, Home 3.1s, with the
// drawing side idle for 2.3s of it. Here a hidden tab is just opacity 0 and
// untouchable, so a tab tap changes two style props and nothing else.
// =============================================================================

import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, InteractionManager, type PressableProps } from 'react-native';
import { Tabs, TabList, TabTrigger, TabSlot, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';
import { usePathname } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, motion, radius } from '../../theme/type';
import { useReduceMotion } from '../../components/redesign/Primitives';
import { LockWarmContext, LockOpenContext } from '../../components/LockGate';

const BAR_HEIGHT = 62;
const EDGE_X = 12;
const EDGE_BOTTOM = 14;
const BAR_PAD_X = 6;
const IND_W = 18;
const EASE = Easing.bezier(...motion.easeOut);

const TABS = [
  { name: 'home', href: '/home', icon: 'home-outline', label: 'Home' },
  { name: 'payin4', href: '/payin4', icon: 'card-outline', label: 'Pay in 4' },
  { name: 'wallet', href: '/wallet', icon: 'wallet-outline', label: 'Wallet' },
  // Ionicons has no piggy-bank glyph, and `save`/`save-outline` is a floppy
  // disk (save-a-file), which reads wrong here. The growth arrow is the
  // closest match for a savings/goals destination.
  { name: 'savings', href: '/savings', icon: 'trending-up-outline', label: 'Savings' },
] as const;

/**
 * One bar item. TabTrigger (asChild) hands it the press props + isFocused.
 * No filled pill behind the active tab (the owner disliked the square
 * highlight): the icon stays an OUTLINE and its stroke and label cross-fade
 * to the accent, with a slight lift. The sliding pill under the bar
 * (TabIndicator) carries the "moved from there to here" motion.
 */
function TabButton({
  icon,
  label,
  isFocused,
  reduce,
  ...press
}: PressableProps & {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  isFocused?: boolean;
  reduce?: boolean;
}) {
  const { colors } = useTheme();
  const focused = !!isFocused;
  const on = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    on.value = withTiming(focused ? 1 : 0, { duration: reduce ? 0 : 240, easing: EASE });
  }, [focused, reduce, on]);
  const fade = useAnimatedStyle(() => ({ opacity: on.value }));
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * on.value }, { scale: 1 + 0.08 * on.value }],
  }));
  return (
    <Pressable {...press} style={styles.slot} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
      <View style={styles.item}>
        <Animated.View style={lift}>
          <Ionicons name={icon} size={21} color={colors.mut2} />
          <Animated.View style={[StyleSheet.absoluteFill, fade]}>
            <Ionicons name={icon} size={21} color={colors.accInk} />
          </Animated.View>
        </Animated.View>
        <View>
          <Text style={[styles.label, { color: colors.mut2 }]} numberOfLines={1}>
            {label}
          </Text>
          <Animated.Text style={[styles.label, styles.labelOn, { color: colors.accInk }, fade]} numberOfLines={1}>
            {label}
          </Animated.Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Accent pill that slides along the bottom of the bar to the active tab. */
function TabIndicator({ index, barWidth, reduce }: { index: number; barWidth: number; reduce: boolean }) {
  const { colors } = useTheme();
  // barWidth is the outer width; the slots share what is left after the 1px
  // borders and the horizontal padding.
  const slot = (barWidth - 2 - BAR_PAD_X * 2) / TABS.length;
  const target = BAR_PAD_X + slot * Math.max(index, 0) + (slot - IND_W) / 2;
  const x = useSharedValue(target);
  const seen = useSharedValue(index >= 0 ? 1 : 0);
  useEffect(() => {
    const cfg = { duration: reduce ? 0 : 340, easing: EASE };
    x.value = withTiming(target, cfg);
    seen.value = withTiming(index >= 0 ? 1 : 0, cfg);
  }, [target, index, reduce, x, seen]);
  const st = useAnimatedStyle(() => ({ opacity: seen.value, transform: [{ translateX: x.value }] }));
  if (!barWidth) return null;
  return <Animated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: colors.accInk }, st]} />;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Only Home exists while the passcode keypad is up; the other three mount
  // the moment the code is accepted, during the splash breath, so they are
  // built before the first tap can reach them and never compete with typing
  // (S22: with all four mounting under the lock, the first digit took 3.9s
  // to show).
  const reduce = useReduceMotion();
  const pathname = usePathname();
  const activeIndex = TABS.findIndex(t => pathname === t.href || pathname.startsWith(t.href + '/'));
  const [barWidth, setBarWidth] = useState(0);
  const warm = useContext(LockWarmContext);
  const open = useContext(LockOpenContext);
  // The other three tabs are built one at a time AFTER the lock has lifted
  // and the UI is idle, 1.2s apart, so they are ready before most first taps
  // without ever queueing a tap behind three mounts at once (k62: mounting
  // all three at unlock made taps in the next seconds wait ~4s). A tab
  // tapped before its turn simply mounts then, as a lazy tab would.
  const [prewarmed, setPrewarmed] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    ['payin4', 'wallet', 'savings'].forEach((name, i) => {
      timers.push(
        setTimeout(() => {
          InteractionManager.runAfterInteractions(() => setPrewarmed(p => (p.includes(name) ? p : [...p, name])));
        }, 1200 * (i + 1))
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [open]);

  // Every tab switch re-renders this slot, and descriptor.render() returns a
  // NEW element each time; neither react-navigation's SceneView nor
  // expo-router memoises screens. So each switch re-rendered ALL FOUR tabs
  // (Home alone is up to 0.6s on the k62). Handing React the SAME element
  // makes it skip the subtree: screens still update from their own state and
  // contexts, and focus effects still fire (they are navigation events, not
  // props). Re-created only when the route object changes (new params).
  const elements = useRef(new Map<string, { route: unknown; el: React.ReactNode }>());

  const renderTab = useCallback(
    (descriptor: TabsDescriptor, { isFocused, loaded }: TabsSlotRenderOptions) => {
      if (!isFocused && !loaded && !prewarmed.includes(descriptor.route.name)) return null;
      let cached = elements.current.get(descriptor.route.key);
      if (!cached || cached.route !== descriptor.route) {
        cached = { route: descriptor.route, el: descriptor.render() };
        elements.current.set(descriptor.route.key, cached);
      }
      return (
        <View
          key={descriptor.route.key}
          style={[StyleSheet.absoluteFill, isFocused ? styles.shown : styles.hidden]}
          pointerEvents={isFocused ? 'auto' : 'none'}
          collapsable={false}
          accessibilityElementsHidden={!isFocused}
          importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}
        >
          {cached.el}
        </View>
      );
    },
    [prewarmed]
  );

  // Nothing of the tabs exists under the passcode keypad: mounting Home there
  // (it renders 3-4 times while the first data arrives) queued the keypad's
  // own renders behind it — k62: first digit 4.3s, 0.07s with this. Home
  // mounts the moment the code is accepted, during the splash breath, which
  // cannot lift before that first render completes.
  if (!warm) return <View style={[styles.fill, { backgroundColor: colors.bg }]} />;

  return (
    <Tabs style={styles.fill}>
      <TabSlot renderFn={renderTab} detachInactiveScreens={false} style={styles.fill} />
      {/* The bar floats over content, so screens pad their own bottom by
          layout.contentBottom (96) to clear it. A solid fill, not a blur
          over content — `tabBg` is fully opaque: the handoff called for a
          blurred glass bar, but scrolled content showing through the tab
          labels read as a bug, not a design choice. */}
      <TabList
        style={[
          styles.bar,
          { bottom: EDGE_BOTTOM + insets.bottom, borderColor: colors.line, backgroundColor: colors.tabBg },
        ]}
        onLayout={e => setBarWidth(e.nativeEvent.layout.width)}
      >
        <TabIndicator index={activeIndex} barWidth={barWidth} reduce={reduce} />
        {TABS.map(t => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton icon={t.icon} label={t.label} reduce={reduce} />
          </TabTrigger>
        ))}
        {/* Reachable by route, not shown in the bar. */}
        <TabTrigger name="saved" href="/saved" style={styles.none} />
        <TabTrigger name="alerts" href="/alerts" style={styles.none} />
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shown: { opacity: 1, zIndex: 1 },
  hidden: { opacity: 0, zIndex: 0 },
  none: { display: 'none' },
  bar: {
    position: 'absolute',
    left: EDGE_X,
    right: EDGE_X,
    // Above the tab wrappers (which carry zIndex 1 inside the slot): without
    // this Android drew the focused tab over the bar and it never showed.
    zIndex: 10,
    height: BAR_HEIGHT,
    borderRadius: radius.tabBar,
    borderWidth: 1,
    paddingHorizontal: BAR_PAD_X,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  slot: {
    flex: 1,
    height: BAR_HEIGHT,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 62,
  },
  labelOn: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 5,
    width: IND_W,
    height: 3,
    borderRadius: 2,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
});

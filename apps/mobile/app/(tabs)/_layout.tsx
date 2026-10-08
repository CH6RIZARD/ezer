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

import React, { useCallback, useContext } from 'react';
import { View, Text, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { Tabs, TabList, TabTrigger, TabSlot, type TabsDescriptor, type TabsSlotRenderOptions } from 'expo-router/ui';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius } from '../../theme/type';
import { LockWarmContext } from '../../components/LockGate';

const BAR_HEIGHT = 62;
const EDGE_X = 12;
const EDGE_BOTTOM = 14;

const TABS = [
  { name: 'home', href: '/home', icon: 'home-outline', iconActive: 'home', label: 'Home' },
  { name: 'payin4', href: '/payin4', icon: 'card-outline', iconActive: 'card', label: 'Pay in 4' },
  { name: 'wallet', href: '/wallet', icon: 'wallet-outline', iconActive: 'wallet', label: 'Wallet' },
  // Ionicons has no piggy-bank glyph, and `save`/`save-outline` is a floppy
  // disk (save-a-file), which reads wrong here. The growth arrow is the
  // closest match for a savings/goals destination.
  { name: 'savings', href: '/savings', icon: 'trending-up-outline', iconActive: 'trending-up', label: 'Savings' },
] as const;

/** One bar item. TabTrigger (asChild) hands it the press props + isFocused. */
function TabButton({
  icon,
  iconActive,
  label,
  isFocused,
  ...press
}: PressableProps & {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  isFocused?: boolean;
}) {
  const { colors } = useTheme();
  const focused = !!isFocused;
  return (
    <Pressable {...press} style={styles.slot} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
      <View style={[styles.item, focused && { backgroundColor: colors.accSoft }]}>
        <Ionicons name={focused ? iconActive : icon} size={20} color={focused ? colors.accInk : colors.mut2} />
        <Text style={[styles.label, { color: focused ? colors.accInk : colors.mut2 }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Only Home exists while the passcode keypad is up; the other three mount
  // the moment the code is accepted, during the splash breath, so they are
  // built before the first tap can reach them and never compete with typing
  // (S22: with all four mounting under the lock, the first digit took 3.9s
  // to show).
  const warm = useContext(LockWarmContext);

  const renderTab = useCallback(
    (descriptor: TabsDescriptor, { isFocused, loaded }: TabsSlotRenderOptions) => {
      if (!isFocused && !loaded && !warm) return null;
      return (
        <View
          key={descriptor.route.key}
          style={[StyleSheet.absoluteFill, isFocused ? styles.shown : styles.hidden]}
          pointerEvents={isFocused ? 'auto' : 'none'}
          collapsable={false}
          accessibilityElementsHidden={!isFocused}
          importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}
        >
          {descriptor.render()}
        </View>
      );
    },
    [warm]
  );

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
      >
        {TABS.map(t => (
          <TabTrigger key={t.name} name={t.name} href={t.href} asChild>
            <TabButton icon={t.icon} iconActive={t.iconActive} label={t.label} />
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
    height: BAR_HEIGHT,
    borderRadius: radius.tabBar,
    borderWidth: 1,
    paddingHorizontal: 6,
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    minWidth: 62,
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
  },
});

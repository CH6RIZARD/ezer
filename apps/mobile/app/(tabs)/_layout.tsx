// =============================================================================
// EZER Redesign — floating tab bar (handoff §9)
//
// Floating: 12px from the side edges, 14px from the bottom, `tabBg` under a
// blur, `line` border, r24. Four tabs in this order: Home, Pay in 4, Wallet,
// Savings. Active tab gets an `accSoft` pill behind an accent icon + 10px/700
// label.
//
// `saved` and `alerts` stay as routes (other screens still link to them) but
// are hidden from the bar with href: null — the handoff specifies exactly four
// tabs.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, radius } from '../../theme/type';

const BAR_HEIGHT = 62;
const EDGE_X = 12;
const EDGE_BOTTOM = 14;

function TabItem({
  icon,
  iconActive,
  label,
  focused,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  focused: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.item,
        focused && { backgroundColor: colors.accSoft },
      ]}
    >
      <Ionicons
        name={focused ? iconActive : icon}
        size={20}
        color={focused ? colors.accInk : colors.mut2}
      />
      <Text
        style={[
          styles.label,
          { color: focused ? colors.accInk : colors.mut2 },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // The bar floats over content, so screens pad their own bottom by
        // layout.contentBottom (96) to clear it.
        tabBarStyle: {
          position: 'absolute',
          left: EDGE_X,
          right: EDGE_X,
          bottom: EDGE_BOTTOM + insets.bottom,
          height: BAR_HEIGHT,
          borderRadius: radius.tabBar,
          borderWidth: 1,
          borderColor: colors.line,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: 'transparent',
          elevation: 0,
          paddingHorizontal: 6,
          // RN clips the blur to the rounded corners only with overflow hidden.
          overflow: 'hidden',
        },
        tabBarItemStyle: {
          height: BAR_HEIGHT,
          paddingVertical: 8,
        },
        // A solid fill, not a blur over content — `tabBg` is fully opaque now.
        // The handoff called for a blurred glass bar, but scrolled content
        // showing through the tab labels read as a bug, not a design choice.
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBg }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem icon="home-outline" iconActive="home" label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="payin4"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem icon="card-outline" iconActive="card" label="Pay in 4" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem icon="wallet-outline" iconActive="wallet" label="Wallet" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="savings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabItem
              // Ionicons has no piggy-bank glyph, and `save`/`save-outline` is a
              // floppy disk (save-a-file), which reads wrong here. The growth
              // arrow is the closest match for a savings/goals destination.
              icon="trending-up-outline"
              iconActive="trending-up"
              label="Savings"
              focused={focused}
            />
          ),
        }}
      />
      {/* Reachable by route, not shown in the bar. */}
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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

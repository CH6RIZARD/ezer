// =============================================================================
// EZER Redesign — Home day popover (handoff §2)
//
// Scrim rgba(20,10,46,.42) + blur. Sheet anchored above the tab bar: `card`
// r22, spring-up. Serif italic date title, ✕ close. Rows: 38px logo, name,
// type label ("Renewal" / "Trial ends — becomes $X/mo"), amount in `red`.
// Footer: "Day total" + serif italic sum. Rows open Subscription Detail.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { fontFamily, typeScale, radius, motion, layout } from '../../theme/type';
import { formatCents } from '../../utils/calculations';
import MerchantMark from './MerchantMark';

export interface DayEvent {
  id: string;
  merchantId: string;
  /**
   * Kept separate from merchantId. They used to be conflated — merchantId held
   * a subscription id — which meant logo lookup and routing were fighting over
   * one field, and only one of them could be right.
   */
  subscriptionId: string;
  merchantName: string;
  amountCents: number;
  type: 'renewal' | 'trial';
  /** For trials: the price once it converts. */
  afterTrialCents?: number;
  /** Plaid-enriched merchant logo, when the API supplies one. */
  logo?: string;
}

export function DayPopover({
  visible,
  date,
  events,
  onClose,
  onSelect,
}: {
  visible: boolean;
  date: Date | null;
  events: DayEvent[];
  onClose: () => void;
  onSelect?: (e: DayEvent) => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: motion.popover,
        // Overshooting spring-up from the handoff.
        easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, anim]);

  const total = events.reduce((s, e) => s + e.amountCents, 0);

  const title = date
    ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fill} onPress={onClose}>
        <BlurView intensity={12} tint={isDark ? 'dark' : 'light'} style={styles.fill}>
          <View style={[styles.fill, { backgroundColor: colors.scrim }]} />
        </BlurView>
      </Pressable>

      <Animated.View
        // Anchored above the floating tab bar.
        style={[
          styles.sheetWrap,
          {
            bottom: layout.contentBottom + insets.bottom - 40,
            opacity: anim,
            transform: [
              { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            ],
          },
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, borderColor: colors.line },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={[typeScale.serifTitle, { color: colors.ink, flex: 1 }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={20} color={colors.mut} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {events.map(e => (
              <Pressable
                key={e.id}
                onPress={() => onSelect?.(e)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                <MerchantMark
                  name={e.merchantName}
                  merchantId={e.merchantId}
                  logoUrl={e.logo}
                  size={38}
                />
                <View style={styles.rowText}>
                  <Text style={[styles.rowName, { color: colors.ink }]} numberOfLines={1}>
                    {e.merchantName}
                  </Text>
                  <Text style={[styles.rowType, { color: colors.mut }]} numberOfLines={1}>
                    {e.type === 'trial'
                      ? `Trial ends — becomes ${formatCents(e.afterTrialCents ?? e.amountCents)}/mo`
                      : 'Renewal'}
                  </Text>
                </View>
                <Text style={[styles.rowAmount, { color: colors.red }]}>
                  {formatCents(e.amountCents)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <Text style={[typeScale.label, { color: colors.mut }]}>Day total</Text>
            <Text style={[typeScale.statValue, { color: colors.ink }]}>{formatCents(total)}</Text>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  sheetWrap: {
    position: 'absolute',
    left: layout.screenX,
    right: layout.screenX,
  },
  sheet: {
    borderRadius: radius.hero,
    borderWidth: 1,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 11,
  },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: fontFamily.bold,
    fontSize: 14.5,
  },
  rowType: {
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    marginTop: 2,
  },
  rowAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  footer: {
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default DayPopover;

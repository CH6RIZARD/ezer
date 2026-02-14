import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '@/theme/spacing';
import { formatCurrency } from '@/utils/format';

interface LiquidityPanelProps {
  totalBalance: number;
  cashAvailable: number;
  onPressMoveMoney: () => void;
}

export function LiquidityPanel({
  totalBalance,
  cashAvailable,
  onPressMoveMoney,
}: LiquidityPanelProps) {
  const [pressed, setPressed] = React.useState(false);

  return (
    <View style={styles.container}>
      {/* Layered background cards for depth effect */}
      <View style={styles.backgroundLayer2} />
      <View style={styles.backgroundLayer1} />

      {/* Main card */}
      <View style={styles.mainCard}>
        <View style={styles.header}>
          <Text style={styles.headerLabel}>Total Savings</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Active</Text>
          </View>
        </View>

        <Text style={styles.balanceAmount}>
          {formatCurrency(totalBalance, false)}
        </Text>

        <View style={styles.divider} />

        <View style={styles.cashRow}>
          <View style={styles.cashInfo}>
            <Text style={styles.cashLabel}>Cash Available</Text>
            <Text style={styles.cashAmount}>{formatCurrency(cashAvailable)}</Text>
          </View>

          <Pressable
            onPress={onPressMoveMoney}
            onPressIn={() => setPressed(true)}
            onPressOut={() => setPressed(false)}
            style={[styles.actionButton, pressed && styles.actionButtonPressed]}
            accessibilityLabel="Move money"
            accessibilityRole="button"
          >
            <Text style={styles.actionButtonIcon}>↔</Text>
            <Text style={styles.actionButtonText}>Move Money</Text>
          </Pressable>
        </View>

        {/* Quick stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>+$142</Text>
            <Text style={styles.statLabel}>This month</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>4</Text>
            <Text style={styles.statLabel}>Active buckets</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>92%</Text>
            <Text style={styles.statLabel}>On track</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  backgroundLayer2: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: -8,
    bottom: -8,
    backgroundColor: colors.primaryMuted,
    borderRadius: borderRadius.xl,
    opacity: 0.5,
  },
  backgroundLayer1: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.xl,
    opacity: 0.3,
  },
  mainCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadow.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLabel: {
    fontSize: fontSize.sm,
    color: colors.primaryMuted,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4ADE80',
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.textInverse,
    fontWeight: fontWeight.medium,
  },
  balanceAmount: {
    fontSize: fontSize.hero,
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: spacing.lg,
  },
  cashRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cashInfo: {
    flex: 1,
  },
  cashLabel: {
    fontSize: fontSize.sm,
    color: colors.primaryMuted,
    marginBottom: spacing.xs,
  },
  cashAmount: {
    fontSize: fontSize.xl,
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  actionButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    transform: [{ scale: 0.98 }],
  },
  actionButtonIcon: {
    fontSize: fontSize.lg,
    color: colors.textInverse,
    marginRight: spacing.sm,
  },
  actionButtonText: {
    fontSize: fontSize.md,
    color: colors.textInverse,
    fontWeight: fontWeight.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.lg,
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.primaryMuted,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});

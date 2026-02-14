import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '@/theme/spacing';
import { formatRelativeTime } from '@/utils/format';

interface ConnectedAccount {
  bankName: string;
  accountName: string;
  last4: string;
  lastSyncedAt: string;
}

interface ConnectedAccountCardProps {
  account: ConnectedAccount;
  onPress?: () => void;
}

export function ConnectedAccountCard({
  account,
  onPress,
}: ConnectedAccountCardProps) {
  const { bankName, accountName, last4, lastSyncedAt } = account;

  const getBankIcon = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.includes('chase')) return '🏦';
    if (lower.includes('wells')) return '🏛️';
    if (lower.includes('bank of america') || lower.includes('bofa')) return '🏢';
    if (lower.includes('citi')) return '🏬';
    if (lower.includes('capital one')) return '💳';
    return '🏦';
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed && onPress && styles.containerPressed,
      ]}
      accessibilityLabel={`Connected account: ${bankName} ${accountName} ending in ${last4}`}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <View style={styles.header}>
        <Text style={styles.sectionTitle}>Connected Account</Text>
        <View style={styles.syncBadge}>
          <View style={styles.syncDot} />
          <Text style={styles.syncText}>Synced {formatRelativeTime(lastSyncedAt)}</Text>
        </View>
      </View>

      <View style={styles.accountRow}>
        <View style={styles.bankIcon}>
          <Text style={styles.bankIconText}>{getBankIcon(bankName)}</Text>
        </View>

        <View style={styles.accountInfo}>
          <Text style={styles.bankName}>{bankName}</Text>
          <Text style={styles.accountDetails}>
            {accountName} •••• {last4}
          </Text>
        </View>

        {onPress && (
          <View style={styles.chevronContainer}>
            <Text style={styles.chevron}>›</Text>
          </View>
        )}
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          accessibilityLabel="Refresh account sync"
          accessibilityRole="button"
        >
          <Text style={styles.actionIcon}>↻</Text>
          <Text style={styles.actionText}>Refresh</Text>
        </Pressable>

        <View style={styles.actionDivider} />

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          accessibilityLabel="Manage connected account"
          accessibilityRole="button"
        >
          <Text style={styles.actionIcon}>⚙️</Text>
          <Text style={styles.actionText}>Manage</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  containerPressed: {
    backgroundColor: colors.backgroundCream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: spacing.xs,
  },
  syncText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  bankIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundCream,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  bankIconText: {
    fontSize: 24,
  },
  accountInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  accountDetails: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  chevronContainer: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    fontSize: 24,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  actionButtonPressed: {
    backgroundColor: colors.backgroundCream,
  },
  actionIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  actionText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  actionDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.sm,
  },
});

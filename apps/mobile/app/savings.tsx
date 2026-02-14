import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight } from '@/theme/spacing';
import { LiquidityPanel } from '@/components/LiquidityPanel';
import { SavingsBucketCard } from '@/components/SavingsBucketCard';
import { CashAdvancePanel } from '@/components/CashAdvancePanel';
import { ConnectedAccountCard } from '@/components/ConnectedAccountCard';

// ============================================
// DATA CONTRACTS
// ============================================

type SavingsGoal = {
  id: string;
  name: string;
  icon: string;
  currentAmount: number;
  targetAmount: number;
};

type ConnectedAccount = {
  bankName: string;
  accountName: string;
  last4: string;
  lastSyncedAt: string;
};

// ============================================
// DUMMY DATA
// ============================================

const DUMMY_GOALS: SavingsGoal[] = [
  {
    id: '1',
    name: 'Emergency Fund',
    icon: '🛡️',
    currentAmount: 2400,
    targetAmount: 5000,
  },
  {
    id: '2',
    name: 'Vacation',
    icon: '✈️',
    currentAmount: 1800,
    targetAmount: 3000,
  },
  {
    id: '3',
    name: 'New Car',
    icon: '🚗',
    currentAmount: 8500,
    targetAmount: 15000,
  },
  {
    id: '4',
    name: 'Home Down Payment',
    icon: '🏠',
    currentAmount: 25000,
    targetAmount: 25000,
  },
];

const DUMMY_ACCOUNT: ConnectedAccount = {
  bankName: 'Chase',
  accountName: 'Checking',
  last4: '4521',
  lastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

// ============================================
// MAIN SCREEN COMPONENT
// ============================================

export default function SavingsScreen() {
  // ============================================
  // STATE - Preserving existing logic semantics
  // ============================================

  const [totalBalance] = useState(37700);
  const [cashAvailable] = useState(1245.67);
  const [goals] = useState<SavingsGoal[]>(DUMMY_GOALS);
  const [connectedAccount] = useState<ConnectedAccount>(DUMMY_ACCOUNT);

  // Cash Advance limit
  const [cashAdvanceLimit] = useState(1500);

  // ============================================
  // HANDLERS
  // ============================================

  const onPressMoveMoney = useCallback(() => {
    console.log('[SavingsScreen] onPressMoveMoney');
    // Existing handler - no change to logic
  }, []);

  const onPressGoal = useCallback((goalId: string) => {
    console.log('[SavingsScreen] onPressGoal:', goalId);
    // Existing handler - no change to logic
  }, []);

  const onPressAddFunds = useCallback((goalId: string) => {
    console.log('[SavingsScreen] onPressAddFunds:', goalId);
    // Existing handler - no change to logic
  }, []);

  const onRequestAdvance = useCallback((amount: number) => {
    console.log('[SavingsScreen] onRequestAdvance:', amount);
    router.push('/screens/CashAdvanceFlow');
  }, []);

  const onPressBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  // ============================================
  // RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onPressBack}
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Savings</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerButton}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
          >
            <Text style={styles.headerButtonIcon}>🔔</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Liquidity Panel Hero */}
        <LiquidityPanel
          totalBalance={totalBalance}
          cashAvailable={cashAvailable}
          onPressMoveMoney={onPressMoveMoney}
        />

        {/* Buckets Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Buckets</Text>
            <Pressable
              style={styles.seeAllButton}
              accessibilityLabel="See all buckets"
              accessibilityRole="button"
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          <View style={styles.bucketsContainer}>
            {goals.map((goal) => (
              <SavingsBucketCard
                key={goal.id}
                goal={goal}
                onPress={() => onPressGoal(goal.id)}
                onPressAddFunds={() => onPressAddFunds(goal.id)}
              />
            ))}
          </View>
        </View>

        {/* Cash Advance Section */}
        <View style={[styles.section, { paddingHorizontal: spacing.lg }]}>
          <CashAdvancePanel
            maxAmount={cashAdvanceLimit}
            onRequestAdvance={onRequestAdvance}
          />
        </View>

        {/* Connected Account Section */}
        <View style={styles.section}>
          <ConnectedAccountCard account={connectedAccount} />
        </View>

        {/* Bottom spacing for tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 24,
    color: colors.textPrimary,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIcon: {
    fontSize: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  seeAllButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  seeAllText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.medium,
  },
  bucketsContainer: {
    paddingHorizontal: spacing.lg,
  },
  bottomSpacer: {
    height: 100,
  },
});

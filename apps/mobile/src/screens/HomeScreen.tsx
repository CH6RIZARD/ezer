import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';
import { HomeSummary } from '@ezer/shared';

export default function HomeScreen({ navigation }: any) {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = async () => {
    try {
      const result = await api.getHomeSummary();
      if (result.success) {
        setSummary(result.data);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSummary} />}
      >
        <Text variant="heading" style={styles.title}>
          Your Subscriptions
        </Text>

        <Card style={styles.card}>
          <Text variant="caption" color={theme.colors.textSecondary}>
            Monthly Burn Rate
          </Text>
          <Text variant="huge" color={theme.colors.redDrain}>
            {summary ? formatCurrency(summary.monthlyBurnRate) : '--'}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="caption" color={theme.colors.textSecondary}>
            Next 30-Day Risk
          </Text>
          <Text variant="huge" color={theme.colors.danger}>
            {summary ? formatCurrency(summary.next30DayRisk) : '--'}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="caption" color={theme.colors.textSecondary}>
            Silent Subscriptions
          </Text>
          <Text variant="huge" color={theme.colors.charcoal}>
            {summary?.silentSubscriptionsCount || 0}
          </Text>
        </Card>

        <Button
          variant="primary"
          size="lg"
          onPress={() => navigation.navigate('Risks')}
          style={styles.primaryAction}
        >
          Review Risks
        </Button>

        <View style={styles.secondaryActions}>
          <Button
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Wallet')}
          >
            Wallet
          </Button>
          <Button
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Trials')}
          >
            Trials ({summary?.activeTrials || 0})
          </Button>
          <Button
            variant="ghost"
            size="md"
            onPress={() => navigation.navigate('Ledger')}
          >
            Ledger
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  primaryAction: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: theme.spacing.sm,
  },
});

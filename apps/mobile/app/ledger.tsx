import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';

export default function LedgerScreen() {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          Reclaimed Ledger
        </Text>

        <Card style={styles.card}>
          <Text variant="caption">Reclaimed This Month</Text>
          <Text variant="huge" color={theme.colors.success}>
            {formatCurrency(0)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="subheading">Allocations</Text>
          <Text variant="caption" style={styles.emptyState}>
            No allocations yet. Cancel a subscription to start reallocating.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
  },
  title: {
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.md,
  },
  emptyState: {
    marginTop: theme.spacing.md,
    fontStyle: 'italic',
  },
});

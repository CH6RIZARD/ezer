import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';

export default function SubscriptionDetailScreen({ route, navigation }: any) {
  const { id } = route.params;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const result = await api.getSubscriptionDetail(id);
      if (result.success) {
        setSubscription(result.data);
      }
    } catch (error) {
      console.error('Failed to load subscription:', error);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (!subscription) return null;

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          {subscription.merchantName}
        </Text>

        <Card style={styles.card}>
          <Text variant="caption">Lifetime Cost</Text>
          <Text variant="huge" color={theme.colors.redDrain}>
            {formatCurrency(subscription.lifetimeCostCents)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="caption">If Invested Instead (7% annual)</Text>
          <Text variant="huge" color={theme.colors.success}>
            {formatCurrency(subscription.investmentOpportunityCostCents)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text variant="caption">Cancellation Difficulty</Text>
          <Text variant="subheading">{subscription.difficultyLabel}</Text>
        </Card>

        <Button
          variant="danger"
          size="lg"
          onPress={() => navigation.navigate('CancelFlow', { subscriptionId: id })}
          style={styles.cancelButton}
        >
          Cancel Subscription
        </Button>
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
  cancelButton: {
    marginTop: theme.spacing.lg,
  },
});

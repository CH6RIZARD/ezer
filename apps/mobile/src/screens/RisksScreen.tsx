import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';

export default function RisksScreen({ navigation }: any) {
  const [risks, setRisks] = useState<any[]>([]);

  useEffect(() => {
    loadRisks();
  }, []);

  const loadRisks = async () => {
    try {
      const result = await api.getRisks(30);
      if (result.success) {
        setRisks(result.data);
      }
    } catch (error) {
      console.error('Failed to load risks:', error);
    }
  };

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <Text variant="heading" style={styles.title}>
        Next 30 Days
      </Text>

      <FlatList
        data={risks}
        renderItem={({ item }) => (
          <Card style={styles.riskCard}>
            <View style={styles.riskRow}>
              <View style={styles.riskInfo}>
                <Text variant="subheading">{item.merchantName}</Text>
                <Text variant="caption">
                  {item.type === 'trial' ? 'Trial Ending' : 'Renewal'} • {item.daysUntilDue} days
                </Text>
              </View>
              <Text variant="subheading" color={theme.colors.danger}>
                {formatCurrency(item.amountCents)}
              </Text>
            </View>
            <Button
              variant="primary"
              size="sm"
              onPress={() =>
                item.type === 'trial'
                  ? navigation.navigate('TrialDecision', { id: item.trialId })
                  : navigation.navigate('SubscriptionDetail', { id: item.subscriptionId })
              }
              style={styles.actionButton}
            >
              {item.type === 'trial' ? 'Set Default' : 'Act'}
            </Button>
          </Card>
        )}
        keyExtractor={(item) => item.id}
      />
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
  riskCard: {
    marginBottom: theme.spacing.md,
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  riskInfo: {
    flex: 1,
  },
  actionButton: {
    marginTop: theme.spacing.sm,
  },
});

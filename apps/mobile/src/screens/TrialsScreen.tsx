import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';

export default function TrialsScreen({ navigation }: any) {
  const [trials, setTrials] = useState<any[]>([]);

  useEffect(() => {
    loadTrials();
  }, []);

  const loadTrials = async () => {
    try {
      const result = await api.getTrials();
      if (result.success) {
        setTrials(result.data);
      }
    } catch (error) {
      console.error('Failed to load trials:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="heading" style={styles.title}>
        Active Trials
      </Text>

      <FlatList
        data={trials}
        renderItem={({ item }) => (
          <Card style={styles.trialCard}>
            <Text variant="subheading">{item.merchantName}</Text>
            <Text variant="body" color={theme.colors.danger}>
              {item.daysRemaining} days remaining
            </Text>
            <Button
              variant="primary"
              size="sm"
              onPress={() => navigation.navigate('TrialDecision', { id: item.id })}
              style={styles.actionButton}
            >
              {item.hasDecisionRule ? 'Update Decision' : 'Set Default'}
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
  trialCard: {
    marginBottom: theme.spacing.md,
  },
  actionButton: {
    marginTop: theme.spacing.md,
  },
});

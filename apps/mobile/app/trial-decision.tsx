import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Text, Button, Card } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../src/api/client';

export default function TrialDecisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ruleType, setRuleType] = useState('autoCancel');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await api.createTrialDecision(id as string, { ruleType });
      Alert.alert('Success', 'Decision rule saved');
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView>
        <Text variant="heading" style={styles.title}>
          Trial Decision
        </Text>

        <Card style={styles.optionCard}>
          <Button
            variant={ruleType === 'autoCancel' ? 'primary' : 'ghost'}
            onPress={() => setRuleType('autoCancel')}
          >
            Auto-cancel before trial ends
          </Button>
        </Card>

        <Card style={styles.optionCard}>
          <Button
            variant={ruleType === 'convertIfUsage' ? 'primary' : 'ghost'}
            onPress={() => setRuleType('convertIfUsage')}
          >
            Convert only if I use it
          </Button>
        </Card>

        <Card style={styles.optionCard}>
          <Button
            variant={ruleType === 'convertIfBalance' ? 'primary' : 'ghost'}
            onPress={() => setRuleType('convertIfBalance')}
          >
            Convert only if balance allows
          </Button>
        </Card>

        <Button
          variant="primary"
          size="lg"
          onPress={handleConfirm}
          loading={loading}
          style={styles.confirmButton}
        >
          Confirm Default
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
  optionCard: {
    marginBottom: theme.spacing.md,
  },
  confirmButton: {
    marginTop: theme.spacing.lg,
  },
});

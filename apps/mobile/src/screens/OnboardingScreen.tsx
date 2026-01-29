import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button } from '@ezer/ui';
import { theme } from '@ezer/ui';
import { api } from '../api/client';

export default function OnboardingScreen({ navigation }: any) {
  const [loading, setLoading] = useState(false);

  const handleProviderSelect = async (provider: 'google' | 'apple' | 'microsoft') => {
    setLoading(true);
    try {
      const result = await api.devLogin(provider);
      if (result.success) {
        // Auto-connect mock inbox
        const inboxProvider = provider === 'google' ? 'gmail' : provider === 'microsoft' ? 'outlook' : 'gmail';
        await api.mockInbox(inboxProvider);
        navigation.replace('Home');
      } else {
        Alert.alert('Error', result.error || 'Login failed');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="huge" style={styles.title}>
          EZER
        </Text>
        <Text variant="subheading" style={styles.subtitle}>
          Turn subscriptions into explicit decisions
        </Text>

        <View style={styles.buttons}>
          <Button
            variant="primary"
            size="lg"
            onPress={() => handleProviderSelect('google')}
            loading={loading}
            style={styles.button}
          >
            Continue with Google
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onPress={() => handleProviderSelect('apple')}
            loading={loading}
            style={styles.button}
          >
            Continue with Apple
          </Button>

          <Button
            variant="ghost"
            size="lg"
            onPress={() => handleProviderSelect('microsoft')}
            loading={loading}
            style={styles.button}
          >
            Continue with Microsoft
          </Button>
        </View>

        <Text variant="caption" style={styles.note}>
          DEV MODE: Using simulator for local development
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  title: {
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    letterSpacing: 2,
  },
  subtitle: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xxl,
  },
  buttons: {
    gap: theme.spacing.md,
  },
  button: {
    width: '100%',
  },
  note: {
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
});

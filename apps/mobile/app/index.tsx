import React, { useState } from 'react';
import { View, Text as RNText, StyleSheet, Alert, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

// Use basic RN components to avoid module resolution issues on web
const COLORS = {
  charcoal: '#1F2933',
  offWhite: '#F7F7F5',
  softGold: '#C4A15A',
  gray600: '#4B5563',
};

export default function OnboardingScreen() {
  const [loading, setLoading] = useState(false);

  const handleProviderSelect = async (provider: 'google' | 'apple' | 'microsoft') => {
    setLoading(true);
    try {
      // For now, just navigate to home directly for testing
      router.replace('/home');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <RNText style={styles.hello}>HELLO EZER</RNText>

        <RNText style={styles.title}>EZER</RNText>
        <RNText style={styles.subtitle}>
          Turn subscriptions into explicit decisions
        </RNText>

        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.primaryButton]}
            onPress={() => handleProviderSelect('google')}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <RNText style={styles.buttonText}>Continue with Google</RNText>
            )}
          </Pressable>

          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={() => handleProviderSelect('apple')}
            disabled={loading}
          >
            <RNText style={styles.secondaryButtonText}>Continue with Apple</RNText>
          </Pressable>

          <Pressable
            style={[styles.button, styles.ghostButton]}
            onPress={() => handleProviderSelect('microsoft')}
            disabled={loading}
          >
            <RNText style={styles.ghostButtonText}>Continue with Microsoft</RNText>
          </Pressable>
        </View>

        <RNText style={styles.note}>
          DEV MODE: Using simulator for local development
        </RNText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.offWhite,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
  },
  hello: {
    fontSize: 64,
    fontWeight: '900',
    textAlign: 'center',
    color: COLORS.softGold,
    marginBottom: 32,
  },
  title: {
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
    color: COLORS.charcoal,
    marginBottom: 16,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    color: COLORS.gray600,
    marginBottom: 48,
  },
  buttons: {
    gap: 16,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.softGold,
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: COLORS.charcoal,
  },
  ghostButton: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: COLORS.charcoal,
    fontSize: 16,
    fontWeight: '600',
  },
  ghostButtonText: {
    color: COLORS.charcoal,
    fontSize: 16,
    fontWeight: '500',
  },
  note: {
    fontSize: 14,
    textAlign: 'center',
    color: COLORS.gray600,
    marginTop: 32,
  },
});

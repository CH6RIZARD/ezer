// =============================================================================
// EZER Mobile App - Onboarding Screen
// Entry point with OAuth provider selection (DEV MODE: bypasses to tabs)
// =============================================================================

import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { Button } from '../components';

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState<string | null>(null);

  const handleProviderSelect = async (provider: 'google' | 'apple' | 'microsoft') => {
    setLoading(provider);

    // DEV MODE: Bypass OAuth, navigate directly to tabs after short delay
    setTimeout(() => {
      setLoading(null);
      router.replace('/(tabs)/home');
    }, 500);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Logo / Title */}
        <Text style={{ fontSize: 40, fontWeight: '700', textAlign: 'center', color: colors.text, letterSpacing: 4, marginBottom: 12 }}>EZER</Text>
        <Text style={{ fontSize: 16, textAlign: 'center', color: colors.textSecondary, marginBottom: 48 }}>Turn subscriptions into decisions</Text>

        {/* OAuth Provider Buttons */}
        <View style={{ gap: 16 }}>
          <Button
            title="Continue with Google"
            variant="primary"
            loading={loading === 'google'}
            disabled={loading !== null}
            onPress={() => handleProviderSelect('google')}
          />

          <Pressable
            style={{
              paddingVertical: 16,
              paddingHorizontal: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.text,
              backgroundColor: 'transparent',
              minHeight: 52,
              opacity: loading !== null ? 0.5 : 1,
            }}
            onPress={() => handleProviderSelect('apple')}
            disabled={loading !== null}
          >
            {loading === 'apple' ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Continue with Apple</Text>
            )}
          </Pressable>

          <Pressable
            style={{
              paddingVertical: 16,
              paddingHorizontal: 24,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.text,
              backgroundColor: 'transparent',
              minHeight: 52,
              opacity: loading !== null ? 0.5 : 1,
            }}
            onPress={() => handleProviderSelect('microsoft')}
            disabled={loading !== null}
          >
            {loading === 'microsoft' ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Continue with Microsoft</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Dev Mode Indicator */}
      <View style={{ paddingBottom: 32, alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>DEV MODE: OAuth bypassed</Text>
      </View>
    </View>
  );
}

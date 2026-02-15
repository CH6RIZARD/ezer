// =============================================================================
// EZER Mobile App - Entry (OAuth / Welcome)
// Auth gate: redirect authenticated users; show OAuth when not.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { Button } from '../components';

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isLoading, isAuthenticated, hasCompletedOnboarding, loginWithProvider } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  // Auth gate: once hydrated, redirect authenticated users (no OAuth flash)
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && hasCompletedOnboarding) {
      router.replace('/(tabs)/home');
      return;
    }
    if (isAuthenticated && !hasCompletedOnboarding) {
      router.replace('/onboarding');
      return;
    }
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  const handleProviderSelect = async (provider: 'google' | 'apple' | 'microsoft') => {
    setLoading(provider);
    try {
      const goToHome = await loginWithProvider(provider);
      setLoading(null);
      if (goToHome) {
        router.replace('/(tabs)/home');
      } else {
        router.replace('/onboarding');
      }
    } catch {
      setLoading(null);
    }
  };

  // Loading guard: do not show OAuth UI until auth state is known
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 14, color: colors.textSecondary }}>Loading…</Text>
      </View>
    );
  }

  // If authenticated, we're about to redirect (effect above); show same loading to avoid flash
  if (isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

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

        {/* Email auth links - minimal, below OAuth */}
        <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.push('/auth/login')} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>Log in with email</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/auth/signup')} style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>Sign up with email</Text>
          </Pressable>
        </View>
      </View>

      {/* Dev Mode Indicator - only in development */}
      {__DEV__ && (
        <View style={{ paddingBottom: 32, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: colors.textSecondary }}>DEV MODE: OAuth bypassed</Text>
        </View>
      )}
    </View>
  );
}

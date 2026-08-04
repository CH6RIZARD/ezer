// =============================================================================
// EZER Mobile App - Entry (OAuth / Welcome)
// Auth gate: redirect authenticated users; show OAuth when not.
// =============================================================================

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isLoading, isAuthenticated, hasCompletedOnboarding, loginWithProvider } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  /** Shown when a provider refuses — the screen must say so, not navigate. */
  const [authError, setAuthError] = useState<string | null>(null);

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

  /**
   * A refused sign-in must NOT navigate.
   *
   * This used to read `if (goToHome) home else onboarding` — but the old
   * boolean meant "false" for BOTH a failed sign-in and a successful one that
   * still needed onboarding. So tapping Google when there is no Google flow
   * sent the user through onboarding and into the dashboard with no session at
   * all. That is how you "log in" to a finance app without an account.
   *
   * Only `ok: true` moves anyone anywhere now.
   */
  const handleProviderSelect = async (provider: 'google' | 'apple' | 'microsoft') => {
    setLoading(provider);
    setAuthError(null);
    try {
      const result = await loginWithProvider(provider);
      setLoading(null);

      if (!result.ok) {
        // Backing out of the provider sheet is not a failure — saying
        // "sign-in failed" to someone who deliberately cancelled is noise.
        if (result.reason === 'cancelled') return;

        const label = provider[0].toUpperCase() + provider.slice(1);
        setAuthError(
          result.reason === 'unavailable'
            ? `${label} sign-in needs the installed app, not Expo Go or a browser${result.error ? ` — ${result.error}` : '.'}`
            : result.error || `Could not sign in with ${label}. Try again, or use email below.`
        );
        return;
      }

      router.replace(result.hasCompletedOnboarding ? '/(tabs)/home' : '/onboarding');
    } catch {
      setLoading(null);
      setAuthError('Something went wrong signing in. Try again, or use email below.');
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

        {authError !== null && (
          <View
            style={{
              backgroundColor: colors.danger + '18',
              borderColor: colors.danger + '55',
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 13, textAlign: 'center' }}>
              {authError}
            </Text>
          </View>
        )}

        {/* OAuth Provider Buttons */}
        <View style={{ gap: 16 }}>
          <Pressable
            style={{ paddingVertical: 16, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, minHeight: 52, opacity: loading !== null ? 0.5 : 1 }}
            onPress={() => handleProviderSelect('google')}
            disabled={loading !== null}
          >
            {loading === 'google' ? <ActivityIndicator color="#FFFFFF" /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="logo-google" size={19} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>Continue with Google</Text></View>}
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
            onPress={() => handleProviderSelect('apple')}
            disabled={loading !== null}
          >
            {loading === 'apple' ? <ActivityIndicator color={colors.text} /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="logo-apple" size={20} color={colors.text} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Continue with Apple</Text></View>}
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
            {loading === 'microsoft' ? <ActivityIndicator color={colors.text} /> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="logo-microsoft" size={20} color={colors.text} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Continue with Microsoft</Text></View>}
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

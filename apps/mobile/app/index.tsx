// =============================================================================
// EZER Mobile App - Entry
// Pure auth gate: never renders its own sign-in UI, only redirects.
// =============================================================================

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { Wordmark } from '../components/redesign/Primitives';

export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { isLoading, isAuthenticated, hasCompletedOnboarding } = useAuth();

  // Breathing fade on the wordmark, replacing the spinner — a slow loop
  // rather than a one-shot, since this screen can sit on auth/data loads of
  // unpredictable length.
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  // This screen redirects on every reachable state — signed in with onboarding
  // done goes to the dashboard, signed in without it goes to onboarding, and
  // signed out goes to onboarding too, since it now owns the whole first run
  // (story first, its own Apple / Google / email step at the end, account
  // created on its last screen). There is therefore no state this screen is
  // meant to be seen in.
  //
  // It used to render a full OAuth button screen — a second, competing
  // sign-in surface — while waiting for this effect to fire. React commits
  // that render before the effect runs, so every cold start flashed it for a
  // frame ahead of onboarding. Rendering only a loading spinner here, for
  // every branch, removes the flash instead of racing it.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && hasCompletedOnboarding) {
      router.replace('/(tabs)/home');
      return;
    }
    router.replace('/onboarding');
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }}>
      <Animated.View style={{ opacity }}>
        <Wordmark />
      </Animated.View>
      {__DEV__ && (
        <Text style={{ marginTop: 16, fontSize: 14, color: colors.textSecondary }}>Loading…</Text>
      )}
    </View>
  );
}

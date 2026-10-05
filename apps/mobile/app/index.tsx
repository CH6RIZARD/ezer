// =============================================================================
// EZER Mobile App - Entry
// Pure auth gate: never renders its own sign-in UI, only redirects.
// =============================================================================

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';

export default function IndexScreen() {
  const { colors } = useTheme();
  const { isLoading, isAuthenticated, hasCompletedOnboarding } = useAuth();

  // This screen redirects on every reachable state — signed in with onboarding
  // done goes to the dashboard, signed in without it goes to onboarding, and
  // signed out goes to onboarding too, since it now owns the whole first run.
  // There is therefore no state this screen is meant to be seen in.
  //
  // It used to render a full OAuth button screen — a second, competing
  // sign-in surface — and later its own breathing EZER wordmark. The wordmark
  // is LockGate's job now (its cover/intro/loading phases draw the same mark
  // in the same place); a second one here showed through as an extra EZER
  // flash after unlock, while Home was still sliding in over this screen.
  // Plain background only.
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated && hasCompletedOnboarding) {
      router.replace('/(tabs)/home');
      return;
    }
    router.replace('/onboarding');
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}

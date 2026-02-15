import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { AuthProvider } from '../utils/AuthContext';
import { PremiumProvider } from '../utils/PremiumContext';
import { ThemeProvider, useTheme } from '../utils/ThemeContext';
import { DateRangeProvider } from '../utils/DateRangeContext';
import { CashAdvanceProvider } from '../contexts/CashAdvanceContext';
import { SubscriptionsProvider } from '../contexts/SubscriptionsContext';
import { SavingsGoalsProvider } from '../utils/SavingsGoalsContext';

function RootLayoutNav() {
  const { isDark, colors } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/signup" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="screens/CardDetail" />
          <Stack.Screen name="screens/SubscriptionDetail" />
          <Stack.Screen name="screens/CancelFlow" />
          <Stack.Screen name="screens/ConfirmCancel" />
          <Stack.Screen name="screens/Reallocate" />
          <Stack.Screen name="screens/TrialDecision" />
          <Stack.Screen name="screens/CashAdvanceFlow" />
          <Stack.Screen name="screens/MonthlyBurn" />
          <Stack.Screen name="screens/RiskDetail" />
          <Stack.Screen name="screens/SilentSubscriptions" />
          <Stack.Screen name="savings" />
          <Stack.Screen name="screens/Paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack>
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PremiumProvider>
          <ThemeProvider>
            <DateRangeProvider>
              <CashAdvanceProvider>
                <SubscriptionsProvider>
                  <SavingsGoalsProvider>
                    <RootLayoutNav />
                  </SavingsGoalsProvider>
                </SubscriptionsProvider>
              </CashAdvanceProvider>
            </DateRangeProvider>
          </ThemeProvider>
          </PremiumProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

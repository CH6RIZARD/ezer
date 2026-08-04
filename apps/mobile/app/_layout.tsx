import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
// Text was used by AppErrorBoundary below without being imported — the boundary
// would itself throw a ReferenceError while rendering an error.
import { View, Text } from 'react-native';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { AuthProvider } from '../utils/AuthContext';
import { PremiumProvider } from '../utils/PremiumContext';
import { ThemeProvider, useTheme } from '../utils/ThemeContext';
import { DateRangeProvider } from '../utils/DateRangeContext';
import { CashAdvanceProvider } from '../contexts/CashAdvanceContext';
import { SubscriptionsProvider } from '../contexts/SubscriptionsContext';
import { DataProvider } from '../contexts/DataContext';
import { SavingsGoalsProvider } from '../utils/SavingsGoalsContext';

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0F0F0F', justifyContent: 'center', padding: 28 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Ezer couldn’t start</Text>
          <Text style={{ color: '#FCA5A5', fontSize: 14, lineHeight: 21 }}>{this.state.error.message}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function RootLayoutNav() {
  const { isDark, colors } = useTheme();

  // Space Grotesk (UI) + Instrument Serif Italic (display numerals) per the
  // redesign handoff. Family keys here must match theme/type.ts fontFamily.
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    InstrumentSerif_400Regular_Italic,
  });

  // Hold on a themed background rather than rendering with fallback system
  // fonts — the swap is jarring and reflows every screen.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <>
      {/* backgroundColor is Android-only and is what actually paints the status
          bar strip. Without it that strip stays the system default (white), so
          a light band sat above the app in dark mode no matter what the root
          view was set to. translucent={false} keeps it a solid band rather than
          letting content slide under it. */}
      <StatusBar
        style={isDark ? 'light' : 'dark'}
        backgroundColor={colors.bg}
        translucent={false}
      />
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
          <Stack.Screen name="screens/GoalDetail" />
          <Stack.Screen name="screens/TrialDecision" />
          <Stack.Screen name="screens/CashAdvanceFlow" />
          <Stack.Screen name="screens/MonthlyBurn" />
          <Stack.Screen name="screens/RiskDetail" />
          <Stack.Screen name="screens/SilentSubscriptions" />
          <Stack.Screen name="screens/DrainReview" />
          <Stack.Screen name="screens/PhysicalCard" />
          <Stack.Screen name="screens/PhysicalCardApproval" />
          <Stack.Screen name="savings" />
          <Stack.Screen name="screens/Paywall" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack>
      </View>
    </>
  );
}

/**
 * Paints the window behind everything in the theme's background colour.
 *
 * Without this, GestureHandlerRootView / SafeAreaProvider default to white, and
 * that white showed through as bands above and below the content whenever a
 * ScrollView overscrolled — and made the floating tab bar look like it drifted
 * with the page.
 */
function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export default function RootLayout() {
  return (
    // ThemedRoot is the OUTERMOST view on purpose. It used to sit inside
    // GestureHandlerRootView, which has no background of its own — so the
    // native window background (black) showed through the status-bar area,
    // giving a light-mode app a dark bar across the top. Painting from the
    // outermost view means every uncovered pixel is the theme background.
    <ThemeProvider>
      <ThemedRoot>
        <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <PremiumProvider>
            <DateRangeProvider>
              <DataProvider>
              <CashAdvanceProvider>
                <SubscriptionsProvider>
                  <SavingsGoalsProvider>
                    <AppErrorBoundary>
                      <RootLayoutNav />
                    </AppErrorBoundary>
                  </SavingsGoalsProvider>
                </SubscriptionsProvider>
              </CashAdvanceProvider>
              </DataProvider>
            </DateRangeProvider>
          </PremiumProvider>
        </AuthProvider>
      </SafeAreaProvider>
        </GestureHandlerRootView>
      </ThemedRoot>
    </ThemeProvider>
  );
}

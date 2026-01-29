import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import OnboardingScreen from '../src/screens/OnboardingScreen';
import HomeScreen from '../src/screens/HomeScreen';
import WalletScreen from '../src/screens/WalletScreen';
import CardDetailScreen from '../src/screens/CardDetailScreen';
import RisksScreen from '../src/screens/RisksScreen';
import TrialsScreen from '../src/screens/TrialsScreen';
import TrialDecisionScreen from '../src/screens/TrialDecisionScreen';
import SubscriptionDetailScreen from '../src/screens/SubscriptionDetailScreen';
import CancelFlowScreen from '../src/screens/CancelFlowScreen';
import LedgerScreen from '../src/screens/LedgerScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer independent>
        <Stack.Navigator
          initialRouteName="Onboarding"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="CardDetail" component={CardDetailScreen} />
          <Stack.Screen name="Risks" component={RisksScreen} />
          <Stack.Screen name="Trials" component={TrialsScreen} />
          <Stack.Screen name="TrialDecision" component={TrialDecisionScreen} />
          <Stack.Screen name="SubscriptionDetail" component={SubscriptionDetailScreen} />
          <Stack.Screen name="CancelFlow" component={CancelFlowScreen} />
          <Stack.Screen name="Ledger" component={LedgerScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

// =============================================================================
// EZER Mobile App - Connected Accounts Screen
// Plaid integration for bank connections
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';

export default function ConnectedAccountsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [connectedAccounts, setConnectedAccounts] = useState([
    { id: '1', bank: 'Chase', accountName: 'Checking', last4: '4532' },
    { id: '2', bank: 'Bank of America', accountName: 'Savings', last4: '7821' },
  ]);

  const handleConnectBank = () => {
    Alert.alert(
      'Plaid Integration Required',
      'To connect your bank account, you need to:\n\n1. Install react-native-plaid-link-sdk\n2. Set up Plaid API credentials in your backend\n3. Generate a link_token from your server\n4. Initialize PlaidLink with the token\n\nThis is a demo placeholder. In production, tapping here would open Plaid Link to securely connect your bank.',
      [
        { text: 'Learn More', onPress: () => Linking.openURL('https://plaid.com/docs/') },
        { text: 'Got it' }
      ]
    );
  };

  const handleDisconnect = (id: string) => {
    Alert.alert('Disconnect Account', 'Are you sure you want to disconnect this account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => setConnectedAccounts(connectedAccounts.filter((acc) => acc.id !== id)) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Connected Accounts</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 14, color: colors.text, lineHeight: 20, marginBottom: 24 }}>
          Connect your bank accounts to automatically track subscriptions and enable auto-save features.
        </Text>

        {/* Connect Bank Button */}
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 12, marginBottom: 32 }} onPress={handleConnectBank}>
          <Ionicons name="add-circle" size={24} color="#1F2933" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2933' }}>Connect Bank Account</Text>
        </Pressable>

        {/* Connected Accounts */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Accounts</Text>

          {connectedAccounts.map((account) => (
            <View key={account.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name="business" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{account.bank}</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>{account.accountName} ••••{account.last4}</Text>
              </View>
              <Pressable onPress={() => handleDisconnect(account.id)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.danger }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Disconnect</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: 12, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 }}>
          <Ionicons name="shield-checkmark" size={32} color={colors.accent} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 8 }}>Secure & Encrypted</Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>We use bank-level encryption and never store your login credentials. Powered by Plaid.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

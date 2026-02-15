// =============================================================================
// EZER Mobile App - Help Center
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, LayoutAnimation, Platform, UIManager } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const HELP_TOPICS = [
  {
    id: '1', icon: 'card', title: 'Managing Your Cards',
    description: 'Learn how to add, remove, and manage payment methods',
    details: 'EZER connects to your bank accounts via Plaid to automatically detect subscriptions charged to your cards. To add a new card, go to Settings > Connected Accounts and tap "Connect Bank Account". You can disconnect any account at any time — your data is encrypted and never shared.',
  },
  {
    id: '2', icon: 'time', title: 'Trial Management',
    description: 'Set up auto-cancel and manage free trials',
    details: 'When EZER detects a free trial, you\'ll get an alert before it converts to a paid subscription. You can enable auto-cancel to automatically remind you, or use Smart Saving to pay the full subscription while automatically saving a matching amount. Navigate to the Alerts tab to see all your active trials.',
  },
  {
    id: '3', icon: 'wallet', title: 'Auto-Save Features',
    description: 'Understand how automatic savings work',
    details: 'When you cancel a subscription, EZER lets you redirect that freed money into savings goals. Go to the Saved tab to create goals like Emergency Fund or Vacation. Subscription roundups are automatically allocated to your chosen goals. You can withdraw your savings anytime from the Withdraw screen.',
  },
  {
    id: '4', icon: 'shield-checkmark', title: 'Security & Privacy',
    description: 'How we protect your data',
    details: 'EZER uses bank-level 256-bit encryption to protect your data. We connect through Plaid, which is used by thousands of financial institutions. We never store your bank login credentials. Your data is encrypted at rest and in transit. You can delete your account and all data at any time from Settings.',
  },
  {
    id: '5', icon: 'link', title: 'Bank Connections',
    description: 'Connect and manage bank accounts with Plaid',
    details: 'EZER uses Plaid to securely connect your bank accounts. Plaid is a trusted financial data platform used by apps like Venmo, Robinhood, and Coinbase. To connect, tap "Connect Bank Account" in Settings > Connected Accounts. You\'ll be redirected to your bank\'s login page — EZER never sees your password.',
  },
  {
    id: '6', icon: 'document-text', title: 'Subscription Tracking',
    description: 'How we detect and track your subscriptions',
    details: 'EZER analyzes your transaction history to identify recurring charges. We use pattern matching to detect subscriptions even when merchant names vary. The Monthly Burn screen shows your total subscription spending, and the 30-Day Risk screen highlights upcoming charges. Tap any subscription to see its full charge history and manage it.',
  },
];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@ezer.app?subject=Help Request');
  };

  const toggleExpand = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: insets.top + 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Help Center</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 24 }}>How can we help you?</Text>

        {HELP_TOPICS.map((topic) => {
          const isExpanded = expandedId === topic.id;
          return (
            <Pressable
              key={topic.id}
              onPress={() => toggleExpand(topic.id)}
              style={{ backgroundColor: colors.card, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1, overflow: 'hidden' }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Ionicons name={topic.icon as any} size={24} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{topic.title}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{topic.description}</Text>
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
              </View>
              {isExpanded && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                  <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 12 }} />
                  <Text style={{ fontSize: 14, color: colors.text, lineHeight: 22 }}>{topic.details}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 12, marginTop: 24 }} onPress={handleContactSupport}>
          <Ionicons name="mail" size={20} color="#1F2933" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2933' }}>Contact Support</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

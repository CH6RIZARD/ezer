// =============================================================================
// EZER Mobile App - Help Center
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';

const HELP_TOPICS = [
  { id: '1', icon: 'card', title: 'Managing Your Cards', description: 'Learn how to add, remove, and manage payment methods' },
  { id: '2', icon: 'time', title: 'Trial Management', description: 'Set up auto-cancel and manage free trials' },
  { id: '3', icon: 'wallet', title: 'Auto-Save Features', description: 'Understand how automatic savings work' },
  { id: '4', icon: 'shield-checkmark', title: 'Security & Privacy', description: 'How we protect your data' },
  { id: '5', icon: 'link', title: 'Bank Connections', description: 'Connect and manage bank accounts with Plaid' },
  { id: '6', icon: 'document-text', title: 'Subscription Tracking', description: 'How we detect and track your subscriptions' },
];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@ezer.app?subject=Help Request');
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

        {/* Help Topics */}
        {HELP_TOPICS.map((topic) => (
          <Pressable key={topic.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
              <Ionicons name={topic.icon as any} size={24} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{topic.title}</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>{topic.description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </Pressable>
        ))}

        {/* Contact Support */}
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 16, borderRadius: 12, marginTop: 24 }} onPress={handleContactSupport}>
          <Ionicons name="mail" size={20} color="#1F2933" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2933' }}>Contact Support</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

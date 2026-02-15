// =============================================================================
// EZER Mobile App - Trial Banner
// Shows remaining trial days on the Home screen with upgrade link
// =============================================================================

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';

interface TrialBannerProps {
  daysRemaining: number;
}

export function TrialBanner({ daysRemaining }: TrialBannerProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => router.push('/screens/Paywall')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.accent + '15',
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.accent + '25',
        gap: 8,
      }}
    >
      <Ionicons name="time-outline" size={18} color={colors.accent} style={{ marginRight: 2 }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }} numberOfLines={1}>
        {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left in free trial
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.accent }}>Upgrade</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
      </View>
    </Pressable>
  );
}

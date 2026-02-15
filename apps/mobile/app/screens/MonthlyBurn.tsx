// =============================================================================
// EZER Mobile App - Monthly Burn Detail Page
// Shows breakdown of monthly spending with visualization
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { demoSubscriptions, demoMerchants, demoCharges } from '../../utils/demoData';
import { formatCents } from '../../utils/calculations';

// Get spend level color
const getSpendLevel = (amountCents: number) => {
  if (amountCents >= 5000) return { color: '#EF4444', label: 'High', bg: 'rgba(239,68,68,0.1)' };
  if (amountCents >= 2000) return { color: '#F59E0B', label: 'Medium', bg: 'rgba(245,158,11,0.1)' };
  return { color: '#10B981', label: 'Low', bg: 'rgba(16,185,129,0.1)' };
};

export default function MonthlyBurnScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Calculate spending data
  const subscriptionSpending = demoSubscriptions.map(sub => {
    const merchant = demoMerchants[sub.merchantId];
    const charges = demoCharges.filter(c => c.merchantId === sub.merchantId);
    const lastCharge = charges.sort((a, b) =>
      new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
    )[0];

    return {
      id: sub.id,
      name: merchant?.canonicalName || 'Unknown',
      logo: merchant?.canonicalName?.charAt(0) || '?',
      amountCents: lastCharge?.amountCents || 0,
      cycle: sub.cadence,
      merchantId: sub.merchantId,
    };
  }).sort((a, b) => b.amountCents - a.amountCents);

  const totalBurn = subscriptionSpending.reduce((acc, sub) => acc + sub.amountCents, 0);

  // Weekly breakdown (mock data)
  const weeklyData = [
    { week: 'Week 1', amount: 6500 },
    { week: 'Week 2', amount: 4200 },
    { week: 'Week 3', amount: 8900 },
    { week: 'Week 4', amount: 5285 },
  ];
  const maxWeekly = Math.max(...weeklyData.map(w => w.amount));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Monthly Burn</Text>
        </View>

        {/* Total Amount */}
        <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: 20, marginBottom: 24, alignItems: 'center' }}>
          <Ionicons name="flame" size={40} color={colors.danger} />
          <Text style={{ fontSize: 48, fontWeight: '800', color: colors.text, marginTop: 12, fontVariant: ['tabular-nums'] }}>
            {formatCents(totalBurn)}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>Total monthly recurring</Text>
        </View>

        {/* Weekly Chart */}
        <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: 16, marginBottom: 24 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Spend by Week</Text>
          <View style={{ gap: 12 }}>
            {weeklyData.map((week, idx) => (
              <View key={idx}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>{week.week}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{formatCents(week.amount)}</Text>
                </View>
                <View style={{ height: 8, backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{
                    width: `${(week.amount / maxWeekly) * 100}%`,
                    height: '100%',
                    backgroundColor: colors.danger,
                    borderRadius: 4,
                  }} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Subscription Breakdown */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Breakdown</Text>
        {subscriptionSpending.map(sub => {
          const level = getSpendLevel(sub.amountCents);
          return (
            <Pressable
              key={sub.id}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12 }}
              onPress={() => router.push({ pathname: '/screens/SubscriptionDetail', params: { merchantId: sub.merchantId } })}
            >
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>{sub.logo}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>{sub.name}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: 'capitalize' }}>{sub.cycle}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{formatCents(sub.amountCents)}</Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: level.bg, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: level.color }}>{level.label}</Text>
                </View>
              </View>
            </Pressable>
          );
        })}

      </ScrollView>
    </View>
  );
}

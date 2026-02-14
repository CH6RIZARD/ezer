// =============================================================================
// EZER Mobile App - 30-Day Risk Detail Page
// Shows risk assessment with subscriptions likely to charge soon
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { demoSubscriptions, demoMerchants, demoCharges, demoHomeSummary } from '../../utils/demoData';
import { formatCents, daysUntil } from '../../utils/calculations';

// Get risk level
const getRiskLevel = (days: number) => {
  if (days <= 3) return { color: '#EF4444', label: 'High Risk', bg: 'rgba(239,68,68,0.15)', score: 90 };
  if (days <= 7) return { color: '#F59E0B', label: 'Medium Risk', bg: 'rgba(245,158,11,0.15)', score: 60 };
  return { color: '#10B981', label: 'Low Risk', bg: 'rgba(16,185,129,0.15)', score: 30 };
};

export default function RiskDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Calculate risk data
  const riskySubscriptions = demoSubscriptions.map(sub => {
    const merchant = demoMerchants[sub.merchantId];
    const charges = demoCharges.filter(c => c.merchantId === sub.merchantId);
    const lastCharge = charges.sort((a, b) =>
      new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
    )[0];
    const days = daysUntil(sub.renewalDate);

    return {
      id: sub.id,
      name: merchant?.canonicalName || 'Unknown',
      logo: merchant?.canonicalName?.charAt(0) || '?',
      amountCents: lastCharge?.amountCents || 0,
      renewalDate: sub.renewalDate,
      daysUntil: days,
      merchantId: sub.merchantId,
    };
  })
    .filter(sub => sub.daysUntil >= 0 && sub.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const totalAtRisk = riskySubscriptions.reduce((acc, sub) => acc + sub.amountCents, 0);

  // Overall risk score (0-100)
  const riskScore = Math.min(100, Math.round((riskySubscriptions.length / 10) * 100));
  const riskColor = riskScore >= 70 ? '#EF4444' : riskScore >= 40 ? '#F59E0B' : '#10B981';

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
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>30-Day Risk</Text>
        </View>

        {/* Risk Score Gauge */}
        <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: 20, marginBottom: 24, alignItems: 'center' }}>
          <View style={{
            width: 140,
            height: 140,
            borderRadius: 70,
            borderWidth: 10,
            borderColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
            position: 'relative',
          }}>
            {/* Background ring */}
            <View style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: 70,
              borderWidth: 10,
              borderColor: `${riskColor}30`,
            }} />
            {/* Progress ring (simplified visual) */}
            <View style={{
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: 70,
              borderWidth: 10,
              borderColor: riskColor,
              borderTopColor: 'transparent',
              borderRightColor: riskScore >= 25 ? riskColor : 'transparent',
              borderBottomColor: riskScore >= 50 ? riskColor : 'transparent',
              borderLeftColor: riskScore >= 75 ? riskColor : 'transparent',
              transform: [{ rotate: '-45deg' }],
            }} />
            <Text style={{ fontSize: 36, fontWeight: '800', color: riskColor }}>{riskScore}</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Risk Score</Text>
          </View>
          <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text, marginTop: 20, fontVariant: ['tabular-nums'] }}>
            {formatCents(totalAtRisk)}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>At risk in next 30 days</Text>
        </View>

        {/* Risk Breakdown */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Charges</Text>
        {riskySubscriptions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, backgroundColor: colors.card, borderRadius: 16 }}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 }}>No risky charges!</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>You're in good shape</Text>
          </View>
        ) : (
          riskySubscriptions.map(sub => {
            const risk = getRiskLevel(sub.daysUntil);
            const chargeDate = new Date(sub.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

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
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>{chargeDate} · {sub.daysUntil === 0 ? 'Today' : `${sub.daysUntil} days`}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{formatCents(sub.amountCents)}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, backgroundColor: risk.bg, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: risk.color }}>{risk.label}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

      </ScrollView>
    </View>
  );
}

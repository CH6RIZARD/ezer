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
import { demoSubscriptions, demoMerchants, demoCharges, demoTrials } from '../../utils/demoData';
import { formatCents, daysUntil } from '../../utils/calculations';

// Get risk level
const getRiskLevel = (days: number) => {
  if (days <= 3) return { color: '#EF4444', label: 'High Risk', bg: 'rgba(239,68,68,0.15)', score: 90 };
  if (days <= 7) return { color: '#F59E0B', label: 'Medium Risk', bg: 'rgba(245,158,11,0.15)', score: 60 };
  return { color: '#10B981', label: 'Low Risk', bg: 'rgba(16,185,129,0.15)', score: 30 };
};

type UpcomingItem =
  | { type: 'renewal'; id: string; name: string; logo: string; amountCents: number; date: Date; daysUntil: number; merchantId: string }
  | { type: 'trial'; id: string; name: string; logo: string; amountCents: number; date: Date; daysUntil: number; trialId: string };

export default function RiskDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Renewals in 0–30 days
  const riskySubscriptions = demoSubscriptions
    .map(sub => {
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
    .filter(sub => sub.daysUntil >= 0 && sub.daysUntil <= 30);

  // Trials ending in 0–30 days (count as risk too)
  const riskyTrials = demoTrials
    .filter(t => {
      const days = daysUntil(t.trialEndDate);
      return days >= 0 && days <= 30;
    })
    .map(t => ({
      type: 'trial' as const,
      id: t.id,
      name: t.merchantName,
      logo: t.merchantName.charAt(0),
      amountCents: t.amountCentsAfterTrial,
      date: t.trialEndDate,
      daysUntil: daysUntil(t.trialEndDate),
      trialId: t.id,
    }));

  // Combined upcoming charges: renewals + trials, sorted by days until
  const upcomingCharges: UpcomingItem[] = [
    ...riskySubscriptions.map(sub => ({
      type: 'renewal' as const,
      id: sub.id,
      name: sub.name,
      logo: sub.logo,
      amountCents: sub.amountCents,
      date: sub.renewalDate,
      daysUntil: sub.daysUntil,
      merchantId: sub.merchantId,
    })),
    ...riskyTrials,
  ].sort((a, b) => a.daysUntil - b.daysUntil);

  const totalAtRisk = upcomingCharges.reduce((acc, item) => acc + item.amountCents, 0);

  // Overall risk score (0-100) based on count of renewals + trials
  const riskScore = Math.min(100, Math.round((upcomingCharges.length / 10) * 100));
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

        {/* Risk Breakdown — renewals + trials */}
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Charges</Text>
        {upcomingCharges.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, backgroundColor: colors.card, borderRadius: 16 }}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 }}>No risky charges!</Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>You're in good shape</Text>
          </View>
        ) : (
          upcomingCharges.map((item) => {
            const risk = getRiskLevel(item.daysUntil);
            const chargeDate = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const isTrial = item.type === 'trial';

            return (
              <Pressable
                key={item.id}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12 }}
                onPress={() => {
                  if (item.type === 'trial') {
                    router.push({ pathname: '/screens/TrialDecision', params: { trialId: item.trialId } });
                  } else {
                    router.push({ pathname: '/screens/SubscriptionDetail', params: { merchantId: item.merchantId } });
                  }
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isTrial ? colors.accent : colors.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>{item.logo}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>{item.name}</Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {chargeDate} · {item.daysUntil === 0 ? 'Today' : `${item.daysUntil} days`} · {isTrial ? 'Trial ending' : 'Renewal'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>{formatCents(item.amountCents)}</Text>
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

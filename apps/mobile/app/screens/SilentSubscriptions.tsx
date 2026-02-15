import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { useSubscriptions } from '../../contexts/SubscriptionsContext';
import { demoSubscriptions, demoMerchants, demoCharges } from '../../utils/demoData';
import { formatCents } from '../../utils/calculations';

type PendingState = 'idle' | 'confirming' | 'cancelling';

export default function SilentSubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { cancelSubscription, isCancelled } = useSubscriptions();
  const [pendingState, setPendingState] = useState<Record<string, PendingState>>({});

  const silentSubs = demoSubscriptions.map(sub => {
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
      lastCharged: lastCharge?.chargeTimestamp || sub.renewalDate,
      merchantId: sub.merchantId,
    };
  });

  const activeSubs = silentSubs.filter(sub => !isCancelled(sub.id));
  const totalSilentSpend = activeSubs.reduce((acc, sub) => acc + sub.amountCents, 0);

  const handleCancel = (subId: string) => {
    setPendingState(prev => ({ ...prev, [subId]: 'confirming' }));
  };

  const confirmCancel = (subId: string) => {
    setPendingState(prev => ({ ...prev, [subId]: 'cancelling' }));
    cancelSubscription(subId);
    setTimeout(() => {
      setPendingState(prev => ({ ...prev, [subId]: 'idle' }));
    }, 1500);
  };

  const getCancelButtonContent = (subId: string) => {
    const state = pendingState[subId] || 'idle';
    const cancelled = isCancelled(subId);

    if (cancelled) {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: 6 }}>
          <Ionicons name="checkmark" size={14} color="#10B981" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981' }}>Cancelled</Text>
        </View>
      );
    }

    switch (state) {
      case 'confirming':
        return (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => confirmCancel(subId)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.danger, borderRadius: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>Confirm</Text>
            </Pressable>
            <Pressable
              onPress={() => setPendingState(prev => ({ ...prev, [subId]: 'idle' }))}
              style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.background, borderRadius: 6 }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Back</Text>
            </Pressable>
          </View>
        );
      case 'cancelling':
        return (
          <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.background, borderRadius: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>Cancelling...</Text>
          </View>
        );
      default:
        return (
          <Pressable
            onPress={() => handleCancel(subId)}
            style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 6 }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.danger }}>Cancel</Text>
          </Pressable>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', marginRight: 16 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Silent Subscriptions</Text>
        </View>

        <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: 20, marginBottom: 24, alignItems: 'center' }}>
          <Ionicons name="eye-off" size={40} color={colors.textSecondary} />
          <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text, marginTop: 12, textAlign: 'center' }}>
            {activeSubs.length} subscriptions quietly charging you
          </Text>
          <Text style={{ fontSize: 40, fontWeight: '800', color: colors.danger, marginTop: 8, fontVariant: ['tabular-nums'] }}>
            {formatCents(totalSilentSpend)}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4 }}>per month</Text>
        </View>

        <View style={{ marginBottom: 16 }}>
          {silentSubs.map(sub => {
            const lastChargedDate = new Date(sub.lastCharged).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const cancelled = isCancelled(sub.id);

            return (
              <View
                key={sub.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.card,
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 12,
                  opacity: cancelled ? 0.5 : 1,
                }}
              >
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: cancelled ? colors.textSecondary : colors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 12,
                }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>{sub.logo}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: '600',
                    color: cancelled ? colors.textSecondary : colors.text,
                    marginBottom: 2,
                    textDecorationLine: cancelled ? 'line-through' : 'none',
                  }}>
                    {sub.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: cancelled ? colors.textSecondary : colors.text }}>
                      {formatCents(sub.amountCents)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>· Last charged {lastChargedDate}</Text>
                  </View>
                </View>
                {getCancelButtonContent(sub.id)}
              </View>
            );
          })}
        </View>

        {activeSubs.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginTop: 12 }}>All silent subscriptions cancelled!</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

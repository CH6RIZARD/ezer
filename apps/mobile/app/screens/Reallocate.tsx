// =============================================================================
// EZER Mobile App - Reallocate Screen
// Assign freed money to savings, debt, investing, or subscription
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Button } from '../../components';
import { formatCents } from '../../utils/calculations';
import type { AllocationTarget } from '../../types';

interface AllocationOption {
  value: AllocationTarget;
  label: string;
  description: string;
}

const ALLOCATION_OPTIONS: AllocationOption[] = [
  { value: 'savings', label: 'Savings', description: 'Add to your emergency fund or savings account' },
  { value: 'debt', label: 'Debt', description: 'Pay down credit cards or loans faster' },
  { value: 'investing', label: 'Investing', description: 'Grow your wealth over time' },
  { value: 'subscription', label: 'Another Intentional Subscription', description: 'Put towards a subscription you actually use' },
];

export default function ReallocateScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    merchantId: string;
    amountCents: string;
    billingInterval: string;
  }>();

  const amountCents = parseInt(params.amountCents || '0', 10);
  const billingInterval = params.billingInterval || 'monthly';

  const [selectedTarget, setSelectedTarget] = useState<AllocationTarget | null>(null);

  const handleBack = () => {
    router.back();
  };

  const handleAssign = () => {
    if (!selectedTarget) {
      Alert.alert('Select an option', 'Please choose where to allocate your freed money.');
      return;
    }

    // In a real app, this would:
    // 1. Create AllocationPlan
    // 2. Update LedgerEntry
    // 3. Show success toast

    const targetLabel = ALLOCATION_OPTIONS.find((o) => o.value === selectedTarget)?.label || selectedTarget;
    const amountStr = formatCents(amountCents);

    Alert.alert(
      'Saved!',
      `${amountStr}/${billingInterval === 'yearly' ? 'yr' : 'mo'} → ${targetLabel}`,
      [
        {
          text: 'OK',
          onPress: () => {
            // Navigate back to Wallet
            router.replace('/(tabs)/wallet');
          },
        },
      ]
    );
  };

  const getIntervalLabel = () => {
    switch (billingInterval) {
      case 'yearly':
        return 'year';
      case 'weekly':
        return 'week';
      default:
        return 'month';
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
        <TouchableOpacity onPress={handleBack} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 24 }}>
          Reassign the freed money
        </Text>

        {/* Amount Display */}
        <View style={{ alignItems: 'center', marginBottom: 32, paddingVertical: 16 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>
            You're freeing up
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.success }}>
            {formatCents(amountCents)}/{getIntervalLabel()}
          </Text>
        </View>

        {/* Allocation Options */}
        <View style={{ gap: 12, marginBottom: 32 }}>
          {ALLOCATION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                backgroundColor: colors.card,
                borderRadius: 12,
                padding: 16,
                borderWidth: 2,
                borderColor: selectedTarget === option.value ? colors.accent : 'transparent',
              }}
              onPress={() => setSelectedTarget(option.value)}
              activeOpacity={0.7}
            >
              <View style={{ marginRight: 12, paddingTop: 2 }}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selectedTarget === option.value ? colors.accent : colors.textSecondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selectedTarget === option.value && (
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: colors.accent,
                      }}
                    />
                  )}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                  {option.label}
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                  {option.description}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Assign CTA */}
        <View style={{ marginTop: 8 }}>
          <Button
            title="Assign"
            variant="success"
            onPress={handleAssign}
            disabled={!selectedTarget}
          />
        </View>
      </ScrollView>
    </View>
  );
}

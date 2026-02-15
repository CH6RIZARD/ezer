// =============================================================================
// EZER Mobile App - Reallocate Screen
// Assign freed money to user's goals (from Saved tab) or other buckets
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../utils/ThemeContext';
import { useSavingsGoals } from '../../utils/SavingsGoalsContext';
import { Button } from '../../components';
import { formatCents } from '../../utils/calculations';
import type { AllocationTarget } from '../../types';

/** Selection is either a user goal id (e.g. "1") or a generic bucket. */
type ReallocateSelection = { type: 'goal'; goalId: string } | { type: 'bucket'; value: AllocationTarget } | null;

interface BucketOption {
  value: AllocationTarget;
  label: string;
  description: string;
}

const BUCKET_OPTIONS: BucketOption[] = [
  { value: 'debt', label: 'Debt', description: 'Pay down credit cards or loans faster' },
  { value: 'investing', label: 'Investing', description: 'Grow your wealth over time' },
  { value: 'subscription', label: 'Another Intentional Subscription', description: 'Put towards a subscription you actually use' },
];

export default function ReallocateScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goals, addToGoal } = useSavingsGoals();
  const params = useLocalSearchParams<{
    merchantId: string;
    amountCents: string;
    billingInterval: string;
  }>();

  const amountCents = parseInt(params.amountCents || '0', 10);
  const billingInterval = params.billingInterval || 'monthly';

  const [selected, setSelected] = useState<ReallocateSelection>(null);

  const handleBack = () => {
    router.back();
  };

  const handleCreateGoal = () => {
    router.replace({ pathname: '/(tabs)/saved', params: { openCreate: '1' } });
  };

  const handleAssign = () => {
    if (!selected) {
      Alert.alert('Select an option', 'Please choose where to allocate your freed money.');
      return;
    }

    let targetLabel: string;
    if (selected.type === 'goal') {
      const goal = goals.find((g) => g.id === selected.goalId);
      targetLabel = goal?.name ?? 'Goal';
      addToGoal(selected.goalId, amountCents);
    } else {
      targetLabel = BUCKET_OPTIONS.find((o) => o.value === selected.value)?.label ?? selected.value;
    }

    const amountStr = formatCents(amountCents);

    Alert.alert(
      'Saved!',
      `${amountStr}/${billingInterval === 'yearly' ? 'yr' : 'mo'} → ${targetLabel}`,
      [
        {
          text: 'OK',
          onPress: () => {
            router.replace(selected.type === 'goal' ? '/(tabs)/saved' : '/(tabs)/wallet');
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

  const isSelected = (s: ReallocateSelection) => {
    if (!selected) return false;
    if (s?.type === 'goal' && selected?.type === 'goal') return s.goalId === selected.goalId;
    if (s?.type === 'bucket' && selected?.type === 'bucket') return s.value === selected.value;
    return false;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
        <TouchableOpacity onPress={handleBack} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 16, color: colors.text, fontWeight: '500' }}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 24 }}>
          Reassign the freed money
        </Text>

        <View style={{ alignItems: 'center', marginBottom: 24, paddingVertical: 16 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>
            You're freeing up
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.success }}>
            {formatCents(amountCents)}/{getIntervalLabel()}
          </Text>
        </View>

        {/* Your goals (from Saved tab) */}
        {goals.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Your goals
            </Text>
            <View style={{ gap: 12 }}>
              {goals.map((goal) => {
                const sel = { type: 'goal' as const, goalId: goal.id };
                const active = isSelected(sel);
                return (
                  <TouchableOpacity
                    key={goal.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 2,
                      borderColor: active ? colors.accent : 'transparent',
                    }}
                    onPress={() => setSelected(sel)}
                    activeOpacity={0.7}
                  >
                    <View style={{ marginRight: 12, paddingTop: 2 }}>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: active ? colors.accent : colors.textSecondary,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && (
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
                        {goal.name}
                      </Text>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                        ${goal.currentAmount.toFixed(2)} of ${goal.targetAmount.toFixed(2)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Create a new goal */}
        <View style={{ marginBottom: 24 }}>
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 16,
              borderWidth: 2,
              borderColor: colors.border,
              borderStyle: 'dashed',
            }}
            onPress={handleCreateGoal}
            activeOpacity={0.7}
          >
            <View style={{ marginRight: 12, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={18} color={colors.accent} />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.accent }}>
              Create a new goal
            </Text>
          </TouchableOpacity>
        </View>

        {/* Other options */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Other
          </Text>
          <View style={{ gap: 12 }}>
            {BUCKET_OPTIONS.map((option) => {
              const sel = { type: 'bucket' as const, value: option.value };
              const active = isSelected(sel);
              return (
                <TouchableOpacity
                  key={option.value}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    backgroundColor: colors.card,
                    borderRadius: 12,
                    padding: 16,
                    borderWidth: 2,
                    borderColor: active ? colors.accent : 'transparent',
                  }}
                  onPress={() => setSelected(sel)}
                  activeOpacity={0.7}
                >
                  <View style={{ marginRight: 12, paddingTop: 2 }}>
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: active ? colors.accent : colors.textSecondary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {active && (
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
              );
            })}
          </View>
        </View>

        <View style={{ marginTop: 8 }}>
          <Button
            title="Assign"
            variant="success"
            onPress={handleAssign}
            disabled={!selected}
          />
        </View>
      </ScrollView>
    </View>
  );
}

// =============================================================================
// EZER Mobile App - Withdraw Screen
// Withdraw funds from savings goals to connected bank account
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useSavingsGoals } from '../utils/SavingsGoalsContext';

export default function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { goals, updateGoal } = useSavingsGoals();

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAll, setWithdrawAll] = useState(false);

  const connectedAccount = {
    institution: 'Chase',
    name: 'Savings',
    last4: '4532',
  };

  const selectedGoal = goals.find((g) => g.id === selectedGoalId);
  const totalAvailable = goals.reduce((sum, g) => sum + g.currentAmount, 0);

  const parsedAmount = parseFloat(withdrawAmount) || 0;
  const effectiveAmount = withdrawAll && selectedGoal ? selectedGoal.currentAmount : parsedAmount;
  const canWithdraw = selectedGoal && effectiveAmount > 0 && effectiveAmount <= selectedGoal.currentAmount;

  const handleWithdraw = () => {
    if (!canWithdraw || !selectedGoal) return;

    Alert.alert(
      'Confirm Withdrawal',
      `Withdraw $${effectiveAmount.toFixed(2)} from "${selectedGoal.name}" to your ${connectedAccount.institution} •••• ${connectedAccount.last4} account?\n\nFunds typically arrive in 1-3 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          onPress: () => {
            const newAmount = Math.max(0, selectedGoal.currentAmount - effectiveAmount);
            updateGoal(selectedGoal.id, { currentAmount: newAmount });
            Alert.alert(
              'Withdrawal Initiated',
              `$${effectiveAmount.toFixed(2)} is being transferred to your ${connectedAccount.institution} account. Expected arrival: 1-3 business days.`,
              [{ text: 'Done', onPress: () => router.back() }]
            );
          },
        },
      ]
    );
  };

  const handleWithdrawAll = () => {
    if (totalAvailable <= 0) {
      Alert.alert('No Funds', 'There are no funds available to withdraw.');
      return;
    }

    Alert.alert(
      'Withdraw All Funds',
      `Withdraw $${totalAvailable.toFixed(2)} from all goals to your ${connectedAccount.institution} •••• ${connectedAccount.last4} account?\n\nThis will reset all goal balances to $0.\nFunds typically arrive in 1-3 business days.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw All',
          style: 'destructive',
          onPress: () => {
            goals.forEach((g) => {
              if (g.currentAmount > 0) {
                updateGoal(g.id, { currentAmount: 0 });
              }
            });
            Alert.alert(
              'Withdrawal Initiated',
              `$${totalAvailable.toFixed(2)} is being transferred to your ${connectedAccount.institution} account. Expected arrival: 1-3 business days.`,
              [{ text: 'Done', onPress: () => router.back() }]
            );
          },
        },
      ]
    );
  };

  const presetPercentages = [25, 50, 75, 100];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, flex: 1 }}>Withdraw</Text>
      </View>

      {/* Available Balance Card */}
      <View style={{
        backgroundColor: colors.primary,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        shadowColor: colors.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 4,
      }}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Total Available
        </Text>
        <Text style={{ fontSize: 36, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 }}>
          ${totalAvailable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
        <Pressable
          onPress={handleWithdrawAll}
          style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}
        >
          <Ionicons name="download-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>Withdraw All</Text>
        </Pressable>
      </View>

      {/* Destination */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Destination
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.primary}20`, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            <Ionicons name="business" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{connectedAccount.institution} {connectedAccount.name}</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>•••• {connectedAccount.last4}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        </View>
      </View>

      {/* Select Goal */}
      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Withdraw From
        </Text>
        {goals.map((goal) => {
          const isSelected = selectedGoalId === goal.id;
          return (
            <Pressable
              key={goal.id}
              onPress={() => {
                setSelectedGoalId(goal.id);
                setWithdrawAmount('');
                setWithdrawAll(false);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isSelected ? `${colors.primary}10` : colors.card,
                padding: 16,
                borderRadius: 12,
                marginBottom: 8,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? colors.primary : colors.border,
              }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: goal.color, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                <Ionicons name={goal.icon as any} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{goal.name}</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  ${goal.currentAmount.toFixed(2)} available
                </Text>
              </View>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border, justifyContent: 'center', alignItems: 'center' }}>
                {isSelected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} />}
              </View>
            </Pressable>
          );
        })}

        {goals.length === 0 && (
          <View style={{ backgroundColor: colors.card, padding: 24, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
            <Ionicons name="wallet-outline" size={32} color={colors.textSecondary} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center' }}>No savings goals yet. Create one in the Saved tab to start withdrawing.</Text>
          </View>
        )}
      </View>

      {/* Amount Input */}
      {selectedGoal && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Amount
          </Text>

          {/* Quick percentage buttons */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {presetPercentages.map((pct) => {
              const pctAmount = Math.floor(selectedGoal.currentAmount * pct) / 100;
              const isActive = withdrawAll ? pct === 100 : parsedAmount === pctAmount && pctAmount > 0;
              return (
                <Pressable
                  key={pct}
                  onPress={() => {
                    if (pct === 100) {
                      setWithdrawAll(true);
                      setWithdrawAmount(selectedGoal.currentAmount.toFixed(2));
                    } else {
                      setWithdrawAll(false);
                      setWithdrawAmount(pctAmount.toFixed(2));
                    }
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 8,
                    backgroundColor: isActive ? colors.primary : colors.card,
                    borderWidth: 1,
                    borderColor: isActive ? colors.primary : colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: isActive ? '#FFFFFF' : colors.text }}>
                    {pct}%
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom amount input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 24, fontWeight: '600', color: colors.textSecondary }}>$</Text>
            <TextInput
              style={{ flex: 1, fontSize: 24, fontWeight: '600', color: colors.text, paddingVertical: 16, paddingHorizontal: 8 }}
              value={withdrawAmount}
              onChangeText={(text) => {
                setWithdrawAll(false);
                setWithdrawAmount(text.replace(/[^0-9.]/g, ''));
              }}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
          </View>
          {parsedAmount > selectedGoal.currentAmount && (
            <Text style={{ fontSize: 12, color: colors.error || '#FF3B30', marginTop: 4 }}>
              Amount exceeds available balance of ${selectedGoal.currentAmount.toFixed(2)}
            </Text>
          )}
        </View>
      )}

      {/* Summary & CTA */}
      {selectedGoal && effectiveAmount > 0 && (
        <View style={{ marginBottom: 24 }}>
          <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>From</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{selectedGoal.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>To</Text>
              <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{connectedAccount.institution} •••• {connectedAccount.last4}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Withdrawal amount</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>${effectiveAmount.toFixed(2)}</Text>
            </View>
          </View>

          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 }}>
            Funds typically arrive in 1-3 business days. No fees for withdrawals.
          </Text>
        </View>
      )}

      {/* Withdraw Button */}
      {selectedGoal && (
        <Pressable
          onPress={handleWithdraw}
          disabled={!canWithdraw}
          style={{
            backgroundColor: canWithdraw ? colors.primary : colors.border,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: canWithdraw ? '#FFFFFF' : colors.textSecondary }}>
            {canWithdraw ? `Withdraw $${effectiveAmount.toFixed(2)}` : 'Enter an amount'}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

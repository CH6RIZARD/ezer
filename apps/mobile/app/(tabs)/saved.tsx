// =============================================================================
// EZER Mobile App - Saved Tab
// Goal-based savings with subscription roundups + Cash Advance
// =============================================================================

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { usePremium } from '../../utils/PremiumContext';
import { useSavingsGoals } from '../../utils/SavingsGoalsContext';
import { useCashAdvance } from '../../contexts/CashAdvanceContext';
import { demoLedgerEntry, demoSubscriptions, demoMerchants } from '../../utils/demoData';
import { CASH_ADVANCE_MIN, CASH_ADVANCE_MAX, CASH_ADVANCE_PRESETS } from '../../constants/money';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const calculateFee = (amount: number): number => {
  const feePercentage = 0.05;
  const minFee = 2.99;
  return Math.max(minFee, amount * feePercentage);
};

const calculateRepaymentDate = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString();
};

const formatDateShort = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { status: premiumStatus } = usePremium();
  const params = useLocalSearchParams<{ openCreate?: string }>();
  const { goals: savingsGoals, addGoal, updateGoal, deleteGoal } = useSavingsGoals();
  const cashAdvance = useCashAdvance();

  useEffect(() => {
    if (premiumStatus === 'expired') router.replace('/screens/Paywall');
  }, [premiumStatus]);

  const totalReclaimed = demoLedgerEntry.reclaimedCents / 100;

  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editGoalName, setEditGoalName] = useState('');
  const [editGoalTarget, setEditGoalTarget] = useState('');
  const [advanceExpanded, setAdvanceExpanded] = useState(false);
  const [advanceCustomInput, setAdvanceCustomInput] = useState('');
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (params.openCreate === '1') {
      setShowCreateGoal(true);
    }
  }, [params.openCreate]);

  const connectedAccount = {
    institution: 'Chase',
    name: 'Savings',
    last4: '4532',
  };

  const selectedAmount = cashAdvance.selectedAmount;
  const fee = Math.max(2.99, selectedAmount * 0.05);
  const totalRepayment = selectedAmount + fee;
  const repaymentDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString();
  })();

  const toggleAdvanceExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdvanceExpanded(!advanceExpanded);
    Animated.spring(rotateAnim, {
      toValue: advanceExpanded ? 0 : 1,
      useNativeDriver: true,
      tension: 300,
      friction: 15,
    }).start();
  };

  const handlePresetPress = (amount: number) => {
    if (amount <= cashAdvance.eligibleMax) {
      cashAdvance.setSelectedAmount(amount);
      setAdvanceCustomInput('');
    }
  };

  const handleAdvanceCustomInputChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setAdvanceCustomInput(numericText);
    if (numericText) {
      const amount = parseInt(numericText, 10);
      if (!isNaN(amount)) {
        cashAdvance.setSelectedAmount(Math.min(amount, CASH_ADVANCE_MAX));
      }
    }
  };

  const handleGetAdvance = () => {
    if (!canGetAdvance) return;
    // Open approval UI directly; paywall shows after user taps "Check My Eligibility" in flow
    router.push({
      pathname: '/screens/CashAdvanceFlow',
      params: { amount: String(selectedAmount) },
    });
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const canGetAdvance = selectedAmount >= CASH_ADVANCE_MIN && selectedAmount <= cashAdvance.eligibleMax;

  const handleCreateGoal = () => {
    if (!newGoalName || !newGoalTarget) {
      Alert.alert('Error', 'Please enter goal name and target amount');
      return;
    }

    addGoal({
      name: newGoalName,
      targetAmount: parseFloat(newGoalTarget),
      currentAmount: 0,
      icon: 'flag',
      color: colors.primary,
      subscriptionIds: [],
    });
    setNewGoalName('');
    setNewGoalTarget('');
    setShowCreateGoal(false);
  };

  const handleGoalOptions = (goalId: string) => {
    const goal = savingsGoals.find(g => g.id === goalId);
    if (!goal) return;

    Alert.alert(
      goal.name,
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Edit Goal',
          onPress: () => {
            setEditingGoalId(goalId);
            setEditGoalName(goal.name);
            setEditGoalTarget(goal.targetAmount.toString());
          },
        },
        {
          text: 'Withdraw Funds',
          onPress: () => {
            Alert.alert(
              'Withdraw Funds',
              `Withdraw $${goal.currentAmount.toFixed(2)} to your ${connectedAccount.institution} account?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Withdraw',
                  onPress: () => {
                    updateGoal(goalId, { currentAmount: 0 });
                    Alert.alert('Success', `$${goal.currentAmount.toFixed(2)} transferred successfully.`);
                  },
                },
              ]
            );
          },
        },
        {
          text: 'Delete Goal',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Goal',
              `Are you sure you want to delete "${goal.name}"?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteGoal(goalId);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleSaveEdit = () => {
    if (!editingGoalId || !editGoalName || !editGoalTarget) return;

    updateGoal(editingGoalId, {
      name: editGoalName,
      targetAmount: parseFloat(editGoalTarget),
    });
    setEditingGoalId(null);
    setEditGoalName('');
    setEditGoalTarget('');
  };

  const getTotalSaved = () => {
    return savingsGoals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  };

  const getUnallocatedAmount = () => {
    return totalReclaimed - getTotalSaved();
  };

  const topInset = Math.max(insets.top, 44);
  const headerBarHeight = 52;
  const paddingTop = topInset + 8;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop, paddingBottom: insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* EZER Branding - same height as header bar for center alignment */}
      <View style={{ position: 'absolute', top: paddingTop, right: 24, height: headerBarHeight, justifyContent: 'center', zIndex: 1000 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.accent, letterSpacing: 2 }}>EZER</Text>
      </View>

      {/* Header - fixed-height bar so center mass aligns with status bar */}
      <View style={{ minHeight: headerBarHeight, justifyContent: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 32, fontWeight: '700', color: colors.text }}>Savings</Text>
      </View>

      {/* Hero Card - Liquidity Dashboard */}
      <View style={{ marginBottom: 24 }}>
        {/* Stacked background layers */}
        <View style={{ position: 'absolute', top: 8, left: 8, right: -8, bottom: -8, backgroundColor: colors.primary, borderRadius: 20, opacity: 0.35 }} />
        <View style={{ position: 'absolute', top: 4, left: 4, right: -4, bottom: -4, backgroundColor: colors.primary, borderRadius: 20, opacity: 0.5 }} />

        <View style={{
          backgroundColor: colors.primary,
          borderRadius: 20,
          padding: 24,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 4,
        }}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 1 }}>Total Savings</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success, marginRight: 6 }} />
              <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '500' }}>Active</Text>
            </View>
          </View>

          {/* Balance */}
          <Text style={{ fontSize: 40, fontWeight: '700', color: '#FFFFFF', marginBottom: 20 }}>
            ${getTotalSaved().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>

          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 20 }} />

          {/* Cash Available + Move Money */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Cash Available</Text>
              <Text style={{ fontSize: 20, fontWeight: '600', color: '#FFFFFF' }}>
                ${Math.max(0, getUnallocatedAmount()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/savings')}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }}
            >
              <Text style={{ fontSize: 16, color: '#FFFFFF', marginRight: 8 }}>↔</Text>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}>Move Money</Text>
            </Pressable>
          </View>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 }}>+${Math.round(totalReclaimed)}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>This month</Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 }}>{savingsGoals.length}</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Active buckets</Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 }}>
                {savingsGoals.length > 0
                  ? Math.round(savingsGoals.reduce((sum, g) => sum + Math.min(100, (g.currentAmount / g.targetAmount) * 100), 0) / savingsGoals.length)
                  : 0}%
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>On track</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Savings Goals */}
      <View style={{ marginBottom: 32 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>Goals</Text>
          <Pressable onPress={() => setShowCreateGoal(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="add" size={20} color={colors.text} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>New Goal</Text>
          </Pressable>
        </View>

        {savingsGoals.map((goal) => {
          const progress = (goal.currentAmount / goal.targetAmount) * 100;
          const subscriptionsInGoal = demoSubscriptions.filter(sub =>
            goal.subscriptionIds.includes(sub.id)
          );
          const isEditing = editingGoalId === goal.id;

          if (isEditing) {
            return (
              <View key={goal.id} style={{ backgroundColor: colors.card, padding: 20, borderRadius: 12, marginBottom: 16, borderWidth: 2, borderColor: colors.primary, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Edit Goal</Text>
                <TextInput
                  style={{ backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, marginBottom: 12 }}
                  placeholder="Goal name"
                  value={editGoalName}
                  onChangeText={setEditGoalName}
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={{ backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, marginBottom: 12 }}
                  placeholder="Target amount"
                  value={editGoalTarget}
                  onChangeText={setEditGoalTarget}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textSecondary}
                />
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                  <Pressable onPress={() => setEditingGoalId(null)} style={{ flex: 1, backgroundColor: colors.background, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleSaveEdit} style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            );
          }

          return (
            <View key={goal.id} style={{ backgroundColor: colors.card, padding: 20, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: goal.color, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={goal.icon as any} size={20} color="#FFFFFF" />
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{goal.name}</Text>
                </View>
                <Pressable onPress={() => handleGoalOptions(goal.id)}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 4 }}>${goal.currentAmount.toFixed(2)}</Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>of ${goal.targetAmount.toFixed(2)}</Text>
              </View>

              <View style={{ height: 8, backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                <View style={{ width: `${Math.min(progress, 100)}%`, height: '100%', backgroundColor: goal.color, borderRadius: 4 }} />
              </View>

              {subscriptionsInGoal.length > 0 && (
                <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                    {subscriptionsInGoal.length} subscription{subscriptionsInGoal.length !== 1 ? 's' : ''} rounding up
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {subscriptionsInGoal.slice(0, 3).map((sub) => {
                      const merchant = demoMerchants[sub.merchantId];
                      return (
                        <View key={sub.id} style={{ backgroundColor: colors.background, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 }}>
                          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text }}>{merchant?.canonicalName || 'Unknown'}</Text>
                        </View>
                      );
                    })}
                    {subscriptionsInGoal.length > 3 && (
                      <Text style={{ fontSize: 12, color: colors.textSecondary, alignSelf: 'center' }}>+{subscriptionsInGoal.length - 3} more</Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Create Goal Form */}
        {showCreateGoal && (
          <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: 12, borderWidth: 2, borderColor: colors.accent, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>New Savings Goal</Text>
            <TextInput
              style={{ backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, marginBottom: 12 }}
              placeholder="Goal name (e.g., Emergency Fund)"
              value={newGoalName}
              onChangeText={setNewGoalName}
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={{ backgroundColor: colors.background, borderRadius: 8, padding: 12, fontSize: 15, color: colors.text, marginBottom: 12 }}
              placeholder="Target amount"
              value={newGoalTarget}
              onChangeText={setNewGoalTarget}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Pressable onPress={() => setShowCreateGoal(false)} style={{ flex: 1, backgroundColor: colors.background, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleCreateGoal} style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Create Goal</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Cash Advance Section */}
      <View style={{ backgroundColor: colors.card, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 }}>
        <Pressable
          onPress={toggleAdvanceExpanded}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 }, pressed && { backgroundColor: colors.background }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${colors.primary}20`, justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="cash-outline" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Cash Advance</Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                Up to ${cashAdvance.eligibleMax} available
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selectedAmount > 0 && (
              <View style={{ backgroundColor: `${colors.primary}20`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.primary }}>${selectedAmount}</Text>
              </View>
            )}
            <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
              <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
            </Animated.View>
          </View>
        </Pressable>

        {advanceExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ padding: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 }}>Select amount</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {CASH_ADVANCE_PRESETS.map((amount) => {
                    const isDisabled = amount > cashAdvance.eligibleMax;
                    const isSelected = amount === selectedAmount;
                    return (
                      <Pressable
                        key={amount}
                        onPress={() => handlePresetPress(amount)}
                        disabled={isDisabled}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderRadius: 20,
                          backgroundColor: isSelected ? colors.primary : isDisabled ? colors.border : colors.background,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '500', color: isSelected ? '#FFFFFF' : isDisabled ? colors.textSecondary : colors.text }}>
                          ${amount}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 8 }}>Or enter custom amount</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginBottom: 16 }}>
                  <Text style={{ fontSize: 20, fontWeight: '500', color: colors.textSecondary }}>$</Text>
                  <TextInput
                    style={{ flex: 1, fontSize: 20, fontWeight: '600', color: colors.text, paddingVertical: 12, paddingHorizontal: 8 }}
                    value={advanceCustomInput || (selectedAmount > 0 ? selectedAmount.toString() : '')}
                    onChangeText={handleAdvanceCustomInputChange}
                    placeholder="0"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>

                {selectedAmount > 0 && (
                  <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 16, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Advance amount</Text>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>${selectedAmount.toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Fee (5%)</Text>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>${fee.toFixed(2)}</Text>
                    </View>
                    <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Total repayment</Text>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>${totalRepayment.toFixed(2)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: colors.textSecondary }}>Due date</Text>
                      <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{formatDateShort(repaymentDate)}</Text>
                    </View>
                  </View>
                )}

                <Pressable
                  onPress={handleGetAdvance}
                  disabled={!canGetAdvance}
                  style={{ backgroundColor: canGetAdvance ? colors.primary : colors.border, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: canGetAdvance ? '#FFFFFF' : colors.textSecondary }}>
                    {canGetAdvance ? `Get $${selectedAmount} Advance` : 'Select an amount'}
                  </Text>
                </Pressable>

                <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
                  By proceeding, you agree to the Cash Advance terms.
                </Text>
              </View>
          </View>
        )}
      </View>

      {/* Connected Account */}
      <View style={{ marginBottom: 32 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Connected Account</Text>
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/settings/connected-accounts')}
        >
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
            <Ionicons name="business" size={20} color={colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 }}>
              {connectedAccount.institution} {connectedAccount.name}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>•••• {connectedAccount.last4}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

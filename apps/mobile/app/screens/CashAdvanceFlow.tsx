// =============================================================================
// EZER Mobile App - Cash Advance Flow
// Multi-step flow with dark UI aesthetic
// =============================================================================

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePlaid, PlaidAccount } from '../../utils/usePlaid';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Design System Colors
const COLORS = {
  bg: '#0a0a0f',
  cardBg: '#111118',
  accent: '#4df0c0',
  accent2: '#7eb8ff',
  text: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.6)',
  textMuted: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.06)',
  borderActive: 'rgba(120,200,255,0.3)',
  glow: 'rgba(77,240,192,0.15)',
  glowStrong: 'rgba(77,240,192,0.25)',
};

// Bank emoji mapping
const BANK_EMOJIS: Record<string, string> = {
  'Chase': '🏦',
  'Bank of America': '🏛️',
  'Wells Fargo': '🏧',
  'Citi': '💳',
  'Capital One': '💰',
  'US Bank': '🏦',
  'PNC': '🏛️',
  'default': '🏦',
};

// Check Steps
const CHECK_STEPS = [
  { id: 1, emoji: '🔗', text: 'Verifying bank connection' },
  { id: 2, emoji: '💰', text: 'Checking income history' },
  { id: 3, emoji: '📊', text: 'Calculating advance limit' },
  { id: 4, emoji: '✅', text: 'Finalizing your offer' },
];

// Quick Amount Options
const QUICK_AMOUNTS = [50, 100, 250, 500, 750, 1000, 1250, 1500];

const MIN_AMOUNT_FLOW = 50;
const MAX_AMOUNT_FLOW = 1500;

function parseAmountParam(param: string | undefined): number {
  if (param == null || param === '') return 500;
  const n = parseInt(param, 10);
  if (Number.isNaN(n)) return 500;
  return Math.max(MIN_AMOUNT_FLOW, Math.min(MAX_AMOUNT_FLOW, Math.round(n / 50) * 50));
}

export default function CashAdvanceFlowScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ amount?: string }>();
  const initialAmount = parseAmountParam(params.amount);
  const { linkedAccounts, openPlaidLink, isLoading: isPlaidLoading } = usePlaid();

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState(initialAmount);
  const [completedChecks, setCompletedChecks] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0.2)).current; // 5 steps now

  // Auto-select first bank if none selected
  useEffect(() => {
    if (!selectedBankId && linkedAccounts.length > 0) {
      setSelectedBankId(linkedAccounts[0].id);
    }
  }, [linkedAccounts, selectedBankId]);

  // Get selected bank details
  const selectedBank = useMemo(() => {
    return linkedAccounts.find(acc => acc.id === selectedBankId) || linkedAccounts[0];
  }, [linkedAccounts, selectedBankId]);

  // Handle adding new account via Plaid
  const handleAddAccount = () => {
    openPlaidLink(
      // onSuccess
      (result) => {
        console.log('[CashAdvance] Plaid link success:', result);
        // Auto-select the newly connected account
        if (result.accounts.length > 0) {
          setSelectedBankId(result.accounts[0].id);
        }
      },
      // onExit
      (exit) => {
        if (exit.error) {
          console.log('[CashAdvance] Plaid link error:', exit.error);
        }
      }
    );
  };

  const minAmount = 50;
  const maxAmount = 1500;

  // Calculate fee and total
  const fee = Math.max(selectedAmount * 0.05, 2.99);
  const total = selectedAmount + fee;

  // Calculate due date (13 days from now)
  const getDueDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 13);
    return {
      short: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      full: date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    };
  };

  const dueDate = getDueDate();

  // Format currency
  const formatCurrency = (amount: number, showCents = true) => {
    if (showCents) {
      return `$${amount.toFixed(2)}`;
    }
    return `$${amount.toLocaleString()}`;
  };

  // Animate step transition (5 steps total)
  const animateToStep = (step: number) => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: step / 5,
        duration: 400,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setCurrentStep(step);
      slideAnim.setValue(0);
    });
  };

  // Run auto checks for Step 2
  const runAutoChecks = () => {
    setCompletedChecks([]);
    let checkIndex = 0;

    const runNextCheck = () => {
      if (checkIndex < CHECK_STEPS.length) {
        setTimeout(() => {
          setCompletedChecks(prev => [...prev, CHECK_STEPS[checkIndex].id]);
          checkIndex++;
          runNextCheck();
        }, 900);
      } else {
        // All checks done, go to step 3
        setTimeout(() => animateToStep(3), 800);
      }
    };

    setTimeout(runNextCheck, 500);
  };

  // Handle Step 1 submit
  const handleCheckEligibility = () => {
    animateToStep(2);
    setTimeout(runAutoChecks, 300);
  };

  // Handle Step 3 (Approval) - Accept terms and proceed
  const handleAcceptApproval = () => {
    animateToStep(4);
  };

  // Handle Step 4 submit - Request amount
  const handleRequestAmount = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      animateToStep(5);
    }, 1200);
  };

  // Reset flow
  const resetFlow = () => {
    setCompletedChecks([]);
    setSelectedAmount(500);
    animateToStep(1);
  };

  // Slider thumb position
  const sliderPercent = ((selectedAmount - minAmount) / (maxAmount - minAmount)) * 100;

  // Slider pan responder
  const sliderWidth = SCREEN_WIDTH - 96; // Account for padding
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const x = evt.nativeEvent.locationX;
        updateSliderFromPosition(x);
      },
      onPanResponderMove: (evt) => {
        const x = evt.nativeEvent.locationX;
        updateSliderFromPosition(x);
      },
    })
  ).current;

  const updateSliderFromPosition = (x: number) => {
    const percent = Math.max(0, Math.min(1, x / sliderWidth));
    let amount = minAmount + percent * (maxAmount - minAmount);
    amount = Math.round(amount / 50) * 50;
    amount = Math.max(minAmount, Math.min(maxAmount, amount));
    setSelectedAmount(amount);
  };

  // Step Dots Component (5 steps)
  const StepDots = () => (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 20 }}>
      {[1, 2, 3, 4, 5].map((step) => (
        <View
          key={step}
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: step === currentStep ? COLORS.accent : step < currentStep ? 'rgba(77,240,192,0.4)' : COLORS.border,
            ...(step === currentStep && {
              shadowColor: COLORS.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.8,
              shadowRadius: 10,
            }),
          }}
        />
      ))}
    </View>
  );

  // Get bank emoji
  const getBankEmoji = (institutionName: string) => {
    return BANK_EMOJIS[institutionName] || BANK_EMOJIS['default'];
  };

  // Bank Card Component for linked accounts
  const BankCard = ({ account, isSelected, onPress }: { account: PlaidAccount; isSelected: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        backgroundColor: isSelected ? 'rgba(77,240,192,0.05)' : 'rgba(255,255,255,0.02)',
        borderWidth: 1,
        borderColor: isSelected ? COLORS.accent : COLORS.border,
        borderRadius: 14,
        marginBottom: 12,
        ...(isSelected && {
          shadowColor: COLORS.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        }),
      }}
    >
      <View style={{
        width: 48,
        height: 48,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 24 }}>{getBankEmoji(account.institutionName)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 16, color: COLORS.text, marginBottom: 4 }}>{account.institutionName}</Text>
        <Text style={{ fontSize: 13, color: COLORS.textMuted }}>{account.name} ••••{account.mask}</Text>
      </View>
      <View style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: isSelected ? COLORS.accent : COLORS.border,
        backgroundColor: isSelected ? COLORS.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {isSelected && <Ionicons name="checkmark" size={14} color={COLORS.bg} />}
      </View>
    </Pressable>
  );

  // Add Account Card Component
  const AddAccountCard = ({ onPress }: { onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 18,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 14,
        marginBottom: 12,
        borderStyle: 'dashed',
      }}
    >
      <View style={{
        width: 48,
        height: 48,
        backgroundColor: 'rgba(77,240,192,0.1)',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Ionicons name="add" size={28} color={COLORS.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 16, color: COLORS.text, marginBottom: 4 }}>Add another account</Text>
        <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Connect via Plaid</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
    </Pressable>
  );

  // Quick Amount Button
  const QuickButton = ({ amount }: { amount: number }) => {
    const isActive = selectedAmount === amount;
    const label = amount >= 1000 ? `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 2)}K` : `$${amount}`;

    return (
      <Pressable
        onPress={() => setSelectedAmount(amount)}
        style={{
          flex: 1,
          padding: 14,
          backgroundColor: isActive ? 'rgba(77,240,192,0.1)' : 'rgba(255,255,255,0.02)',
          borderWidth: 1,
          borderColor: isActive ? COLORS.accent : COLORS.border,
          borderRadius: 14,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '500', color: isActive ? COLORS.accent : COLORS.text }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
      {/* Ambient Background Gradients */}
      <View style={{ position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(77,240,192,0.08)' }} />
      <View style={{ position: 'absolute', bottom: -150, left: -100, width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(126,184,255,0.06)' }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Close Button */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.06)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={24} color={COLORS.text} />
          </Pressable>
        </View>

        {/* Progress Bar */}
        <View style={{ height: 4, backgroundColor: COLORS.border, borderRadius: 2, marginBottom: 20, overflow: 'hidden' }}>
          <Animated.View
            style={{
              height: '100%',
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              borderRadius: 2,
            }}
          >
            <LinearGradient
              colors={[COLORS.accent, COLORS.accent2]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1, borderRadius: 2 }}
            />
          </Animated.View>
        </View>

        <StepDots />

        {/* Main Card */}
        <View style={{
          backgroundColor: COLORS.cardBg,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 28,
          padding: 24,
          marginTop: 24,
        }}>

          {/* STEP 1: Connect Bank */}
          {currentStep === 1 && (
            <Animated.View style={{ opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 8, letterSpacing: -0.5 }}>
                Connect your bank
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 28 }}>
                We need to verify your income and account history
              </Text>

              {linkedAccounts.map((account) => (
                <BankCard
                  key={account.id}
                  account={account}
                  isSelected={selectedBankId === account.id}
                  onPress={() => setSelectedBankId(account.id)}
                />
              ))}

              {/* Add Account via Plaid */}
              <AddAccountCard onPress={handleAddAccount} />

              {/* Warning Card */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                padding: 14,
                backgroundColor: 'rgba(126,184,255,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(126,184,255,0.15)',
                borderRadius: 14,
                marginBottom: 24,
                marginTop: 8,
              }}>
                <Text style={{ fontSize: 18 }}>ℹ️</Text>
                <Text style={{ fontSize: 13, color: COLORS.accent2 }}>30+ days account history required</Text>
              </View>

              {/* CTA Button */}
              <Pressable
                onPress={handleCheckEligibility}
                style={{
                  overflow: 'hidden',
                  borderRadius: 16,
                }}
              >
                <LinearGradient
                  colors={[COLORS.accent, COLORS.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.bg }}>Check My Eligibility →</Text>
                </LinearGradient>
              </Pressable>

              <Text style={{ textAlign: 'center', fontSize: 12, color: COLORS.textMuted, marginTop: 16 }}>
                Does not affect credit score
              </Text>
            </Animated.View>
          )}

          {/* STEP 2: Auto Checking */}
          {currentStep === 2 && (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <ActivityIndicator size="large" color={COLORS.accent} style={{ marginBottom: 32 }} />
              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 32 }}>
                Reviewing your account
              </Text>

              <View style={{ width: '100%', gap: 16 }}>
                {CHECK_STEPS.map((step) => {
                  const isDone = completedChecks.includes(step.id);
                  const isActive = completedChecks.length + 1 === step.id;

                  return (
                    <View
                      key={step.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 16,
                        padding: 16,
                        backgroundColor: 'rgba(255,255,255,0.02)',
                        borderRadius: 14,
                        opacity: isDone || isActive ? 1 : 0.4,
                      }}
                    >
                      <Text style={{ fontSize: 20, color: isDone ? COLORS.accent : COLORS.text }}>{step.emoji}</Text>
                      <Text style={{ fontSize: 14, color: isDone ? COLORS.text : COLORS.textSecondary }}>{step.text}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* STEP 3: Approval Screen */}
          {currentStep === 3 && (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              {/* Success Icon */}
              <View style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: COLORS.glowStrong,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
              }}>
                <Ionicons name="checkmark-circle" size={48} color={COLORS.accent} />
              </View>

              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 8, textAlign: 'center' }}>
                You're Approved!
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 32 }}>
                Based on your account history, you qualify for a cash advance
              </Text>

              {/* Approval Details Card */}
              <View style={{
                width: '100%',
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
              }}>
                <View style={{ alignItems: 'center', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 8 }}>Your Approved Limit</Text>
                  <Text style={{ fontSize: 48, fontWeight: '800', color: COLORS.accent, letterSpacing: -1 }}>$1,500</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Fee</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>5% one-time</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Repayment Period</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>13 days</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 }}>
                  <Text style={{ fontSize: 14, color: COLORS.textSecondary }}>Credit Impact</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.accent }}>None</Text>
                </View>
              </View>

              {/* Terms Notice */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 12,
                padding: 16,
                backgroundColor: 'rgba(126,184,255,0.08)',
                borderWidth: 1,
                borderColor: 'rgba(126,184,255,0.15)',
                borderRadius: 14,
                marginBottom: 24,
              }}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.accent2} />
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 }}>
                  By continuing, you agree to our Cash Advance Terms and authorize automatic repayment from your connected account on the due date.
                </Text>
              </View>

              {/* Accept Button */}
              <Pressable onPress={handleAcceptApproval} style={{ width: '100%' }}>
                <LinearGradient
                  colors={[COLORS.accent, COLORS.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderRadius: 16,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.bg }}>Accept & Choose Amount</Text>
                </LinearGradient>
              </Pressable>

              {/* Decline Option */}
              <Pressable
                onPress={() => router.back()}
                style={{ marginTop: 16 }}
              >
                <Text style={{ fontSize: 14, color: COLORS.textMuted }}>No thanks, maybe later</Text>
              </Pressable>
            </View>
          )}

          {/* STEP 4: Select Amount */}
          {currentStep === 4 && (
            <View>
              {/* Approved Badge */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 8,
                backgroundColor: 'rgba(77,240,192,0.1)',
                borderWidth: 1,
                borderColor: 'rgba(77,240,192,0.2)',
                borderRadius: 20,
                alignSelf: 'flex-start',
                marginBottom: 16,
              }}>
                <Ionicons name="checkmark" size={14} color={COLORS.accent} />
                <Text style={{ fontSize: 13, color: COLORS.accent }}>Approved</Text>
              </View>

              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 24 }}>
                Choose your amount
              </Text>

              {/* Amount Display */}
              <View style={{ alignItems: 'center', marginBottom: 32, position: 'relative' }}>
                <View style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: COLORS.glow,
                  top: -50,
                }} />
                <Text style={{ fontSize: 56, fontWeight: '800', color: COLORS.text, letterSpacing: -2 }}>
                  {formatCurrency(selectedAmount, false)}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 8 }}>Maximum limit: $1,500</Text>
              </View>

              {/* Slider */}
              <View style={{ marginBottom: 24, paddingHorizontal: 8 }} {...panResponder.panHandlers}>
                <View style={{ height: 8, backgroundColor: COLORS.border, borderRadius: 4, position: 'relative' }}>
                  <LinearGradient
                    colors={[COLORS.accent, COLORS.accent2]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: `${sliderPercent}%`,
                      height: '100%',
                      borderRadius: 4,
                    }}
                  />
                  <View style={{
                    position: 'absolute',
                    top: -10,
                    left: `${sliderPercent}%`,
                    marginLeft: -14,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.text,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 10,
                  }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>$50</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>$1,500</Text>
                </View>
              </View>

              {/* Quick Select Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                {QUICK_AMOUNTS.map((amount) => (
                  <View key={amount} style={{ width: '23%' }}>
                    <QuickButton amount={amount} />
                  </View>
                ))}
              </View>

              {/* Breakdown Card */}
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                padding: 20,
                marginBottom: 16,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>You receive</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text }}>{formatCurrency(selectedAmount)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>One-time fee (5%)</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text }}>{formatCurrency(fee)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Due date</Text>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: COLORS.text }}>{dueDate.short}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 16, marginTop: 6 }}>
                  <Text style={{ fontSize: 13, color: COLORS.textSecondary }}>Total repayment</Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: COLORS.accent }}>{formatCurrency(total)}</Text>
                </View>
              </View>

              {/* Due Date Strip */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: 14,
                backgroundColor: 'rgba(126,184,255,0.06)',
                borderRadius: 14,
                marginBottom: 24,
              }}>
                <Text style={{ fontSize: 18 }}>📅</Text>
                <Text style={{ fontSize: 14, color: COLORS.text }}>{dueDate.full}</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(126,184,255,0.15)', borderRadius: 10 }}>
                  <Text style={{ fontSize: 12, color: COLORS.accent2 }}>13 days</Text>
                </View>
              </View>

              {/* Request Button */}
              <Pressable onPress={handleRequestAmount} disabled={isLoading}>
                <LinearGradient
                  colors={[COLORS.accent, COLORS.accent2]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderRadius: 16,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.bg} />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.bg }}>
                      Request {formatCurrency(selectedAmount, false)} →
                    </Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          )}

          {/* STEP 5: Success */}
          {currentStep === 5 && (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              {/* Success Icon */}
              <View style={{
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: COLORS.glowStrong,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
              }}>
                <Text style={{ fontSize: 48 }}>💸</Text>
              </View>

              <Text style={{ fontSize: 28, fontWeight: '700', color: COLORS.text, marginBottom: 8 }}>
                Cash on the way!
              </Text>
              <Text style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 16 }}>
                Sending to {selectedBank?.institutionName} ••••{selectedBank?.mask}
              </Text>
              <Text style={{ fontSize: 48, fontWeight: '800', color: COLORS.accent, marginBottom: 32, letterSpacing: -1 }}>
                {formatCurrency(selectedAmount, false)}
              </Text>

              {/* Info Card */}
              <View style={{
                width: '100%',
                backgroundColor: 'rgba(255,255,255,0.02)',
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 16,
                padding: 20,
                marginBottom: 24,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Arrival time</Text>
                  <Text style={{ fontSize: 14, color: COLORS.text }}>~2 minutes</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Repayment date</Text>
                  <Text style={{ fontSize: 14, color: COLORS.text }}>{dueDate.short}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }}>
                  <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Account</Text>
                  <Text style={{ fontSize: 14, color: COLORS.text }}>{selectedBank?.institutionName} ••••{selectedBank?.mask}</Text>
                </View>
              </View>

              {/* Buttons */}
              <View style={{ width: '100%', gap: 12 }}>
                <Pressable onPress={() => router.replace('/(tabs)/home')}>
                  <LinearGradient
                    colors={[COLORS.accent, COLORS.accent2]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      paddingVertical: 18,
                      alignItems: 'center',
                      borderRadius: 16,
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.bg }}>Done</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  onPress={() => router.push('/(tabs)/wallet')}
                  style={{
                    paddingVertical: 18,
                    alignItems: 'center',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '600', color: COLORS.text }}>View Transaction</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

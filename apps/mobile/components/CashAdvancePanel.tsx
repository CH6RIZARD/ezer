// =============================================================================
// EZER Mobile App - Cash Advance Panel Component
// Collapsible amount selector with fee breakdown - navigates to CashAdvanceFlow
// =============================================================================

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../utils/ThemeContext';
import { CASH_ADVANCE_MIN, CASH_ADVANCE_MAX, CASH_ADVANCE_PRESETS } from '../constants/money';

type CashAdvancePanelProps = {
  maxAmount?: number;
  onRequestAdvance?: (amount: number) => void;
};

const FEE_PERCENTAGE = 0.05;
const MIN_FEE = 2.99;

// Calculate fee (5%, minimum $2.99)
const calculateFee = (amount: number): number => {
  return Math.max(MIN_FEE, amount * FEE_PERCENTAGE);
};

// Get due date (14 days from now)
const getDueDate = (): string => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function CashAdvancePanel({ maxAmount = CASH_ADVANCE_MAX, onRequestAdvance }: CashAdvancePanelProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(CASH_ADVANCE_MIN);
  const [customAmount, setCustomAmount] = useState('');

  const activeAmount = selectedAmount || (customAmount ? parseInt(customAmount) : 0);
  const isValidAmount = activeAmount >= CASH_ADVANCE_MIN && activeAmount <= maxAmount;
  const fee = calculateFee(activeAmount);
  const totalRepayment = activeAmount + fee;
  const dueDate = getDueDate();

  const handleQuickSelect = (amount: number) => {
    if (amount <= maxAmount) {
      setSelectedAmount(amount);
      setCustomAmount('');
    }
  };

  const handleCustomAmountChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomAmount(numericText);
    setSelectedAmount(null);
  };

  const handleGetAdvance = () => {
    if (!isValidAmount) return;

    router.push({
      pathname: '/screens/CashAdvanceFlow',
      params: { amount: String(activeAmount) },
    });
  };

  // Accent color for button
  const accentColor = '#7C3AED';

  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 3,
    }}>
      {/* Header - Always Visible */}
      <Pressable
        onPress={() => setIsExpanded(!isExpanded)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 16,
          backgroundColor: colors.card,
        }}
      >
        <View style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: accentColor + '15',
          justifyContent: 'center',
          alignItems: 'center',
          marginRight: 12,
        }}>
          <Ionicons name="card-outline" size={22} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Cash Advance</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Up to ${maxAmount.toLocaleString()} available</Text>
        </View>
        {/* Selected amount badge */}
        {isValidAmount && (
          <View style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: accentColor + '40',
            marginRight: 8,
          }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: accentColor }}>${activeAmount}</Text>
          </View>
        )}
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
          {/* Select Amount Label */}
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 12 }}>Select amount</Text>

          {/* Quick Amount Buttons */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {CASH_ADVANCE_PRESETS.map((amount) => {
              const isDisabled = amount > maxAmount;
              const isActive = selectedAmount === amount;

              return (
                <Pressable
                  key={amount}
                  onPress={() => !isDisabled && handleQuickSelect(amount)}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 20,
                    backgroundColor: isActive ? colors.text : colors.background,
                    borderWidth: isActive ? 0 : 1,
                    borderColor: colors.text + '20',
                    opacity: isDisabled ? 0.4 : 1,
                  }}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: isActive ? colors.card : colors.text,
                  }}>
                    ${amount.toLocaleString()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom Amount Input */}
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>Or enter custom amount</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: colors.text + '10',
          }}>
            <Text style={{ fontSize: 18, fontWeight: '500', color: colors.textSecondary, marginRight: 4 }}>$</Text>
            <TextInput
              value={customAmount}
              onChangeText={handleCustomAmountChange}
              placeholder={selectedAmount ? selectedAmount.toString() : '0'}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              style={{
                flex: 1,
                fontSize: 18,
                fontWeight: '500',
                color: colors.text,
                padding: 0,
              }}
            />
          </View>

          {/* Fee Breakdown */}
          {isValidAmount && (
            <View style={{
              backgroundColor: colors.background,
              borderRadius: 12,
              padding: 16,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: colors.text + '08',
            }}>
              {/* Advance amount */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>Advance amount</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>${activeAmount.toFixed(2)}</Text>
              </View>

              {/* Fee */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.text + '10' }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>Fee (5%)</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>${fee.toFixed(2)}</Text>
              </View>

              {/* Total repayment */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>Total repayment</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>${totalRepayment.toFixed(2)}</Text>
              </View>

              {/* Due date */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, color: colors.textSecondary }}>Due date</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.text }}>{dueDate}</Text>
              </View>
            </View>
          )}

          {/* Get Advance Button */}
          <Pressable
            onPress={handleGetAdvance}
            disabled={!isValidAmount}
            accessibilityRole="button"
            style={{
              backgroundColor: isValidAmount ? accentColor : colors.background,
              paddingVertical: 16,
              borderRadius: 28,
              alignItems: 'center',
              marginBottom: 12,
              opacity: isValidAmount ? 1 : 0.6,
            }}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: isValidAmount ? '#FFFFFF' : colors.textSecondary,
            }}>
              Get ${activeAmount} Advance
            </Text>
          </Pressable>

          {/* Terms Text */}
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
            By proceeding, you agree to the Cash Advance terms.
          </Text>
        </View>
      )}
    </View>
  );
}

export default CashAdvancePanel;

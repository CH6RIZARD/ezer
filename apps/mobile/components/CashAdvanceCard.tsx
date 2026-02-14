import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, borderRadius, fontSize, fontWeight, shadow } from '@/theme/spacing';
import { formatCurrency, formatDateShort, clamp } from '@/utils/format';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface CashAdvanceState {
  eligible: boolean;
  eligibleLimit: number;
  reasonLocked?: string;
  selectedAmount: number;
  fee: number;
  totalRepayment: number;
  repaymentDate: string;
}

interface CashAdvanceCardProps {
  advanceState: CashAdvanceState;
  onAmountChange: (amount: number) => void;
  onPressGetAdvance: (amount: number) => void;
  onPressLearnUnlock: () => void;
}

const PRESET_AMOUNTS = [50, 100, 250, 500, 1000, 2000];
const MIN_AMOUNT = 50;
const MAX_AMOUNT = 2000;

export function CashAdvanceCard({
  advanceState,
  onAmountChange,
  onPressGetAdvance,
  onPressLearnUnlock,
}: CashAdvanceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { eligible, eligibleLimit, reasonLocked, selectedAmount, fee, totalRepayment, repaymentDate } = advanceState;

  const isValidAmount = selectedAmount >= MIN_AMOUNT && selectedAmount <= eligibleLimit;
  const canGetAdvance = eligible && isValidAmount;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);

    Animated.spring(rotateAnim, {
      toValue: expanded ? 0 : 1,
      useNativeDriver: true,
      tension: 300,
      friction: 15,
    }).start();
  };

  const handlePresetPress = (amount: number) => {
    if (amount <= eligibleLimit) {
      onAmountChange(amount);
      setCustomInput('');
    }
  };

  const handleSliderChange = (value: number) => {
    const clampedValue = clamp(Math.round(value / 10) * 10, MIN_AMOUNT, eligibleLimit);
    onAmountChange(clampedValue);
    setCustomInput('');
  };

  const handleCustomInputChange = (text: string) => {
    const numericText = text.replace(/[^0-9]/g, '');
    setCustomInput(numericText);

    if (numericText) {
      const amount = parseInt(numericText, 10);
      if (!isNaN(amount)) {
        onAmountChange(clamp(amount, 0, MAX_AMOUNT));
      }
    }
  };

  const handleCustomInputBlur = () => {
    if (customInput) {
      const amount = parseInt(customInput, 10);
      if (!isNaN(amount)) {
        const clamped = clamp(amount, MIN_AMOUNT, eligibleLimit);
        onAmountChange(clamped);
        setCustomInput(clamped.toString());
      }
    }
  };

  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const sliderPosition = ((selectedAmount - MIN_AMOUNT) / (eligibleLimit - MIN_AMOUNT)) * 100;

  return (
    <View style={styles.container}>
      {/* Header - Always visible */}
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
        accessibilityLabel={`Cash Advance, ${expanded ? 'collapse' : 'expand'}`}
        accessibilityRole="button"
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, !eligible && styles.iconCircleLocked]}>
            <Text style={styles.icon}>{eligible ? '💵' : '🔒'}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Cash Advance</Text>
            <Text style={styles.subtitle}>
              {eligible
                ? `Up to ${formatCurrency(eligibleLimit, false)} available`
                : 'Locked'
              }
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {eligible && selectedAmount > 0 && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>
                {formatCurrency(selectedAmount, false)}
              </Text>
            </View>
          )}
          <Animated.Text
            style={[styles.chevron, { transform: [{ rotate: chevronRotation }] }]}
          >
            ▼
          </Animated.Text>
        </View>
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.content}>
          {!eligible ? (
            // Locked State
            <View style={styles.lockedContainer}>
              <View style={styles.lockedIconContainer}>
                <Text style={styles.lockedIcon}>🔐</Text>
              </View>
              <Text style={styles.lockedTitle}>Cash Advance Locked</Text>
              <Text style={styles.lockedReason}>
                {reasonLocked || 'You\'re not yet eligible for Cash Advance.'}
              </Text>
              <Pressable
                onPress={onPressLearnUnlock}
                style={({ pressed }) => [
                  styles.learnButton,
                  pressed && styles.learnButtonPressed,
                ]}
                accessibilityLabel="Learn how to unlock Cash Advance"
                accessibilityRole="button"
              >
                <Text style={styles.learnButtonText}>Learn how to unlock →</Text>
              </Pressable>
            </View>
          ) : (
            // Active State
            <View style={styles.activeContainer}>
              {/* Preset Chips */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Select amount</Text>
                <View style={styles.chipsContainer}>
                  {PRESET_AMOUNTS.map((amount) => {
                    const isDisabled = amount > eligibleLimit;
                    const isSelected = amount === selectedAmount;

                    return (
                      <Pressable
                        key={amount}
                        onPress={() => handlePresetPress(amount)}
                        disabled={isDisabled}
                        style={({ pressed }) => [
                          styles.chip,
                          isSelected && styles.chipSelected,
                          isDisabled && styles.chipDisabled,
                          pressed && !isDisabled && styles.chipPressed,
                        ]}
                        accessibilityLabel={`${formatCurrency(amount, false)}${isDisabled ? ', not available' : ''}`}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.chipText,
                            isSelected && styles.chipTextSelected,
                            isDisabled && styles.chipTextDisabled,
                          ]}
                        >
                          {formatCurrency(amount, false)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Slider */}
              <View style={styles.section}>
                <View style={styles.sliderContainer}>
                  <View style={styles.sliderTrack}>
                    <View
                      style={[styles.sliderFill, { width: `${sliderPosition}%` }]}
                    />
                    <View
                      style={[styles.sliderThumb, { left: `${sliderPosition}%` }]}
                    />
                  </View>
                  <View style={styles.sliderLabels}>
                    <Text style={styles.sliderLabel}>{formatCurrency(MIN_AMOUNT, false)}</Text>
                    <Text style={styles.sliderLabel}>{formatCurrency(eligibleLimit, false)}</Text>
                  </View>
                </View>
              </View>

              {/* Custom Input */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Or enter custom amount</Text>
                <View style={styles.customInputContainer}>
                  <Text style={styles.currencyPrefix}>$</Text>
                  <TextInput
                    style={styles.customInput}
                    value={customInput || (selectedAmount > 0 ? selectedAmount.toString() : '')}
                    onChangeText={handleCustomInputChange}
                    onBlur={handleCustomInputBlur}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    maxLength={4}
                    accessibilityLabel="Custom advance amount"
                  />
                </View>
              </View>

              {/* Summary */}
              {selectedAmount > 0 && (
                <View style={styles.summaryContainer}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Advance amount</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(selectedAmount)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Fee</Text>
                    <Text style={styles.summaryValue}>{formatCurrency(fee)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabelBold}>Total repayment</Text>
                    <Text style={styles.summaryValueBold}>{formatCurrency(totalRepayment)}</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Due date</Text>
                    <Text style={styles.summaryValue}>{formatDateShort(repaymentDate)}</Text>
                  </View>
                </View>
              )}

              {/* CTA Button */}
              <Pressable
                onPress={() => onPressGetAdvance(selectedAmount)}
                disabled={!canGetAdvance}
                style={({ pressed }) => [
                  styles.ctaButton,
                  !canGetAdvance && styles.ctaButtonDisabled,
                  pressed && canGetAdvance && styles.ctaButtonPressed,
                ]}
                accessibilityLabel={`Get ${formatCurrency(selectedAmount, false)} advance`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canGetAdvance }}
              >
                <Text
                  style={[
                    styles.ctaButtonText,
                    !canGetAdvance && styles.ctaButtonTextDisabled,
                  ]}
                >
                  {canGetAdvance
                    ? `Get ${formatCurrency(selectedAmount, false)} Advance`
                    : 'Select an amount'
                  }
                </Text>
              </Pressable>

              {/* Terms note */}
              <Text style={styles.termsNote}>
                By proceeding, you agree to the Cash Advance terms.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  headerPressed: {
    backgroundColor: colors.backgroundCream,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconCircleLocked: {
    backgroundColor: colors.borderLight,
  },
  icon: {
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  selectedBadgeText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  chevron: {
    fontSize: 12,
    color: colors.textMuted,
  },
  content: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  // Locked State
  lockedContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  lockedIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lockedIcon: {
    fontSize: 28,
  },
  lockedTitle: {
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  lockedReason: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  learnButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  learnButtonPressed: {
    opacity: 0.7,
  },
  learnButtonText: {
    fontSize: fontSize.md,
    color: colors.primary,
    fontWeight: fontWeight.semibold,
  },
  // Active State
  activeContainer: {
    padding: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontWeight: fontWeight.medium,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.xs,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.backgroundCream,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: {
    backgroundColor: colors.borderLight,
    borderColor: colors.borderLight,
  },
  chipPressed: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryLight,
  },
  chipText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  chipTextSelected: {
    color: colors.textInverse,
  },
  chipTextDisabled: {
    color: colors.textMuted,
  },
  sliderContainer: {
    paddingHorizontal: spacing.sm,
  },
  sliderTrack: {
    height: 8,
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    position: 'relative',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.cardBackground,
    borderWidth: 3,
    borderColor: colors.primary,
    marginLeft: -10,
    ...shadow.md,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sliderLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCream,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  currencyPrefix: {
    fontSize: fontSize.xl,
    color: colors.textSecondary,
    fontWeight: fontWeight.medium,
  },
  customInput: {
    flex: 1,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  summaryContainer: {
    backgroundColor: colors.backgroundCream,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  summaryLabelBold: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
  },
  summaryValueBold: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ctaButtonDisabled: {
    backgroundColor: colors.borderLight,
  },
  ctaButtonPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.99 }],
  },
  ctaButtonText: {
    fontSize: fontSize.md,
    color: colors.textInverse,
    fontWeight: fontWeight.bold,
  },
  ctaButtonTextDisabled: {
    color: colors.textMuted,
  },
  termsNote: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

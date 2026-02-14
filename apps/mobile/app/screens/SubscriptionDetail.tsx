// =============================================================================
// EZER Mobile App - Subscription Detail Screen
// Shows charge history, price timeline, investment opportunity, and cancel CTA
// =============================================================================

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Pressable, Switch, Dimensions, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../../utils/ThemeContext';
import { Card, Button } from '../../components';
import { demoCharges, demoMerchants } from '../../utils/demoData';
import {
  formatCents,
  formatDollars,
  formatDate,
  formatBillingInterval,
  calculateLifetimeTotal,
  groupChargesByMonth,
  calculateOpportunityCost,
  calculateMonthsOfHistory,
  getMonthlyEquivalent,
} from '../../utils/calculations';

const screenWidth = Dimensions.get('window').width;

export default function SubscriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ merchantId: string }>();
  const merchantId = params.merchantId || 'netflix';

  const [showInvestment, setShowInvestment] = useState(false);
  const [selectedPaymentOption, setSelectedPaymentOption] = useState<string | null>(null);

  const merchant = demoMerchants[merchantId] || {
    id: merchantId,
    canonicalName: 'Unknown Merchant',
    fingerprintKeys: [],
    cancellationDifficulty: 'Medium' as const,
    difficultyLastUpdatedAt: new Date(),
  };

  // Get all charges for this merchant
  const merchantCharges = useMemo(() => {
    return demoCharges
      .filter((c) => c.merchantId === merchantId)
      .sort((a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime());
  }, [merchantId]);

  // Calculate totals
  const lifetimeTotal = useMemo(() => {
    return calculateLifetimeTotal(merchantCharges);
  }, [merchantCharges]);

  // Group by month for price timeline
  const monthlyHistory = useMemo(() => {
    return groupChargesByMonth(merchantCharges);
  }, [merchantCharges]);

  // Calculate investment opportunity cost
  const investmentValue = useMemo(() => {
    if (merchantCharges.length === 0) return 0;
    const latestCharge = merchantCharges[0];
    const monthlyAmount = getMonthlyEquivalent(latestCharge.amountCents, latestCharge.billingInterval);
    const months = calculateMonthsOfHistory(merchantCharges);
    return calculateOpportunityCost(monthlyAmount, months);
  }, [merchantCharges]);

  const handleBack = () => {
    router.back();
  };

  const handleCancelSubscription = () => {
    router.push({
      pathname: '/screens/CancelFlow',
      params: { merchantId },
    });
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'Easy to cancel';
      case 'Medium':
        return 'Medium difficulty';
      case 'Hard':
        return 'Hard to cancel';
      default:
        return 'Unknown';
    }
  };

  // Calculate investment with 3% APR - with and without reinvestment
  const calculateInvestmentWithReinvest = (monthly: number, months: number): string => {
    const monthlyRate = 3 / 12 / 100; // 3% annual = 0.25% monthly
    let futureValue = 0;
    for (let i = 0; i < months; i++) {
      futureValue = (futureValue + monthly) * (1 + monthlyRate);
    }
    return futureValue.toFixed(2);
  };

  const calculateInvestmentCashDividends = (monthly: number, months: number): string => {
    const monthlyRate = 3 / 12 / 100;
    let principal = 0;
    let totalDividends = 0;

    for (let i = 0; i < months; i++) {
      principal += monthly;
      totalDividends += principal * monthlyRate;
    }

    return (principal + totalDividends).toFixed(2);
  };

  const monthsActive = useMemo(() => {
    return calculateMonthsOfHistory(merchantCharges);
  }, [merchantCharges]);

  const currentPriceCents = useMemo(() => {
    return merchantCharges.length > 0 ? merchantCharges[0].amountCents : 0;
  }, [merchantCharges]);

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
        {/* Merchant Header */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.textSecondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.card, fontSize: 28, fontWeight: '700' }}>
              {merchant.canonicalName.charAt(0)}
            </Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            {merchant.canonicalName}
          </Text>
          <View
            style={{
              backgroundColor: colors.textSecondary,
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            <Text style={{ fontSize: 12, color: colors.text, fontWeight: '500' }}>
              {getDifficultyLabel(merchant.cancellationDifficulty)}
            </Text>
          </View>
        </View>

        {/* Charge History */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
            Charge History
          </Text>
          {merchantCharges.slice(0, 6).map((charge) => (
            <View
              key={charge.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View>
                <Text style={{ fontSize: 14, color: colors.text, marginBottom: 2 }}>
                  {formatDate(charge.chargeTimestamp)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  {formatBillingInterval(charge.billingInterval)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.danger, marginBottom: 2 }}>
                  {formatCents(charge.amountCents)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                  {Math.round(charge.confidenceScore * 100)}%
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Interactive Price Chart */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 20,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
            See How You're Getting Charged
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
            {merchant.canonicalName}'s price changes over time
          </Text>

          {monthlyHistory.length > 1 && (
            <>
              <View
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <LineChart
                  data={{
                    labels: monthlyHistory.slice().reverse().map(p => p.month.split(' ')[0].substring(0, 3)),
                    datasets: [{
                      data: monthlyHistory.slice().reverse().map(p => p.amountCents / 100),
                      color: () => colors.card,
                      strokeWidth: 3,
                    }],
                  }}
                  width={screenWidth - 88}
                  height={200}
                  chartConfig={{
                    backgroundColor: colors.primary,
                    backgroundGradientFrom: colors.primary,
                    backgroundGradientTo: '#7C3AED',
                    decimalPlaces: 2,
                    color: () => colors.card,
                    labelColor: () => colors.card,
                    propsForDots: {
                      r: '8',
                      strokeWidth: '3',
                      stroke: colors.card,
                      fill: colors.primary,
                    },
                    propsForBackgroundLines: {
                      stroke: 'rgba(255,255,255,0.2)',
                      strokeWidth: 1,
                    },
                  }}
                  bezier
                  withShadow={false}
                  style={{ borderRadius: 12 }}
                  withInnerLines={true}
                  withOuterLines={false}
                  withVerticalLines={false}
                  formatYLabel={(v) => `$${v}`}
                  onDataPointClick={({ value, index }) => {
                    const reversedHistory = monthlyHistory.slice().reverse();
                    Alert.alert(reversedHistory[index].month, `You paid $${value.toFixed(2)}`);
                  }}
                />
              </View>

              {/* SHOW BADGES ONLY FOR LAST 3 MONTHS - "since [month]" format */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {monthlyHistory.map((item, i) => {
                  if (i === 0) return null;

                  // Filter to only last 3 months
                  const threeMonthsAgo = new Date();
                  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

                  // Parse month string to date (assuming format like "Jan 2024")
                  const [monthName, year] = item.month.split(' ');
                  const monthIndex = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(monthName.substring(0, 3));
                  const itemDate = new Date(parseInt(year), monthIndex, 1);

                  if (itemDate < threeMonthsAgo) return null; // SKIP OLD MONTHS

                  const change = item.amountCents - monthlyHistory[i - 1].amountCents;
                  if (change === 0) return null;

                  const isIncrease = change > 0;
                  const prevMonth = monthlyHistory[i - 1].month.split(' ')[0].substring(0, 3);

                  return (
                    <View
                      key={i}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 12,
                        backgroundColor: isIncrease ? '#FEF3C7' : '#D1FAE5',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: isIncrease ? '#D97706' : '#059669',
                        }}
                      >
                        {isIncrease ? '↑' : '↓'} ${Math.abs(change / 100).toFixed(2)} since {prevMonth}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>

        {/* Smart Payment Options - ONLY 2 OPTIONS */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 20,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
            Smart Payment Options
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
            Always pay full subscription + automate savings
          </Text>

          {/* Pay Full + Save Half */}
          <Pressable
            style={{
              backgroundColor: selectedPaymentOption === 'split' ? '#FFFBF0' : colors.background,
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
              borderWidth: 2,
              borderColor: selectedPaymentOption === 'split' ? colors.accent : colors.border,
            }}
            onPress={() => setSelectedPaymentOption('split')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 32 }}>💰</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                  Pay Full + Save Half
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  Pay ${(currentPriceCents / 100).toFixed(2)} subscription + transfer ${(currentPriceCents / 200).toFixed(2)} to savings (${(currentPriceCents * 1.5 / 100).toFixed(2)} total/month)
                </Text>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {selectedPaymentOption === 'split' && (
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
          </Pressable>

          {/* Pay Full + Match Full */}
          <Pressable
            style={{
              backgroundColor: selectedPaymentOption === 'double' ? '#FFFBF0' : colors.background,
              padding: 16,
              borderRadius: 12,
              marginBottom: 12,
              borderWidth: 2,
              borderColor: selectedPaymentOption === 'double' ? colors.accent : colors.border,
            }}
            onPress={() => setSelectedPaymentOption('double')}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 32 }}>📈</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                  Pay Full + Match Full
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  Pay ${(currentPriceCents / 100).toFixed(2)} subscription + transfer ${(currentPriceCents / 100).toFixed(2)} to investment (${(currentPriceCents * 2 / 100).toFixed(2)} total/month)
                </Text>
              </View>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                {selectedPaymentOption === 'double' && (
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
          </Pressable>

          {selectedPaymentOption && (
            <Pressable
              style={{
                backgroundColor: colors.primary,
                paddingVertical: 16,
                borderRadius: 12,
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <Text style={{ color: colors.card, fontSize: 16, fontWeight: '700' }}>
                Enable Smart Saving
              </Text>
            </Pressable>
          )}
        </View>

        {/* Save Smart Section */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 20,
            borderRadius: 16,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                Save Smart
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 4, maxWidth: '90%' }}>
                See how your savings would grow over time
              </Text>
            </View>
            <Switch
              value={showInvestment}
              onValueChange={setShowInvestment}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={showInvestment ? colors.primary : colors.textSecondary}
            />
          </View>

          {showInvestment && (
            <>
              <Text style={{ fontSize: 14, color: colors.text, marginBottom: 16, fontWeight: '600' }}>
                With ${(currentPriceCents / 100).toFixed(2)}/mo automatically saved:
              </Text>

              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                {/* 6 Months */}
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => Alert.alert(
                    'After 6 Months',
                    `By saving ${formatCents(currentPriceCents)}/month, you'll have ${formatCents(currentPriceCents * 6)} after 6 months.`
                  )}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                    After 6 months
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] }}>
                    ${((currentPriceCents / 100) * 6).toFixed(2)}
                  </Text>
                </Pressable>

                {/* 1 Year */}
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: '#F5F3FF',
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: colors.primary,
                  }}
                  onPress={() => Alert.alert(
                    'After 1 Year',
                    `By saving ${formatCents(currentPriceCents)}/month, you'll have ${formatCents(currentPriceCents * 12)} after 1 year.`
                  )}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                    After 1 year
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] }}>
                    ${((currentPriceCents / 100) * 12).toFixed(2)}
                  </Text>
                </Pressable>

                {/* 2 Years */}
                <Pressable
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    padding: 16,
                    borderRadius: 12,
                    alignItems: 'center',
                  }}
                  onPress={() => Alert.alert(
                    'After 2 Years',
                    `By saving ${formatCents(currentPriceCents)}/month, you'll have ${formatCents(currentPriceCents * 24)} after 2 years without changing your lifestyle!`
                  )}
                >
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
                    After 2 years
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: colors.primary, fontVariant: ['tabular-nums'] }}>
                    ${((currentPriceCents / 100) * 24).toFixed(2)}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={{
                  backgroundColor: colors.success,
                  padding: 12,
                  borderRadius: 12,
                }}
                onPress={() => Alert.alert(
                  'Smart Savings',
                  `That's ${formatCents(currentPriceCents * 24)} saved over 2 years without changing your lifestyle. The subscription is paid in full, and savings are automatically transferred from your linked account.`
                )}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.card, textAlign: 'center' }}>
                  That's ${((currentPriceCents / 100) * 24).toFixed(2)} saved without changing your lifestyle
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* Lifetime Total */}
        <Card style={{ marginBottom: 24, padding: 20 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>
            This has cost you more than
          </Text>
          <Text style={{ fontSize: 36, fontWeight: '700', color: colors.danger }}>
            {formatDollars(lifetimeTotal)}
          </Text>
        </Card>

        {/* Cancel CTA */}
        <View style={{ marginTop: 8 }}>
          <Button
            title="Cancel Subscription"
            variant="danger"
            onPress={handleCancelSubscription}
          />
        </View>
      </ScrollView>
    </View>
  );
}

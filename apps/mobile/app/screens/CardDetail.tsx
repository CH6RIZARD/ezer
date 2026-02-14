// =============================================================================
// EZER Mobile App - Card Detail Screen
// Shows merchant list for a specific card with drain details
// =============================================================================

import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Card, CreditCard, MerchantLogo } from '../../components';
import {
  demoFundingInstruments,
  demoCharges,
  demoMerchants,
  groupChargesByMerchant,
} from '../../utils/demoData';
import {
  calculateDrain,
  getDateRange,
  formatDollars,
  formatCents,
  getMonthlyEquivalent,
  getConfidenceLevel,
} from '../../utils/calculations';
import type { MerchantChargeGroup, BillingInterval } from '../../types';

export default function CardDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ cardId: string; dateRangeType: string }>();

  const cardId = params.cardId || '1';
  const dateRangeType = (params.dateRangeType || 'last30') as 'last30' | 'thisMonth' | 'last90';

  const card = demoFundingInstruments.find((c) => c.id === cardId) || demoFundingInstruments[0];
  const dateRange = getDateRange(dateRangeType);

  // Get charges for this card within date range
  const cardCharges = useMemo(() => {
    return demoCharges.filter(
      (c) =>
        c.fundingInstrumentId === card.id &&
        new Date(c.chargeTimestamp) >= dateRange.start &&
        new Date(c.chargeTimestamp) <= dateRange.end
    );
  }, [card.id, dateRange]);

  // Total drain
  const totalDrain = useMemo(() => {
    return cardCharges.reduce((sum, c) => sum + c.amountCents, 0) / 100;
  }, [cardCharges]);

  // Group by merchant
  const merchantGroups: MerchantChargeGroup[] = useMemo(() => {
    const grouped = groupChargesByMerchant(cardCharges);
    return Object.entries(grouped)
      .map(([merchantId, charges]) => {
        const merchant = demoMerchants[merchantId];
        const latestCharge = charges.sort(
          (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
        )[0];

        return {
          merchantId,
          merchantName: charges[0].merchantName,
          merchant: merchant || {
            id: merchantId,
            canonicalName: charges[0].merchantName,
            fingerprintKeys: [],
            cancellationDifficulty: 'Medium' as const,
            difficultyLastUpdatedAt: new Date(),
          },
          charges,
          totalCents: charges.reduce((sum, c) => sum + c.amountCents, 0),
          chargeCount: charges.length,
          billingInterval: latestCharge.billingInterval,
          latestCharge,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
  }, [cardCharges]);

  const handleMerchantPress = (merchantId: string) => {
    router.push({
      pathname: '/screens/SubscriptionDetail',
      params: { merchantId },
    });
  };

  const handleBack = () => {
    router.back();
  };

  const formatPrice = (amountCents: number, interval: BillingInterval): string => {
    const amount = formatCents(amountCents);
    if (interval === 'yearly') {
      const monthly = getMonthlyEquivalent(amountCents, interval);
      return `${amount}/yr (${formatDollars(monthly)}/mo)`;
    }
    return `${amount}/mo`;
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
        {/* Card Visual */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <CreditCard card={card} size="small" />
        </View>

        {/* Date Range & Total */}
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>
            {dateRange.label}
          </Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: colors.danger }}>
            {formatDollars(totalDrain)}
          </Text>
        </View>

        {/* Badge Guide */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 4 }}>
            Badge Guide
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
            • Price: High ($15+/mo) or Low
          </Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, lineHeight: 18 }}>
            • Cancel: Easy (1-click) | Medium (multi-step) | Hard (must call)
          </Text>
        </View>

        {/* Merchant List */}
        <View style={{ gap: 12 }}>
          {merchantGroups.map((group) => {
            const monthlyPrice = getMonthlyEquivalent(group.latestCharge.amountCents, group.billingInterval);
            const isHighPrice = monthlyPrice > 1500; // $15/mo
            const difficulty = group.merchant.cancellationDifficulty;

            return (
              <TouchableOpacity
                key={group.merchantId}
                onPress={() => handleMerchantPress(group.merchantId)}
                activeOpacity={0.7}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.card,
                    padding: 16,
                    borderRadius: 12,
                    marginBottom: 12,
                  }}
                >
                  <MerchantLogo merchantName={group.merchantName} merchantColor={group.merchant.merchantColor} size={48} />

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>
                      {group.merchantName}
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 2 }}>
                      {formatPrice(group.latestCharge.amountCents, group.billingInterval)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                      Charged {group.chargeCount}x
                    </Text>
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                      {formatCents(group.totalCents)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
                      <View
                        style={{
                          backgroundColor: isHighPrice ? '#FEF3C7' : '#D1FAE5',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '600',
                            color: isHighPrice ? '#D97706' : '#059669',
                          }}
                        >
                          {isHighPrice ? 'High' : 'Low'}
                        </Text>
                      </View>
                      <View
                        style={{
                          backgroundColor:
                            difficulty === 'Hard'
                              ? colors.danger
                              : difficulty === 'Medium'
                                ? '#F59E0B'
                                : colors.success,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.card }}>
                          {difficulty}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {merchantGroups.length === 0 && (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>
              No charges found for this period
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

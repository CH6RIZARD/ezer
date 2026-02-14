// =============================================================================
// EZER Mobile App - Wallet Tab
// Card carousel with drain summary
// =============================================================================

import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Card, Button, CreditCard } from '../../components';
import {
  demoFundingInstruments,
  demoCharges,
  demoMerchants,
  groupChargesByMerchant,
} from '../../utils/demoData';
import { calculateDrain, getDateRange, formatDollars } from '../../utils/calculations';
import type { FundingInstrument, DateRange } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_SPACING = 16;

type DateRangeType = 'sinceStart' | 'thisMonth' | 'lastYear';

const DATE_RANGE_OPTIONS: { key: DateRangeType; label: string }[] = [
  { key: 'sinceStart', label: 'Since Start' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastYear', label: 'Last Year' },
];

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeType>('sinceStart');

  const cards = demoFundingInstruments;
  const activeCard = cards[activeCardIndex];
  const dateRange = getDateRange(selectedDateRange, demoCharges);

  // Calculate drain for active card
  const drainAmount = useMemo(() => {
    return calculateDrain(demoCharges, activeCard.id, dateRange);
  }, [activeCard.id, dateRange]);

  // Get charges for active card
  const cardCharges = useMemo(() => {
    return demoCharges.filter(
      (c) =>
        c.fundingInstrumentId === activeCard.id &&
        new Date(c.chargeTimestamp) >= dateRange.start &&
        new Date(c.chargeTimestamp) <= dateRange.end
    );
  }, [activeCard.id, dateRange]);

  // Group by merchant and get top 3
  const topMerchants = useMemo(() => {
    const grouped = groupChargesByMerchant(cardCharges);
    const sorted = Object.entries(grouped)
      .map(([merchantId, charges]) => ({
        merchantId,
        merchantName: charges[0].merchantName,
        total: charges.reduce((sum, c) => sum + c.amountCents, 0),
      }))
      .sort((a, b) => b.total - a.total);
    return sorted.slice(0, 3);
  }, [cardCharges]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const index = Math.round(x / (CARD_WIDTH + CARD_SPACING));
    if (index !== activeCardIndex && index >= 0 && index < cards.length) {
      setActiveCardIndex(index);
    }
  };

  const handleCardPress = (index: number) => {
    setActiveCardIndex(index);
    scrollRef.current?.scrollTo({
      x: index * (CARD_WIDTH + CARD_SPACING),
      animated: true,
    });
  };

  const handleReviewDrain = () => {
    router.push({
      pathname: '/screens/CardDetail',
      params: {
        cardId: activeCard.id,
        dateRangeType: selectedDateRange,
      },
    });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* EZER Branding - Fixed Position */}
      <View style={{ position: 'absolute', top: 16, right: 24, zIndex: 1000 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.accent, letterSpacing: 2 }}>EZER</Text>
      </View>

      {/* Title */}
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Wallet</Text>

      {/* Card Carousel */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        contentContainerStyle={{ paddingHorizontal: 24 }}
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        decelerationRate="fast"
      >
        {cards.map((card, index) => (
          <TouchableOpacity
            key={card.id}
            onPress={() => handleCardPress(index)}
            activeOpacity={0.9}
            style={[{ width: CARD_WIDTH }, index < cards.length - 1 && { marginRight: CARD_SPACING }]}
          >
            <CreditCard
              card={card}
              isActive={index === activeCardIndex}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Card Indicator Dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16, gap: 8 }}>
        {cards.map((_, index) => (
          <View
            key={index}
            style={{
              width: index === activeCardIndex ? 24 : 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: index === activeCardIndex ? colors.accent : colors.textSecondary,
            }}
          />
        ))}
      </View>

      {/* Date Range Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, marginTop: 24, gap: 12 }}
      >
        {DATE_RANGE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: selectedDateRange === option.key ? colors.accent : colors.text,
              backgroundColor: selectedDateRange === option.key ? colors.accent : 'transparent',
              marginRight: 12,
            }}
            onPress={() => setSelectedDateRange(option.key)}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: selectedDateRange === option.key ? '#FFFFFF' : colors.text,
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Summary Card */}
      <Card style={{ marginHorizontal: 0, marginTop: 24, padding: 20 }}>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 8 }}>
          Total Drained ({dateRange.label})
        </Text>
        <Text style={{ fontSize: 36, fontWeight: '700', color: colors.danger, marginBottom: 12 }}>
          {formatDollars(drainAmount)}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
          {topMerchants.length} active subscription{topMerchants.length !== 1 ? 's' : ''}
        </Text>
      </Card>

      {/* Subscription Breakdown (only for Since Start) */}
      {selectedDateRange === 'sinceStart' && topMerchants.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Subscription Breakdown</Text>
          {topMerchants.map((merchant) => {
            const merchantCharges = cardCharges.filter(c => c.merchantId === merchant.merchantId);
            const merchantColor = demoMerchants[merchant.merchantId]?.brandColor || colors.textSecondary;

            return (
              <View
                key={merchant.merchantId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.card,
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 12,
                  shadowColor: colors.shadow,
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: merchantColor,
                  marginRight: 12,
                }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>{merchant.merchantName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 4 }}>{merchant.merchantName}</Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                    {merchantCharges.length} charge{merchantCharges.length !== 1 ? 's' : ''} since start
                  </Text>
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.danger }}>
                  {formatDollars(merchant.total / 100)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Primary CTA */}
      <View style={{ marginTop: 24 }}>
        <Button
          title="Review Card Drain"
          onPress={handleReviewDrain}
          variant="primary"
        />
      </View>
    </ScrollView>
  );
}

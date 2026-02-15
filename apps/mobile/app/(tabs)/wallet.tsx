// =============================================================================
// EZER Mobile App - Wallet Tab
// Card carousel with drain summary; date range: Custom, This Month, Last Year
// =============================================================================

import React, { useState, useMemo, useRef, useEffect } from 'react';
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
import { usePremium } from '../../utils/PremiumContext';
import { useDateRange } from '../../utils/DateRangeContext';
import { Card, Button, CreditCard, CustomDateRangeModal } from '../../components';
import {
  demoFundingInstruments,
  demoCharges,
  demoMerchants,
  groupChargesByMerchant,
} from '../../utils/demoData';
import { calculateDrain, formatDollars } from '../../utils/calculations';
import type { FundingInstrument } from '../../types';
import type { DateRangeType } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_PADDING = 24; // matches outer ScrollView paddingHorizontal
const CARD_WIDTH = SCREEN_WIDTH - 48;
const CARD_SPACING = 16;
const CAROUSEL_VIEWPORT_WIDTH = SCREEN_WIDTH - CAROUSEL_PADDING * 2;

const PRESET_KEYS: DateRangeType[] = ['custom', 'thisMonth', 'lastYear'];

function getChargesSubtitle(type: DateRangeType): string {
  switch (type) {
    case 'thisMonth':
      return 'this month';
    case 'lastYear':
      return 'last year';
    case 'custom':
    default:
      return 'in range';
  }
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { status: premiumStatus } = usePremium();
  const { dateRange, setPreset, setCustomRange, setCustomPickerOpen, isCustomPickerOpen } = useDateRange();

  useEffect(() => {
    if (premiumStatus === 'expired') router.replace('/screens/Paywall');
  }, [premiumStatus]);
  const scrollRef = useRef<ScrollView>(null);
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const cards = demoFundingInstruments;
  const activeCard = cards[activeCardIndex];
  const { start, end } = dateRange;

  // Calculate drain for active card using same range as context
  const drainAmount = useMemo(() => {
    return calculateDrain(demoCharges, activeCard.id, { type: dateRange.type, start, end, label: dateRange.label });
  }, [activeCard.id, dateRange.type, start, end, dateRange.label]);

  // Get charges for active card in range
  const cardCharges = useMemo(() => {
    return demoCharges.filter(
      (c) =>
        c.fundingInstrumentId === activeCard.id &&
        new Date(c.chargeTimestamp) >= start &&
        new Date(c.chargeTimestamp) <= end
    );
  }, [activeCard.id, start, end]);

  // All merchants with charges in range (for Subscription Breakdown)
  const breakdownMerchants = useMemo(() => {
    const grouped = groupChargesByMerchant(cardCharges);
    return Object.entries(grouped)
      .map(([merchantId, charges]) => ({
        merchantId,
        merchantName: charges[0].merchantName,
        total: charges.reduce((sum, c) => sum + c.amountCents, 0),
        count: charges.length,
      }))
      .sort((a, b) => b.total - a.total);
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
      params: { cardId: activeCard.id },
    });
  };

  const handleChipPress = (key: DateRangeType) => {
    if (key === 'custom') {
      setCustomPickerOpen(true);
    } else {
      setPreset(key);
    }
  };

  const chipLabel = (key: DateRangeType) => {
    if (key === 'custom') {
      return dateRange.type === 'custom' ? dateRange.label : 'Select range';
    }
    if (key === 'thisMonth') return 'This Month';
    if (key === 'lastYear') return 'Last Year';
    return key;
  };

  const isSelected = (key: DateRangeType) => {
    if (key === 'custom') return dateRange.type === 'custom';
    return dateRange.type === key;
  };

  const chargesSubtitle = getChargesSubtitle(dateRange.type);

  // Constrain custom date range to what the API/charges data supports
  const { minChargeDate, maxChargeDate } = useMemo(() => {
    if (demoCharges.length === 0) {
      const now = new Date();
      return { minChargeDate: new Date(now.getFullYear() - 1, now.getMonth(), 1), maxChargeDate: now };
    }
    const times = demoCharges.map((c) => new Date(c.chargeTimestamp).getTime());
    return { minChargeDate: new Date(Math.min(...times)), maxChargeDate: new Date(Math.max(...times)) };
  }, []);

  const topInset = Math.max(insets.top, 44);
  const headerBarHeight = 52;
  const paddingTop = topInset + 8;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop, paddingBottom: insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* EZER Branding - Fixed Position, same height as header bar for center alignment */}
      <View style={{ position: 'absolute', top: paddingTop, right: 24, height: headerBarHeight, justifyContent: 'center', zIndex: 1000 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.accent, letterSpacing: 2 }}>EZER</Text>
      </View>

      {/* Title - in fixed-height bar so center mass aligns with status bar */}
      <View style={{ minHeight: headerBarHeight, justifyContent: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Wallet</Text>
      </View>

      {/* Card Carousel - centered like web */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        contentContainerStyle={{
          paddingHorizontal: (CAROUSEL_VIEWPORT_WIDTH - CARD_WIDTH) / 2,
          alignItems: 'center',
        }}
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="center"
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
        {PRESET_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: isSelected(key) ? colors.accent : colors.text,
              backgroundColor: isSelected(key) ? colors.accent : 'transparent',
              marginRight: 12,
            }}
            onPress={() => handleChipPress(key)}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '500',
                color: isSelected(key) ? '#FFFFFF' : colors.text,
              }}
            >
              {chipLabel(key)}
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
          {breakdownMerchants.length} active subscription{breakdownMerchants.length !== 1 ? 's' : ''}
        </Text>
      </Card>

      {/* Subscription Breakdown - for all date ranges */}
      {breakdownMerchants.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Subscription Breakdown</Text>
          {breakdownMerchants.map((merchant) => {
            const merchantCharges = cardCharges.filter((c) => c.merchantId === merchant.merchantId);
            const merchantColor = (demoMerchants[merchant.merchantId] as { brandColor?: string })?.brandColor || colors.textSecondary;

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
                    {merchant.count} charge{merchant.count !== 1 ? 's' : ''} {chargesSubtitle}
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

      <CustomDateRangeModal
        visible={isCustomPickerOpen}
        onClose={() => setCustomPickerOpen(false)}
        onApply={setCustomRange}
        initialStart={dateRange.type === 'custom' ? dateRange.start : undefined}
        initialEnd={dateRange.type === 'custom' ? dateRange.end : undefined}
        minDate={minChargeDate}
        maxDate={maxChargeDate}
      />
    </ScrollView>
  );
}

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { usePremium } from '../../utils/PremiumContext';
import { useCashAdvance } from '../../contexts/CashAdvanceContext';
import { useSubscriptions } from '../../contexts/SubscriptionsContext';
import { MerchantLogo, CashAdvancePanel, TrialBanner } from '../../components';
import { getComputedHomeSummary, demoSubscriptions, demoTrials, demoMerchants, demoCharges } from '../../utils/demoData';
import { formatCents, daysUntil } from '../../utils/calculations';
import { CASH_ADVANCE_MAX } from '../../constants/money';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const premium = usePremium();
  const cashAdvance = useCashAdvance();
  const { isCancelled } = useSubscriptions();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [devTapCount, setDevTapCount] = useState(0);

  // Redirect expired users to paywall
  useEffect(() => {
    if (premium.status === 'expired') {
      router.replace('/screens/Paywall');
    }
  }, [premium.status]);

  const getCashAdvanceCard = () => {
    const status = cashAdvance.status;
    if (status === 'none' || status === 'repaid') {
      return {
        icon: 'cash-outline' as const,
        value: 'Check →',
        label: 'Cash Advance',
        subtext: 'See if you qualify',
        borderColor: colors.accent + '30',
        valueColor: colors.accent,
        route: '/screens/CashAdvanceFlow',
      };
    }
    if (status === 'in_flow') {
      return {
        icon: 'time-outline' as const,
        value: 'Pending',
        label: 'Cash Advance',
        subtext: 'Review in progress',
        borderColor: '#F59E0B40',
        valueColor: '#F59E0B',
        route: '/screens/CashAdvanceFlow',
      };
    }
    if (status === 'active') {
      const amountCents = Math.round(cashAdvance.activeAdvanceAmount * 100);
      const dueDate = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000);
      return {
        icon: 'sync-outline' as const,
        value: formatCents(amountCents) + ' owed',
        label: 'Active Advance',
        subtext: `Due ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · 13 days`,
        borderColor: '#F59E0B50',
        valueColor: '#F59E0B',
        route: '/screens/CashAdvanceFlow',
      };
    }
    const limit = premium.getCashAdvanceLimit();
    return {
      icon: 'cash-outline' as const,
      value: `$${limit.toLocaleString()}`,
      label: 'Available Now',
      subtext: limit < CASH_ADVANCE_MAX ? 'Trial limit' : 'Tap to request',
      borderColor: colors.accent + '60',
      valueColor: colors.accent,
      route: '/screens/CashAdvanceFlow',
      glow: true,
    };
  };

  const cashAdvanceCard = getCashAdvanceCard();

  const handleDevTap = () => {
    const newCount = devTapCount + 1;
    setDevTapCount(newCount);
    if (newCount >= 5) {
      setDevTapCount(0);
      cashAdvance.reset();
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 18) return 'Afternoon';
    return 'Evening';
  };

  const getLatestCharge = (merchantId: string) => {
    const merchantCharges = demoCharges.filter((c) => c.merchantId === merchantId);
    if (merchantCharges.length === 0) return null;
    return merchantCharges.sort(
      (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
    )[0];
  };

  const getUpcomingEvents = () => {
    const events: any[] = [];

    demoTrials.forEach(trial => {
      const days = daysUntil(trial.trialEndDate);
      if (days >= 0 && days <= 30) {
        events.push({
          id: trial.id,
          type: 'trial',
          name: trial.merchantName,
          date: trial.trialEndDate,
          daysUntil: days,
          merchantId: trial.merchantId,
          merchantColor: '#9CA3AF',
          amountCents: trial.amountCentsAfterTrial,
        });
      }
    });

    demoSubscriptions.forEach(sub => {
      const days = daysUntil(sub.renewalDate);
      if (days >= 0 && days <= 30) {
        const merchant = demoMerchants[sub.merchantId];
        const latestCharge = getLatestCharge(sub.merchantId);
        events.push({
          id: sub.id,
          type: 'renewal',
          name: merchant?.canonicalName || 'Unknown',
          date: sub.renewalDate,
          daysUntil: days,
          merchantId: sub.merchantId,
          merchantColor: '#EF4444',
          amountCents: latestCharge?.amountCents || 0,
        });
      }
    });

    return events.sort((a, b) => a.daysUntil - b.daysUntil);
  };

  const upcomingEvents = getUpcomingEvents();
  const homeSummary = getComputedHomeSummary();
  const cancelledCount = demoSubscriptions.filter((s) => isCancelled(s.id)).length;
  const silentCount = Math.max(0, homeSummary.silentSubscriptionCount - cancelledCount);

  const handlePreviousMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
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
      <View style={{ position: 'absolute', top: paddingTop, right: 24, height: headerBarHeight, justifyContent: 'center', zIndex: 1000 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.accent, letterSpacing: 2 }}>EZER</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', alignItems: 'center', minHeight: headerBarHeight, marginBottom: 20 }}>
        <Pressable style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 2 }} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: headerBarHeight, minWidth: 0, maxWidth: Dimensions.get('window').width - 24 * 2 - 44 * 2 }} onPress={__DEV__ ? handleDevTap : undefined}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 2, textAlign: 'center' }}>Good{'\u00A0'}{getTimeOfDay()}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Your Dashboard</Text>
        </Pressable>
        <View style={{ width: 44 }} />
      </View>

      {/* Trial Banner */}
      {premium.status === 'trial' && <TrialBanner daysRemaining={premium.daysRemaining} />}

      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 12, marginBottom: 12 }}>
        <Pressable
          style={{ flex: 1, minWidth: 0, maxWidth: Dimensions.get('window').width - 136, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/MonthlyBurn')}
        >
          <Ionicons name="flame-outline" size={28} color={colors.danger} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{formatCents(homeSummary.monthlyBurnCents)}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>Monthly Burn</Text>
        </Pressable>

        <Pressable
          style={{ flex: 1, minWidth: 0, maxWidth: Dimensions.get('window').width - 136, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/RiskDetail')}
        >
          <Ionicons name="warning-outline" size={28} color={colors.accent} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{formatCents(homeSummary.next30DayRiskCents)}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>30-Day Risk</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 12, marginBottom: 12 }}>
        <Pressable
          style={{ flex: 1, minWidth: 0, maxWidth: Dimensions.get('window').width - 136, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/SilentSubscriptions')}
        >
          <Ionicons name="eye-off-outline" size={28} color={colors.textSecondary} />
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{silentCount}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>Silent Subscriptions</Text>
        </Pressable>

        <Pressable
          style={{
            flex: 1,
            minWidth: 0, maxWidth: Dimensions.get('window').width - 136,
            backgroundColor: colors.card,
            padding: 16,
            borderRadius: 16,
            alignItems: 'center',
            shadowColor: cashAdvanceCard.glow ? colors.accent : colors.shadow,
            shadowOffset: { width: 0, height: cashAdvanceCard.glow ? 0 : 2 },
            shadowOpacity: cashAdvanceCard.glow ? 0.3 : 0.2,
            shadowRadius: cashAdvanceCard.glow ? 16 : 12,
            elevation: 2,
            borderWidth: 1,
            borderColor: cashAdvanceCard.borderColor,
          }}
          onPress={() => router.push(cashAdvanceCard.route as any)}
        >
          <Ionicons name={cashAdvanceCard.icon} size={28} color={cashAdvanceCard.valueColor} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: cashAdvanceCard.valueColor, marginVertical: 4 }} numberOfLines={1}>
            {cashAdvanceCard.value}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginBottom: 2 }}>
            {cashAdvanceCard.label}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center', opacity: 0.7 }} numberOfLines={1}>
            {cashAdvanceCard.subtext}
          </Text>
        </Pressable>
      </View>

      <Pressable
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 16, marginBottom: 24, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
        onPress={() => router.push('/savings')}
      >
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
          <Ionicons name="download-outline" size={24} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>Withdraw</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>Transfer savings to your bank</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Pressable>

      <View style={{ flexDirection: 'row', marginBottom: 16, backgroundColor: colors.card, borderRadius: 12, padding: 4, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
        <Pressable
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: viewMode === 'calendar' ? colors.primary : 'transparent' }}
          onPress={() => setViewMode('calendar')}
        >
          <Ionicons name="calendar" size={20} color={viewMode === 'calendar' ? '#FFFFFF' : colors.text} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: viewMode === 'calendar' ? '#FFFFFF' : colors.text }}>Calendar</Text>
        </Pressable>

        <Pressable
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: viewMode === 'list' ? colors.primary : 'transparent' }}
          onPress={() => setViewMode('list')}
        >
          <Ionicons name="list" size={20} color={viewMode === 'list' ? '#FFFFFF' : colors.text} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: viewMode === 'list' ? '#FFFFFF' : colors.text }}>List</Text>
        </Pressable>
      </View>

      {viewMode === 'calendar' && (
        <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: 16, marginBottom: 24, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Charges</Text>
          <View style={{ marginHorizontal: -8 }}>
          <CalendarWithIcons
            subscriptions={upcomingEvents}
            currentMonth={currentMonth}
            onPreviousMonth={handlePreviousMonth}
            onNextMonth={handleNextMonth}
            colors={colors}
          />
          </View>
        </View>
      )}

      {viewMode === 'list' && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Subscriptions</Text>
          {upcomingEvents.map(event => {
            const isTrial = event.type === 'trial';

            return (
              <Pressable
                key={event.id}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 16, borderRadius: 12, marginBottom: 12, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 }}
                onPress={() => {
                  if (isTrial) {
                    router.push({ pathname: '/screens/TrialDecision', params: { trialId: event.id } });
                  } else {
                    router.push({ pathname: '/screens/SubscriptionDetail', params: { merchantId: event.merchantId } });
                  }
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{event.daysUntil}d</Text>
                </View>

                <View style={{ marginRight: 12 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: event.merchantColor, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: '700', color: '#FFFFFF' }}>{event.name.charAt(0)}</Text>
                  </View>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, marginBottom: 2 }}>{event.name}</Text>
                  <Text style={{ fontSize: 14, color: colors.textSecondary }}>{isTrial ? 'Trial Ending' : 'Renewal'}</Text>
                </View>

                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: isTrial ? colors.accent : colors.danger }} />
              </Pressable>
            );
          })}

          {upcomingEvents.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.textSecondary} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 12, textAlign: 'center' }}>No upcoming charges in the next 30 days</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function CalendarWithIcons({
  subscriptions,
  currentMonth,
  onPreviousMonth,
  onNextMonth,
  colors,
}: {
  subscriptions: any[];
  currentMonth: Date;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  colors: any;
}) {
  const today = new Date();
  const displayMonth = currentMonth.getMonth();
  const displayYear = currentMonth.getFullYear();

  const firstDay = new Date(displayYear, displayMonth, 1).getDay();
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();

  const weeks: any[] = [];
  let currentWeek: any[] = Array(firstDay).fill(null);

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const subsOnDay = subscriptions.filter(sub => {
      const subDate = new Date(sub.date).toISOString().split('T')[0];
      return subDate === dateStr;
    });

    let totalCharge = 0;
    let totalSavings = 0;

    subsOnDay.forEach((sub) => {
      const price = sub.amountCents || 0;
      totalCharge += price;
      totalSavings += price * 0.5;
    });

    currentWeek.push({
      day,
      subs: subsOnDay,
      totalCharge,
      totalSavings,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Pressable onPress={onPreviousMonth} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{monthNames[displayMonth]} {displayYear}</Text>
        <Pressable onPress={onNextMonth} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {dayNames.map(day => (
          <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' }}>{day}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIdx) => (
        <View key={weekIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {week.map((cell, cellIdx) => (
            <View key={cellIdx} style={{ flex: 1, minHeight: 80, padding: 4, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: colors.background, borderRadius: 8, marginHorizontal: 1, marginVertical: 2 }}>
              {cell && (
                <>
                  <Text
                    style={[
                      { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
                      cell.day === today.getDate() && displayMonth === today.getMonth() && displayYear === today.getFullYear() && { color: '#FFFFFF', backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {cell.subs.length > 0 && (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {cell.subs.slice(0, 3).map((sub: any) => (
                          <View key={sub.id} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: sub.merchantColor, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFFFFF' }}>
                            <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFFFFF' }}>{sub.name.charAt(0)}</Text>
                          </View>
                        ))}
                        {cell.subs.length > 3 && <Text style={{ fontSize: 8, fontWeight: '600', color: colors.textSecondary }}>+{cell.subs.length - 3}</Text>}
                      </View>
                      <View style={{ flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger }}>-${(cell.totalCharge / 100).toFixed(0)}</Text>
                        {cell.totalSavings > 0 && <Text style={{ fontSize: 10, fontWeight: '700', color: colors.success }}>+${(cell.totalSavings / 100).toFixed(0)}</Text>}
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          ))}
        </View>
      ))}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.danger }} />
          <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '500' }}>Renewals</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent }} />
          <Text style={{ fontSize: 14, color: colors.textSecondary, fontWeight: '500' }}>Trials Ending</Text>
        </View>
      </View>
    </View>
  );
}

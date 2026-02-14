// =============================================================================
// EZER Mobile App - Home Tab
// Calendar with merchant icons + toggle view + stats
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { MerchantLogo, CashAdvancePanel } from '../../components';
import { demoHomeSummary, demoSubscriptions, demoTrials, demoMerchants, demoCharges } from '../../utils/demoData';
import { formatCents, daysUntil } from '../../utils/calculations';

// Cash Advance States
type CashAdvanceState = 'check_eligibility' | 'pending' | 'approved' | 'active';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Cash Advance state (can be cycled with dev toggle)
  const [advanceState, setAdvanceState] = useState<CashAdvanceState>('approved');
  const [devTapCount, setDevTapCount] = useState(0);

  // Demo data for active advance
  const activeAdvance = {
    amountOwed: 25000, // $250.00 in cents
    dueDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000), // 13 days from now
  };

  // Dev toggle - tap header 5 times to cycle states
  const handleDevTap = () => {
    const newCount = devTapCount + 1;
    setDevTapCount(newCount);
    if (newCount >= 5) {
      setDevTapCount(0);
      const states: CashAdvanceState[] = ['check_eligibility', 'pending', 'approved', 'active'];
      const currentIndex = states.indexOf(advanceState);
      const nextIndex = (currentIndex + 1) % states.length;
      setAdvanceState(states[nextIndex]);
    }
  };

  // Get Cash Advance card config based on state
  const getCashAdvanceCard = () => {
    switch (advanceState) {
      case 'check_eligibility':
        return {
          icon: 'cash-outline' as const,
          value: 'Check →',
          label: 'Cash Advance',
          subtext: 'See if you qualify',
          borderColor: colors.accent + '30',
          valueColor: colors.accent,
          route: '/screens/CashAdvanceFlow',
        };
      case 'pending':
        return {
          icon: 'time-outline' as const,
          value: 'Pending',
          label: 'Cash Advance',
          subtext: 'Review in progress',
          borderColor: '#F59E0B40',
          valueColor: '#F59E0B',
          route: '/screens/CashAdvanceFlow',
        };
      case 'approved':
        return {
          icon: 'cash-outline' as const,
          value: '$1,500',
          label: 'Available Now',
          subtext: 'Tap to request',
          borderColor: colors.accent + '60',
          valueColor: colors.accent,
          route: '/screens/CashAdvanceFlow',
          glow: true,
        };
      case 'active':
        return {
          icon: 'sync-outline' as const,
          value: formatCents(activeAdvance.amountOwed) + ' owed',
          label: 'Active Advance',
          subtext: `Due ${activeAdvance.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · 13 days`,
          borderColor: '#F59E0B50',
          valueColor: '#F59E0B',
          route: '/screens/CashAdvanceFlow',
        };
    }
  };

  const cashAdvanceCard = getCashAdvanceCard();

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

      {/* Header - Tap 5 times for dev toggle */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Pressable style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 2 }} onPress={() => router.push('/settings')}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </Pressable>
        <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={handleDevTap}>
          <Text style={{ fontSize: 16, color: colors.textSecondary, marginBottom: 4, textAlign: 'center' }}>Good {getTimeOfDay()}</Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center' }}>Your Dashboard</Text>
        </Pressable>
        <View style={{ width: 44 }} />
      </View>

      {/* Stats Cards - 2x2 Grid */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
        {/* Monthly Burn */}
        <Pressable
          style={{ flex: 1, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/MonthlyBurn')}
        >
          <Ionicons name="flame-outline" size={28} color={colors.danger} />
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{formatCents(demoHomeSummary.monthlyBurnCents)}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>Monthly Burn</Text>
        </Pressable>

        {/* 30-Day Risk */}
        <Pressable
          style={{ flex: 1, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/RiskDetail')}
        >
          <Ionicons name="warning-outline" size={28} color={colors.accent} />
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{formatCents(demoHomeSummary.next30DayRiskCents)}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>30-Day Risk</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        {/* Silent Subscriptions */}
        <Pressable
          style={{ flex: 1, backgroundColor: colors.card, padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}
          onPress={() => router.push('/screens/SilentSubscriptions')}
        >
          <Ionicons name="eye-off-outline" size={28} color={colors.textSecondary} />
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text, marginVertical: 6, fontVariant: ['tabular-nums'] }}>{demoHomeSummary.silentSubscriptionCount}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>Silent Subscriptions</Text>
        </Pressable>

        {/* Cash Advance - Always show card in 2x2 grid */}
        <Pressable
          style={{
            flex: 1,
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
          <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', marginBottom: 2 }}>
            {cashAdvanceCard.label}
          </Text>
          <Text style={{ fontSize: 10, color: colors.textSecondary, textAlign: 'center', opacity: 0.7 }} numberOfLines={1}>
            {cashAdvanceCard.subtext}
          </Text>
        </Pressable>
      </View>

      {/* View Toggle */}
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

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <View style={{ backgroundColor: colors.card, padding: 20, borderRadius: 16, marginBottom: 24, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 2 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Charges</Text>
          <CalendarWithIcons
            subscriptions={upcomingEvents}
            currentMonth={currentMonth}
            onPreviousMonth={handlePreviousMonth}
            onNextMonth={handleNextMonth}
            colors={colors}
          />
        </View>
      )}

      {/* LIST VIEW */}
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

// CALENDAR COMPONENT WITH MERCHANT ICONS
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

    // Calculate total charge and savings for this day
    let totalCharge = 0;
    let totalSavings = 0;

    subsOnDay.forEach((sub) => {
      const price = sub.amountCents || 0;
      totalCharge += price;
      totalSavings += price * 0.5; // 50% savings
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

      {/* Day headers */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {dayNames.map(day => (
          <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' }}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {weeks.map((week, weekIdx) => (
        <View key={weekIdx} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {week.map((cell, cellIdx) => (
            <View key={cellIdx} style={{ flex: 1, minHeight: 80, padding: 4, alignItems: 'center', justifyContent: 'flex-start', backgroundColor: colors.background, borderRadius: 8, margin: 2 }}>
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

      {/* Legend */}
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

// =============================================================================
// EZER Mobile App - Alerts Tab
// Trials expiring and upcoming renewals
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Card, Button } from '../../components';
import { demoTrials, demoSubscriptions, demoMerchants, demoCharges } from '../../utils/demoData';
import { daysUntil, formatDate, formatCents } from '../../utils/calculations';

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Get upcoming renewals (next 30 days)
  const upcomingRenewals = demoSubscriptions.filter((sub) => {
    const days = daysUntil(sub.renewalDate);
    return days >= 0 && days <= 30;
  });

  const handleTrialPress = (trialId: string) => {
    router.push({
      pathname: '/screens/TrialDecision',
      params: { trialId },
    });
  };

  const handleRenewalPress = (subscriptionId: string) => {
    // Find merchant charges for this subscription
    const subscription = demoSubscriptions.find((s) => s.id === subscriptionId);
    if (subscription) {
      router.push({
        pathname: '/screens/SubscriptionDetail',
        params: { merchantId: subscription.merchantId },
      });
    }
  };

  const getLatestCharge = (merchantId: string) => {
    const merchantCharges = demoCharges.filter((c) => c.merchantId === merchantId);
    if (merchantCharges.length === 0) return null;
    return merchantCharges.sort(
      (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
    )[0];
  };

  const hasAlerts = demoTrials.length > 0 || upcomingRenewals.length > 0;

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
      <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 24 }}>Alerts (Next 30 Days)</Text>

      {!hasAlerts ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 }}>
          <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: 'center' }}>No upcoming trials or renewals</Text>
        </View>
      ) : (
        <>
          {/* Trials Expiring Section */}
          {demoTrials.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Trials Expiring</Text>
              {demoTrials.map((trial) => {
                const days = daysUntil(trial.trialEndDate);
                return (
                  <Card key={trial.id} style={{ marginBottom: 12, padding: 16 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      onPress={() => handleTrialPress(trial.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        {/* Logo placeholder */}
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: colors.textSecondary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>
                            {trial.merchantName.charAt(0)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 }}>{trial.merchantName}</Text>
                          <Text style={{ fontSize: 14, color: colors.danger, marginBottom: 2 }}>
                            Ends in {days} day{days !== 1 ? 's' : ''}
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                            {formatCents(trial.amountCentsAfterTrial)}/mo after trial
                          </Text>
                        </View>
                      </View>
                      <Button
                        title="Manage Trial"
                        variant="gold"
                        fullWidth={false}
                        style={{ paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 }}
                        textStyle={{ fontSize: 14 }}
                        onPress={() => handleTrialPress(trial.id)}
                      />
                    </TouchableOpacity>
                  </Card>
                );
              })}
            </View>
          )}

          {/* Upcoming Renewals Section */}
          {upcomingRenewals.length > 0 && (
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>Upcoming Renewals</Text>
              {upcomingRenewals.map((subscription) => {
                const merchant = demoMerchants[subscription.merchantId];
                const latestCharge = getLatestCharge(subscription.merchantId);
                return (
                  <Card key={subscription.id} style={{ marginBottom: 12, padding: 16 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                      onPress={() => handleRenewalPress(subscription.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        {/* Logo placeholder */}
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: colors.textSecondary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>
                            {merchant?.canonicalName.charAt(0) || '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                            {merchant?.canonicalName || 'Unknown'}
                          </Text>
                          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 2 }}>
                            Renews on {formatDate(subscription.renewalDate)}
                          </Text>
                          {latestCharge && (
                            <Text style={{ fontSize: 14, color: colors.danger }}>
                              {formatCents(latestCharge.amountCents)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Button
                        title="Act"
                        variant="primary"
                        fullWidth={false}
                        style={{ paddingVertical: 8, paddingHorizontal: 16, minHeight: 36 }}
                        textStyle={{ fontSize: 14 }}
                        onPress={() => handleRenewalPress(subscription.id)}
                      />
                    </TouchableOpacity>
                  </Card>
                );
              })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

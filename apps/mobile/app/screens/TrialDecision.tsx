// =============================================================================
// EZER Mobile App - Trial Decision Screen
// Auto-cancel toggle + Smart saving options
// =============================================================================

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { demoTrials } from '../../utils/demoData';
import { formatCents, formatDate, daysUntil } from '../../utils/calculations';

type SaveOption = 'saveHalf' | 'matchFull';

export default function TrialDecisionScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ trialId: string }>();
  const trialId = params.trialId || 'trial-1';

  const trial = demoTrials.find((t) => t.id === trialId) || demoTrials[0];
  const daysLeft = daysUntil(trial.trialEndDate);

  const [selected, setSelected] = useState<SaveOption | null>(null);
  const [autoCancel, setAutoCancel] = useState(false);
  const [canAutoCancel, setCanAutoCancel] = useState(true); // Demo: assume most merchants support it

  const fullPrice = (trial.amountCentsAfterTrial / 100).toFixed(2);
  const halfPrice = (trial.amountCentsAfterTrial / 200).toFixed(2);
  const totalSaveHalf = (trial.amountCentsAfterTrial * 1.5 / 100).toFixed(2);
  const totalMatchFull = (trial.amountCentsAfterTrial * 2 / 100).toFixed(2);

  // 12 HOURS before trial ends
  const trialEndDate = new Date(trial.trialEndDate);
  const cancelDeadline = new Date(trialEndDate.getTime() - 12 * 60 * 60 * 1000);

  useEffect(() => {
    // Demo: Check if merchant supports auto-cancel
    // In production, this would be an API call
    const merchantsWithoutAutoCancel = ['disney', 'apple']; // Example
    setCanAutoCancel(!merchantsWithoutAutoCancel.includes(trial.merchantId));
  }, [trial.merchantId]);

  const handleAutoCancelToggle = () => {
    if (!autoCancel) {
      Alert.alert(
        'Enable Auto-Cancel?',
        `We'll automatically cancel ${trial.merchantName} 12 hours before your trial ends. You'll receive email & SMS confirmations.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              setAutoCancel(true);
              setSelected(null); // Clear saving option when auto-cancel is enabled
            }
          }
        ]
      );
    } else {
      setAutoCancel(false);
    }
  };

  const handleConfirm = () => {
    if (!selected && !autoCancel) {
      Alert.alert('Select an option', 'Please choose how you want to handle this trial.');
      return;
    }

    let message = '';
    if (autoCancel) {
      message = `Auto-cancel scheduled for ${formatDate(cancelDeadline)}. You'll receive email & SMS confirmation.`;
    } else if (selected === 'saveHalf') {
      message = `You'll pay $${fullPrice} for the subscription + automatically transfer $${halfPrice} to savings each billing cycle.`;
    } else {
      message = `You'll pay $${fullPrice} for the subscription + automatically transfer $${fullPrice} to your investment account each billing cycle.`;
    }

    Alert.alert('Confirmed', message, [
      { text: 'Got it', onPress: () => router.back() },
    ]);
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.card,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 8,
            elevation: 2,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>
          {trial.merchantName}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Trial Info Card */}
        <View
          style={{
            backgroundColor: colors.card,
            padding: 20,
            borderRadius: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 2,
          }}
        >
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
            Trial ends {formatDate(trial.trialEndDate)}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
            Then {formatCents(trial.amountCentsAfterTrial)}/mo
          </Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
            {daysLeft} day{daysLeft !== 1 ? 's' : ''} left
          </Text>
        </View>

        {/* Auto-Cancel Card - GRAYED OUT IF NO API */}
        <View
          style={{
            backgroundColor: canAutoCancel ? colors.card : colors.background,
            padding: 20,
            borderRadius: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 2,
            opacity: canAutoCancel ? 1 : 0.7,
            borderWidth: canAutoCancel ? 0 : 2,
            borderColor: colors.border,
            borderStyle: 'dashed',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                Auto-Cancel Before Trial Ends
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                {!canAutoCancel
                  ? 'Auto-cancel unavailable for this merchant. We\'ll send email & SMS reminders instead.'
                  : autoCancel
                    ? `We'll cancel 12 hours before ${formatDate(trialEndDate)}. You'll get email & SMS confirmation.`
                    : 'We\'ll automatically cancel 12 hours before you get charged'
                }
              </Text>
            </View>
            {canAutoCancel && (
              <Pressable
                style={{
                  width: 56,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: autoCancel ? colors.success : colors.border,
                  padding: 2,
                  justifyContent: 'center',
                }}
                onPress={handleAutoCancelToggle}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.card,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.2,
                    shadowRadius: 4,
                    elevation: 2,
                    alignSelf: autoCancel ? 'flex-end' : 'flex-start',
                  }}
                />
              </Pressable>
            )}
          </View>

          {autoCancel && canAutoCancel && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#D1FAE5',
                padding: 12,
                borderRadius: 12,
                marginTop: 12,
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#059669' }}>
                Auto-cancel scheduled for {formatDate(cancelDeadline)}
              </Text>
            </View>
          )}

          {!canAutoCancel && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: '#FEF3C7',
                padding: 12,
                borderRadius: 12,
                marginTop: 12,
              }}
            >
              <Ionicons name="information-circle-outline" size={20} color={colors.accent} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#D97706' }}>
                Auto-cancel unavailable - If we can't cancel this subscription automatically, we'll notify you 24 hours before via email & SMS so you can cancel manually
              </Text>
            </View>
          )}
        </View>

        {/* Save Smart Section - ONLY SHOW IF AUTO-CANCEL IS OFF */}
        {!autoCancel && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
              Save Smart with Your Trial
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
              You'll pay the full subscription. We'll automate your savings.
            </Text>

            {/* Pay Full, Save Half */}
            <Pressable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: selected === 'saveHalf' ? '#FFFBF0' : colors.card,
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
                borderWidth: 2,
                borderColor: selected === 'saveHalf' ? colors.accent : colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
              }}
              onPress={() => setSelected('saveHalf')}
            >
              <Text style={{ fontSize: 28 }}>💰</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                  Pay Full, Save Half
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  Pay ${fullPrice} subscription + automatically transfer ${halfPrice} to your savings (${totalSaveHalf} total/month)
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
                {selected === 'saveHalf' && (
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
            </Pressable>

            {/* Pay Full, Match Full */}
            <Pressable
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: selected === 'matchFull' ? '#FFFBF0' : colors.card,
                padding: 16,
                borderRadius: 12,
                marginBottom: 12,
                borderWidth: 2,
                borderColor: selected === 'matchFull' ? colors.accent : colors.border,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 1,
              }}
              onPress={() => setSelected('matchFull')}
            >
              <Text style={{ fontSize: 28 }}>📈</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }}>
                  Pay Full, Match Full
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSecondary, lineHeight: 20 }}>
                  Pay ${fullPrice} subscription + automatically transfer ${fullPrice} to investment (${totalMatchFull} total/month)
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
                {selected === 'matchFull' && (
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
            </Pressable>
          </View>
        )}

        {/* Confirm Button */}
        {(selected || autoCancel) && (
          <Pressable
            style={{
              backgroundColor: colors.primary,
              marginBottom: 24,
              paddingVertical: 16,
              borderRadius: 12,
              alignItems: 'center',
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
            onPress={handleConfirm}
          >
            <Text style={{ color: colors.card, fontSize: 16, fontWeight: '700' }}>
              {autoCancel ? 'Confirm Auto-Cancel' : 'Enable Smart Saving'}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

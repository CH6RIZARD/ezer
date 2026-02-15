// =============================================================================
// EZER Mobile App - Cancel Flow Screen
// Guided checklist for canceling a subscription
// =============================================================================

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Card, Button } from '../../components';
import { demoMerchants, demoCharges } from '../../utils/demoData';

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export default function CancelFlowScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ merchantId: string }>();
  const merchantId = params.merchantId || 'netflix';

  const merchant = demoMerchants[merchantId] || {
    id: merchantId,
    canonicalName: 'Unknown Merchant',
    fingerprintKeys: [],
    cancellationDifficulty: 'Medium' as const,
    difficultyLastUpdatedAt: new Date(),
    cancellationUrl: undefined,
  };

  const [checklist, setChecklist] = useState<ChecklistItem[]>([
    { id: '1', text: `Log in to ${merchant.canonicalName.toLowerCase()}.com`, checked: false },
    { id: '2', text: 'Navigate to Billing or Account Settings', checked: false },
    { id: '3', text: "Find 'Cancel Subscription' button", checked: false },
    { id: '4', text: 'Complete cancellation', checked: false },
  ]);

  const latestCharge = useMemo(
    () =>
      demoCharges
        .filter((c) => c.merchantId === merchantId)
        .sort((a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime())[0],
    [merchantId]
  );

  const handleBack = () => {
    router.back();
  };

  const toggleChecklist = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const handleOpenCancellation = async () => {
    if (merchant.cancellationUrl) {
      const canOpen = await Linking.canOpenURL(merchant.cancellationUrl);
      if (canOpen) {
        await Linking.openURL(merchant.cancellationUrl);
      } else {
        Alert.alert('Error', 'Cannot open cancellation URL');
      }
    } else {
      // Show manual fallback
      Alert.alert(
        'Find Cancellation Page',
        `Try visiting:\n\n• ${merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/account\n• ${merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/billing\n• ${merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/help\n\nOr search Google for "${merchant.canonicalName} cancel subscription"`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleSendToReallocate = () => {
    router.push({
      pathname: '/screens/Reallocate',
      params: {
        merchantId,
        amountCents: (latestCharge?.amountCents ?? 0).toString(),
        billingInterval: latestCharge?.billingInterval ?? 'monthly',
      },
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

        {/* Checklist */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 16 }}>
            How to cancel
          </Text>
          {checklist.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
              onPress={() => toggleChecklist(item.id)}
              activeOpacity={0.7}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: item.checked ? colors.success : colors.textSecondary,
                  backgroundColor: item.checked ? colors.success : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                {item.checked && (
                  <Text style={{ color: colors.card, fontSize: 14, fontWeight: '700' }}>✓</Text>
                )}
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: item.checked ? colors.textSecondary : colors.text,
                  flex: 1,
                  textDecorationLine: item.checked ? 'line-through' : 'none',
                }}
              >
                {index + 1}. {item.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Open Cancellation Button */}
        <Button
          title={merchant.cancellationUrl ? 'Open Cancellation Page' : 'Find Cancellation Link'}
          variant="gold"
          onPress={handleOpenCancellation}
          style={{ marginBottom: 16 }}
        />

        {/* Manual Fallback Info */}
        {!merchant.cancellationUrl && (
          <Card style={{ padding: 16, marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 }}>
              Find cancellation link
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
              • {merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/account
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
              • {merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/billing
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
              • {merchant.canonicalName.toLowerCase().replace(/\s+/g, '')}.com/help
            </Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/search?q=${encodeURIComponent(
                    merchant.canonicalName + ' cancel subscription'
                  )}`
                )
              }
            >
              <Text
                style={{
                  fontSize: 14,
                  color: colors.accent,
                  marginTop: 12,
                  textDecorationLine: 'underline',
                }}
              >
                Search Google for "{merchant.canonicalName} cancel subscription"
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Hero CTA: refunnel freed money to savings / reallocate */}
        <View style={{ marginTop: 8 }}>
          <Button
            title="I've cancelled — choose where to send the money"
            variant="primary"
            onPress={handleSendToReallocate}
          />
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 12 }}>
            Send this freed amount to savings, debt paydown, or another goal.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

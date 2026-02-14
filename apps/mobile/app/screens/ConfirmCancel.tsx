// =============================================================================
// EZER Mobile App - Confirm Cancel Screen
// Review uploaded proof and confirm cancellation
// =============================================================================

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Dimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../utils/ThemeContext';
import { Button } from '../../components';
import { demoMerchants, demoCharges } from '../../utils/demoData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ConfirmCancelScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ merchantId: string; proofUri: string }>();
  const merchantId = params.merchantId || 'netflix';
  const proofUri = params.proofUri || '';

  const merchant = demoMerchants[merchantId] || {
    id: merchantId,
    canonicalName: 'Unknown Merchant',
    fingerprintKeys: [],
    cancellationDifficulty: 'Medium' as const,
    difficultyLastUpdatedAt: new Date(),
  };

  // Get latest charge to know how much was freed
  const latestCharge = demoCharges
    .filter((c) => c.merchantId === merchantId)
    .sort((a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime())[0];

  const handleBack = () => {
    router.back();
  };

  const handleConfirmCancellation = () => {
    // In a real app, this would:
    // 1. Update CancelAttempt status to "confirmed"
    // 2. Mark subscription as canceled
    // 3. Navigate to Reallocate

    router.push({
      pathname: '/screens/Reallocate',
      params: {
        merchantId,
        amountCents: latestCharge?.amountCents.toString() || '0',
        billingInterval: latestCharge?.billingInterval || 'monthly',
      },
    });
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
        {/* Proof Preview */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
            Review your proof
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 16 }}>
            Make sure the cancellation confirmation is visible
          </Text>

          {proofUri ? (
            <View
              style={{
                borderWidth: 2,
                borderColor: colors.accent,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: colors.card,
              }}
            >
              <Image
                source={{ uri: proofUri }}
                style={{
                  width: SCREEN_WIDTH - 52, // 24px padding on each side + 2px border
                  height: (SCREEN_WIDTH - 52) * 1.2, // 4:5 aspect ratio
                }}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View
              style={{
                height: 200,
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, color: colors.textSecondary }}>No image uploaded</Text>
            </View>
          )}
        </View>

        {/* Merchant Info */}
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginBottom: 4 }}>
            Canceling
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>
            {merchant.canonicalName}
          </Text>
        </View>

        {/* Confirm CTA */}
        <View style={{ marginTop: 8 }}>
          <Button
            title="Confirm Cancellation"
            variant="primary"
            onPress={handleConfirmCancellation}
          />
        </View>
      </ScrollView>
    </View>
  );
}

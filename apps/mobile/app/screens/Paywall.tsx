// =============================================================================
// EZER Mobile App - Paywall Screen
// Conversion-optimized full-screen paywall for $3 lifetime premium purchase
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremium } from '../../utils/PremiumContext';

const FEATURES = [
  {
    icon: 'infinite-outline' as const,
    title: 'Unlimited Subscription Tracking',
    description: 'Track every subscription, trial, and recurring charge',
  },
  {
    icon: 'cash-outline' as const,
    title: 'Cash Advance up to $1,500',
    description: 'Get the money you need, when you need it',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Smart Alerts & Trial Watchdog',
    description: 'Never get charged for a forgotten trial again',
  },
  {
    icon: 'trending-up-outline' as const,
    title: 'Savings Goals & Investing',
    description: 'Turn cancelled subscriptions into real savings',
  },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { status, daysRemaining, purchasePremium, restorePurchases } = usePremium();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const canDismiss = status === 'trial';

  const handlePurchase = async () => {
    setIsPurchasing(true);
    try {
      const success = await purchasePremium();
      if (success) {
        Alert.alert('Welcome to Premium!', 'You now have lifetime access to all EZER features.', [
          { text: 'Let\'s Go', onPress: () => router.back() },
        ]);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        Alert.alert('Purchase Restored!', 'Your premium access has been restored.', [
          { text: 'Great', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('No Purchase Found', 'We couldn\'t find a previous purchase on this account.');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0f' }}>
      <LinearGradient
        colors={['#0a0a0f', '#111118', '#0a0a0f']}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 32,
            paddingHorizontal: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Close button — only during trial */}
          {canDismiss && (
            <Pressable
              onPress={() => router.back()}
              style={{
                alignSelf: 'flex-end',
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: 'rgba(255,255,255,0.1)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}

          {/* Hero */}
          <View style={{ alignItems: 'center', marginBottom: 40, marginTop: canDismiss ? 0 : 24 }}>
            <View style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: 'rgba(77,240,192,0.15)',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 24,
              shadowColor: '#4df0c0',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
            }}>
              <Ionicons name="diamond" size={40} color="#4df0c0" />
            </View>

            <Text style={{
              fontSize: 32,
              fontWeight: '800',
              color: '#FFFFFF',
              textAlign: 'center',
              marginBottom: 12,
              letterSpacing: -0.5,
            }}>
              Unlock EZER Premium
            </Text>

            <Text style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.6)',
              textAlign: 'center',
              lineHeight: 24,
              maxWidth: 300,
            }}>
              Take full control of your subscriptions and start saving today
            </Text>
          </View>

          {/* Features */}
          <View style={{ marginBottom: 32 }}>
            {FEATURES.map((feature, index) => (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: 16,
                  padding: 16,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <View style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: 'rgba(77,240,192,0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 16,
                }}>
                  <Ionicons name={feature.icon} size={24} color="#4df0c0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 }}>
                    {feature.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 18 }}>
                    {feature.description}
                  </Text>
                </View>
                <Ionicons name="checkmark-circle" size={22} color="#4df0c0" />
              </View>
            ))}
          </View>

          {/* Social Proof */}
          <View style={{ alignItems: 'center', marginBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Ionicons key={i} name="star" size={18} color="#F59E0B" />
              ))}
            </View>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              Join thousands of smart savers
            </Text>
          </View>

          {/* Trial countdown - compact so it fits on iPhone without indent */}
          {status === 'trial' && daysRemaining > 0 && (
            <View style={{
              backgroundColor: 'rgba(77,240,192,0.08)',
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: 'rgba(77,240,192,0.15)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <Ionicons name="time-outline" size={18} color="#4df0c0" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#4df0c0' }} numberOfLines={1}>
                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left in free trial
              </Text>
            </View>
          )}

          {/* Price */}
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: 16,
              paddingVertical: 20,
              paddingHorizontal: 32,
              borderWidth: 1,
              borderColor: 'rgba(77,240,192,0.2)',
              alignItems: 'center',
            }}>
              <Text style={{ fontSize: 42, fontWeight: '800', color: '#FFFFFF', letterSpacing: -1 }}>
                $2.99
              </Text>
              <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontWeight: '600' }}>
                one-time payment · lifetime access
              </Text>
            </View>
          </View>

          {/* CTA Button */}
          <Pressable
            onPress={handlePurchase}
            disabled={isPurchasing}
            style={{
              backgroundColor: '#4df0c0',
              borderRadius: 16,
              paddingVertical: 18,
              alignItems: 'center',
              marginBottom: 16,
              shadowColor: '#4df0c0',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 6,
              opacity: isPurchasing ? 0.7 : 1,
            }}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#0a0a0f" />
            ) : (
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0a0a0f', letterSpacing: 0.5 }}>
                Unlock EZER Premium
              </Text>
            )}
          </Pressable>

          {/* Restore */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            style={{ alignItems: 'center', paddingVertical: 12, marginBottom: 16 }}
          >
            {isRestoring ? (
              <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
            ) : (
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textDecorationLine: 'underline' }}>
                Restore Purchase
              </Text>
            )}
          </Pressable>

          {/* Fine print */}
          <Text style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.25)',
            textAlign: 'center',
            lineHeight: 18,
            paddingHorizontal: 16,
          }}>
            One-time purchase. No subscriptions. No hidden fees.{'\n'}
            Payment will be charged to your App Store or Google Play account.
          </Text>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

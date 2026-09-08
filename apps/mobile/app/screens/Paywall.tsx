// =============================================================================
// EZER Mobile — Paywall
//
// Layout is the approved "Amethyst on bone" design: the virtual card is the
// hero, tilted, over a warm paper ground. Deliberately light where the rest of
// the app is dark — this screen is a moment, not a surface you live in, and the
// card has to read as an object sitting on something.
//
// COPY IS NOT THE DESIGN'S. The comps sold a $2.99 lifetime purchase and said
// "One-time purchase. No subscriptions." That is now false: this is $7.99/month
// against a $14 list price. Shipping the comp's disclosure verbatim would be a
// false statement to a purchaser, and both stores reject a paywall whose copy
// disagrees with the product it charges for.
//
// The two prices are display strings from revenueCatConfig. The amount actually
// charged is whatever the store package resolves to at runtime; this screen
// never computes a price.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremium } from '../../utils/PremiumContext';
import { isExpoGo, isLoosePreviewMode } from '../../utils/expoRuntime';
import {
  FOUNDING_PRICE_LABEL,
  LIST_PRICE_LABEL,
  BILLING_PERIOD_LABEL,
} from '../../utils/revenueCatConfig';

// Paper palette, from the comp. Not in theme/tokens because nothing else in
// the app uses it — putting it there would imply a second surface style exists.
const PAPER = '#F7F3EA';
const PAPER_EDGE = '#EEE7D6';
const INK = '#241A38';
const INK_MUTED = '#8A7F6B';
const INK_FAINT = '#A99E86';
const GOLD = '#A87D2F';
const PURPLE = '#4C1D95';
const GREEN = '#348F66';

const SERIF = 'InstrumentSerif_400Regular_Italic';
const UI_BOLD = 'SpaceGrotesk_700Bold';
const UI_SEMI = 'SpaceGrotesk_600SemiBold';
const UI_MED = 'SpaceGrotesk_500Medium';

/**
 * What a subscriber gets. Two of these are not built yet, and both say so —
 * "early access" is a promise about timing, which is true, rather than a claim
 * that the feature works today, which is not.
 */
const FEATURES = [
  'Unlimited subscription tracking',
  'Smart alerts and trial watchdog',
  'Savings goals — early access',
  'Ezer Pay in 4 — early access',
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const {
    status,
    daysRemaining,
    purchasePremium,
    restorePurchases,
    isPurchaseNativeAvailable,
  } = usePremium();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // An expired user has nothing behind this screen to return to, so the close
  // affordance is hidden rather than shown-and-inert.
  const canDismiss = status === 'trial' || status === 'loading' || isLoosePreviewMode();

  const handlePurchase = async () => {
    if (!isPurchaseNativeAvailable) {
      Alert.alert(
        'Preview',
        isExpoGo()
          ? 'In-app purchases are not available in Expo Go. Use a development build to test billing, or close this screen to keep exploring.'
          : 'Billing is not available in this build. Set up RevenueCat and a dev client to test purchases.',
      );
      return;
    }
    setIsPurchasing(true);
    try {
      const success = await purchasePremium();
      if (success) {
        Alert.alert('You’re in', 'Your founding rate is locked for as long as you stay subscribed.', [
          { text: 'Let’s go', onPress: () => router.back() },
        ]);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (!isPurchaseNativeAvailable) {
      Alert.alert('Preview', 'Restore purchases requires a development build with the store SDK.');
      return;
    }
    setIsRestoring(true);
    try {
      const success = await restorePurchases();
      if (success) {
        Alert.alert('Subscription restored', 'Your access is back.', [
          { text: 'Great', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('Nothing to restore', 'We couldn’t find a subscription on this account.');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  const busy = isPurchasing || isRestoring;

  return (
    <View style={{ flex: 1, backgroundColor: PAPER }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 20,
          minHeight: '100%',
        }}
      >
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {canDismiss ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: PAPER_EDGE, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={INK} />
            </Pressable>
          ) : (
            <View style={{ width: 42 }} />
          )}
          <Text style={{ fontSize: 15, fontFamily: UI_BOLD, letterSpacing: 2.5, color: GOLD }}>EZER</Text>
          <View style={{ width: 42 }} />
        </View>

        {/* the card, tilted — the hero */}
        <View style={{ alignItems: 'center', marginTop: 30 }}>
          <LinearGradient
            colors={['#5B21B6', '#31136E', '#150A33']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 308, height: 190, borderRadius: 20, padding: 20,
              justifyContent: 'space-between', transform: [{ rotate: '-4deg' }],
              shadowColor: '#241A38', shadowOffset: { width: 0, height: 24 },
              shadowOpacity: 0.28, shadowRadius: 48, elevation: 12,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <LinearGradient
                colors={['#E7C77E', '#A87D2F', '#E7C77E']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ width: 38, height: 28, borderRadius: 7 }}
              />
              <Text style={{ fontSize: 10, fontFamily: UI_SEMI, letterSpacing: 0.5, color: '#C9BCE8', textTransform: 'uppercase' }}>
                Founding member
              </Text>
            </View>

            <Text style={{ fontFamily: SERIF, fontSize: 30, color: '#FFFFFF', letterSpacing: 1 }}>
              Ezer Premium
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View>
                <Text style={{ fontSize: 9, letterSpacing: 0.5, color: '#C9BCE8', textTransform: 'uppercase' }}>Cardholder</Text>
                <Text style={{ fontSize: 12, fontFamily: UI_SEMI, color: '#FFFFFF', letterSpacing: 1 }}>EZER MEMBER</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 9, letterSpacing: 0.5, color: '#C9BCE8', textTransform: 'uppercase' }}>Rate</Text>
                <Text style={{ fontSize: 12, fontFamily: UI_SEMI, color: '#FFFFFF' }}>LOCKED</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 26, fontFamily: UI_BOLD, letterSpacing: -0.6, color: INK, marginTop: 36 }}>
          One rate. Every feature.{' '}
          <Text style={{ fontFamily: SERIF, color: PURPLE }}>Locked.</Text>
        </Text>

        {status === 'trial' && typeof daysRemaining === 'number' && daysRemaining > 0 ? (
          <View style={{ alignSelf: 'center', marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F6EBD3', borderWidth: 1, borderColor: '#E2C892' }}>
            <Text style={{ fontSize: 10, fontFamily: UI_SEMI, letterSpacing: 0.5, color: GOLD, textTransform: 'uppercase' }}>
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in trial
            </Text>
          </View>
        ) : null}

        <View style={{ marginTop: 24, gap: 10 }}>
          {FEATURES.map(f => (
            <View
              key={f}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: PAPER_EDGE, borderRadius: 15 }}
            >
              <Ionicons name="checkmark" size={16} color={GREEN} />
              <Text style={{ flex: 1, fontSize: 13.5, fontFamily: UI_MED, color: INK }}>{f}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        {/* price + CTA */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 22 }}>
          <View>
            <Text style={{ fontSize: 11, fontFamily: UI_SEMI, letterSpacing: 0.5, color: INK_MUTED, textTransform: 'uppercase' }}>
              Founding rate
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
              <Text style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 38, color: PURPLE }}>
                {FOUNDING_PRICE_LABEL}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: UI_MED, color: INK_MUTED }}>
                /{BILLING_PERIOD_LABEL}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: UI_MED, color: INK_FAINT, textDecorationLine: 'line-through' }}>
                {LIST_PRICE_LABEL}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={handlePurchase}
          disabled={busy}
          style={{ marginTop: 16, opacity: busy ? 0.6 : 1 }}
        >
          <LinearGradient
            colors={[PURPLE, GOLD]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={{ fontSize: 15, fontFamily: UI_BOLD, color: '#FFFFFF' }}>
                Lock {FOUNDING_PRICE_LABEL}/{BILLING_PERIOD_LABEL}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Pressable onPress={handleRestore} disabled={busy} hitSlop={8}>
            {isRestoring ? (
              <ActivityIndicator size="small" color={INK_MUTED} />
            ) : (
              <Text style={{ fontSize: 12, color: INK_MUTED, textDecorationLine: 'underline' }}>Restore purchase</Text>
            )}
          </Pressable>
        </View>

        {/* Required disclosure. Auto-renewal and cancellation must be stated on
            the screen that takes the money — a store review checks for exactly
            this, and its absence is a rejection. */}
        <Text style={{ textAlign: 'center', fontSize: 10.5, color: INK_FAINT, marginTop: 12, lineHeight: 16 }}>
          Renews every {BILLING_PERIOD_LABEL} at {FOUNDING_PRICE_LABEL} until cancelled. Cancel any time in your
          App Store or Google Play account settings. Your founding rate stays {FOUNDING_PRICE_LABEL} for as long
          as the subscription remains active.
        </Text>
      </ScrollView>
    </View>
  );
}

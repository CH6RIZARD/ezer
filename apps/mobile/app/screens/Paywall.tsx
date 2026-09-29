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
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native';
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
    redeemDevCode,
    isPurchaseNativeAvailable,
  } = usePremium();
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showDevCodeInput, setShowDevCodeInput] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [devCodeError, setDevCodeError] = useState<string | null>(null);

  const handleRedeemDevCode = async () => {
    if (!devCode.trim()) return;
    setIsRedeeming(true);
    setDevCodeError(null);
    try {
      const error = await redeemDevCode(devCode.trim());
      if (error) {
        setDevCodeError(error);
      } else {
        router.back();
      }
    } finally {
      setIsRedeeming(false);
    }
  };

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

        {/* "Trial" is two different things on this screen and they must not
            share the word. `status` here is the local, device-only APP
            PREVIEW window (PremiumContext's AsyncStorage timer) — it has
            nothing to do with the subscription's own free-trial OFFER
            (configured on the Play product itself, advertised on the CTA
            below as "Start your free 7-day trial"). Both calling themselves
            "trial" put "your trial has ended" directly above a button
            reading "start your free trial" — true at once, but it reads as
            the screen contradicting itself. This says "preview" instead. */}
        {status === 'trial' && typeof daysRemaining === 'number' && daysRemaining > 0 ? (
          <View style={{ alignSelf: 'center', marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F6EBD3', borderWidth: 1, borderColor: '#E2C892' }}>
            <Text style={{ fontSize: 10, fontFamily: UI_SEMI, letterSpacing: 0.5, color: GOLD, textTransform: 'uppercase' }}>
              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your free preview
            </Text>
          </View>
        ) : null}

        {status === 'expired' ? (
          <View style={{ alignSelf: 'center', marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#F6EBD3', borderWidth: 1, borderColor: '#E2C892' }}>
            <Text style={{ fontSize: 10, fontFamily: UI_SEMI, letterSpacing: 0.5, color: GOLD, textTransform: 'uppercase' }}>
              Your free preview has ended
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
                Start your free 7-day trial
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        {/* Private, server-checked bypass — not a client-side toggle. See
            POST /account/dev-unlock: the code is validated and the expiry
            enforced entirely server-side, against the server's clock, so it
            cannot be extended by changing this phone's date and cannot be
            found by decompiling the app (the real code is a Railway
            environment variable, never shipped in this bundle). */}
        {!showDevCodeInput ? (
          <Pressable onPress={() => setShowDevCodeInput(true)} hitSlop={8} style={{ marginTop: 14, alignSelf: 'center' }}>
            <Text style={{ fontSize: 12, color: INK_MUTED, textDecorationLine: 'underline' }}>
              Enter developer code
            </Text>
          </Pressable>
        ) : (
          <View style={{ marginTop: 14, gap: 8 }}>
            <TextInput
              value={devCode}
              onChangeText={t => {
                setDevCode(t);
                setDevCodeError(null);
              }}
              placeholder="Developer code"
              placeholderTextColor={INK_FAINT}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isRedeeming}
              secureTextEntry
              style={{
                height: 46,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: devCodeError ? '#B3402A' : PAPER_EDGE,
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 14,
                fontSize: 14,
                color: INK,
                textAlign: 'center',
              }}
            />
            {devCodeError ? (
              <Text style={{ fontSize: 11, color: '#B3402A', textAlign: 'center' }}>{devCodeError}</Text>
            ) : null}
            <Pressable
              onPress={handleRedeemDevCode}
              disabled={isRedeeming || !devCode.trim()}
              style={{
                height: 42,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: INK,
                opacity: isRedeeming || !devCode.trim() ? 0.5 : 1,
              }}
            >
              {isRedeeming ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={{ fontSize: 13, fontFamily: UI_SEMI, color: '#FFFFFF' }}>Unlock</Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Pressable onPress={handleRestore} disabled={busy} hitSlop={8}>
            {isRestoring ? (
              <ActivityIndicator size="small" color={INK_MUTED} />
            ) : (
              <Text style={{ fontSize: 12, color: INK_MUTED, textDecorationLine: 'underline' }}>Restore purchase</Text>
            )}
          </Pressable>
        </View>

        {/* Required disclosure. Auto-renewal, the trial-to-paid transition and
            cancellation must all be stated on the screen that takes the money
            — a store review checks for exactly this, and its absence is a
            rejection. The trial itself is real now: a 7-day free-trial offer
            on the ezer_premium_monthly:monthly base plan, new-subscriber
            eligibility only (Play Console). It is not guaranteed for every
            tap — someone who has already had this subscription before is
            charged immediately instead, which is normal store behavior, not
            a bug in this copy. */}
        <Text style={{ textAlign: 'center', fontSize: 10.5, color: INK_FAINT, marginTop: 12, lineHeight: 16 }}>
          Free for 7 days, then {FOUNDING_PRICE_LABEL}/{BILLING_PERIOD_LABEL}. Renews automatically until cancelled
          — cancel any time before the trial ends in your App Store or Google Play account settings to avoid being
          charged. Your founding rate stays {FOUNDING_PRICE_LABEL} for as long as the subscription remains active.
        </Text>
      </ScrollView>
    </View>
  );
}

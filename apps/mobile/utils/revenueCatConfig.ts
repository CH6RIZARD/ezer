// =============================================================================
// EZER Mobile App - RevenueCat Configuration
// Centralized constants for in-app purchase and freemium gating
// =============================================================================

import { Platform } from 'react-native';

/**
 * Sandbox key, DEVELOPMENT ONLY.
 *
 * This used to be the fallback for both platforms in every build:
 *
 *   REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? TEST_API_KEY
 *
 * Neither EXPO_PUBLIC_RC_* variable is set in any eas.json profile, so a
 * release build shipped with the test key — and the RevenueCat SDK deliberately
 * force-closes a release app that configures with one, to stop test purchases
 * leaking into production. The app died on launch with "Wrong API Key" before
 * a single screen rendered.
 *
 * A missing billing key must never be fatal. It is now used only under __DEV__;
 * a release build with no real key configures no SDK at all, and
 * PremiumContext.native.tsx already handles an absent key by leaving purchases
 * unavailable rather than crashing.
 */
const DEV_ONLY_TEST_API_KEY = 'test_nrzcZxjPNPsxyhgMCxbtSMbLygr';

const configuredKey =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_RC_IOS_KEY
    : process.env.EXPO_PUBLIC_RC_ANDROID_KEY;

export const REVENUECAT_API_KEY: string | undefined =
  configuredKey || (__DEV__ ? DEV_ONLY_TEST_API_KEY : undefined);

export const ENTITLEMENT_ID = 'premium';

/**
 * Pricing.
 *
 * Founding rate is what an early subscriber pays and keeps paying; LIST_PRICE
 * is the standard rate it is discounted from, shown struck through. Both are
 * DISPLAY ONLY — the amount actually charged comes from the store package
 * RevenueCat resolves at runtime, and a mismatch between these strings and
 * the real store price is a rejection at review. Change the store first.
 *
 * The previous single lifetime purchase was replaced deliberately: Plaid bills
 * roughly $0.88 per linked user every month for as long as the account lives,
 * so a one-time payment funds a permanent cost for a finite time and loses
 * money on every retained user afterwards.
 */
export const FOUNDING_PRICE_LABEL = '$7.99';
export const LIST_PRICE_LABEL = '$14';
export const BILLING_PERIOD_LABEL = 'month';

/**
 * The store product id is NOT read by the purchase path — PremiumContext calls
 * getOfferings() then purchasePackage() and gates purely on
 * entitlements.active[ENTITLEMENT_ID]. It is kept so the Play/RevenueCat
 * catalogue and this file can be checked against each other by eye.
 */
export const PRODUCT_ID = 'ezer_premium_monthly';

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_CASH_ADVANCE_LIMIT = 15;
export const PREMIUM_CASH_ADVANCE_LIMIT = 1500;

export const ASYNC_STORAGE_KEYS = {
  TRIAL_START_DATE: '@ezer_trial_start_date',
} as const;

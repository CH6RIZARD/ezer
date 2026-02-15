// =============================================================================
// EZER Mobile App - RevenueCat Configuration
// Centralized constants for in-app purchase and freemium gating
// =============================================================================

import { Platform } from 'react-native';

export const REVENUECAT_API_KEY =
  Platform.OS === 'ios'
    ? (process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '')
    : (process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? '');

export const ENTITLEMENT_ID = 'premium';
export const PRODUCT_ID = 'ezer_premium_lifetime';

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_CASH_ADVANCE_LIMIT = 15;
export const PREMIUM_CASH_ADVANCE_LIMIT = 1500;

export const ASYNC_STORAGE_KEYS = {
  TRIAL_START_DATE: '@ezer_trial_start_date',
} as const;

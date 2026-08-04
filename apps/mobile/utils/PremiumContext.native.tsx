// =============================================================================
// EZER Mobile App - Premium Context (Native: iOS/Android)
// Manages freemium state: 7-day trial → $3 one-time purchase via RevenueCat
// =============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
// Dynamic import so the app doesn't crash in Expo Go (native module unavailable)
let Purchases: any = null;
let LOG_LEVEL: any = { VERBOSE: 'VERBOSE' };
try {
  const rc = require('react-native-purchases');
  Purchases = rc.default;
  LOG_LEVEL = rc.LOG_LEVEL;
} catch {}
type CustomerInfo = any;
type PurchasesPackage = any;
import { useAuth } from './AuthContext';
import {
  REVENUECAT_API_KEY,
  ENTITLEMENT_ID,
  TRIAL_DURATION_DAYS,
  TRIAL_CASH_ADVANCE_LIMIT,
  PREMIUM_CASH_ADVANCE_LIMIT,
  ASYNC_STORAGE_KEYS,
} from './revenueCatConfig';
import type { PremiumStatus } from '../types';

interface PremiumContextType {
  status: PremiumStatus;
  trialEndDate: Date | null;
  daysRemaining: number;
  isLoading: boolean;
  /** True when RevenueCat native SDK is configured (not Expo Go JS-only fallback). */
  isPurchaseNativeAvailable: boolean;
  isPremium: () => boolean;
  isTrialActive: () => boolean;
  canAccessFeature: () => boolean;
  getCashAdvanceLimit: () => number;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  /** DEV only: cycle through states for testing */
  devCycleStatus: () => void;
}

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<PremiumStatus>('loading');
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [rcConfigured, setRcConfigured] = useState(false);

  // Initialize RevenueCat once
  useEffect(() => {
    if (!Purchases || !REVENUECAT_API_KEY) {
      console.log('[Premium] RevenueCat unavailable (Expo Go?) — using local trial');
      loadTrialState(null);
      return;
    }

    const configure = async () => {
      try {
        if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
        Purchases.configure({ apiKey: REVENUECAT_API_KEY });
        setRcConfigured(true);
        const customerInfo = await Purchases.getCustomerInfo();
        loadTrialState(customerInfo);
      } catch (error) {
        console.log('[Premium] RevenueCat init error, falling back to local:', error);
        loadTrialState(null);
      }
    };

    configure();
  }, []);

  // Sync RevenueCat user ID when auth changes
  useEffect(() => {
    if (!rcConfigured) return;

    const syncUser = async () => {
      try {
        if (user?.id) {
          await Purchases.logIn(user.id);
        } else {
          await Purchases.logOut();
        }
      } catch (error) {
        console.log('[Premium] User sync error:', error);
      }
    };

    syncUser();
  }, [user?.id, rcConfigured]);

  const loadTrialState = async (customerInfo: CustomerInfo | null) => {
    try {
      if (customerInfo?.entitlements.active[ENTITLEMENT_ID]) {
        setStatus('premium');
        setIsLoading(false);
        return;
      }

      const trialStart = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.TRIAL_START_DATE);

      if (!trialStart) {
        const now = new Date().toISOString();
        await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.TRIAL_START_DATE, now);
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);
        setTrialEndDate(endDate);
        setDaysRemaining(TRIAL_DURATION_DAYS);
        setStatus('trial');
      } else {
        const startDate = new Date(trialStart);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);
        const now = new Date();
        const msRemaining = endDate.getTime() - now.getTime();
        const remaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

        setTrialEndDate(endDate);
        setDaysRemaining(Math.max(0, remaining));
        setStatus(remaining > 0 ? 'trial' : 'expired');
      }
    } catch (error) {
      console.log('[Premium] Trial state load error:', error);
      setDaysRemaining(TRIAL_DURATION_DAYS);
      setStatus('trial');
    } finally {
      setIsLoading(false);
    }
  };

  const isPremium = useCallback(() => status === 'premium', [status]);
  const isTrialActive = useCallback(() => status === 'trial', [status]);
  const canAccessFeature = useCallback(() => status === 'trial' || status === 'premium', [status]);

  const getCashAdvanceLimit = useCallback(() => {
    switch (status) {
      case 'premium':
        return PREMIUM_CASH_ADVANCE_LIMIT;
      case 'trial':
        return TRIAL_CASH_ADVANCE_LIMIT;
      default:
        return 0;
    }
  }, [status]);

  const purchasePremium = async (): Promise<boolean> => {
    if (!Purchases || !rcConfigured) return false;
    try {
      const offerings = await Purchases.getOfferings();
      const currentOffering = offerings.current;
      if (!currentOffering) {
        console.log('[Premium] No offerings available');
        return false;
      }

      const pkg: PurchasesPackage | undefined =
        currentOffering.lifetime ?? currentOffering.availablePackages[0];

      if (!pkg) {
        console.log('[Premium] No package found');
        return false;
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        setStatus('premium');
        return true;
      }

      return false;
    } catch (error: any) {
      if (error.userCancelled) return false;
      console.log('[Premium] Purchase error:', error);
      return false;
    }
  };

  const restorePurchases = async (): Promise<boolean> => {
    if (!Purchases || !rcConfigured) return false;
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (customerInfo.entitlements.active[ENTITLEMENT_ID]) {
        setStatus('premium');
        return true;
      }
      return false;
    } catch (error) {
      console.log('[Premium] Restore error:', error);
      return false;
    }
  };

  const devCycleStatus = useCallback(() => {
    if (!__DEV__) return;
    const states: PremiumStatus[] = ['trial', 'expired', 'premium'];
    const currentIndex = states.indexOf(status);
    const next = states[(currentIndex + 1) % states.length];
    console.log(`[Premium DEV] Cycling status: ${status} → ${next}`);
    setStatus(next);
    if (next === 'trial') setDaysRemaining(TRIAL_DURATION_DAYS);
  }, [status]);

  return (
    <PremiumContext.Provider
      value={{
        status,
        trialEndDate,
        daysRemaining,
        isLoading,
        isPurchaseNativeAvailable: !!Purchases && rcConfigured,
        isPremium,
        isTrialActive,
        canAccessFeature,
        getCashAdvanceLimit,
        purchasePremium,
        restorePurchases,
        devCycleStatus,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const context = useContext(PremiumContext);
  if (context === undefined) {
    throw new Error('usePremium must be used within a PremiumProvider');
  }
  return context;
}

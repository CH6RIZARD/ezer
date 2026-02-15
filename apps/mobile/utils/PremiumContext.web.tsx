// =============================================================================
// EZER Mobile App - Premium Context (Web)
// Web bundle: no react-native-purchases (no web SDK). Local trial only.
// =============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
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
  isPremium: () => boolean;
  isTrialActive: () => boolean;
  canAccessFeature: () => boolean;
  getCashAdvanceLimit: () => number;
  purchasePremium: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  devCycleStatus: () => void;
}

const PremiumContext = createContext<PremiumContextType | undefined>(undefined);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PremiumStatus>('loading');
  const [trialEndDate, setTrialEndDate] = useState<Date | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTrialState = async () => {
      try {
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
      } catch {
        setDaysRemaining(TRIAL_DURATION_DAYS);
        setStatus('trial');
      } finally {
        setIsLoading(false);
      }
    };

    loadTrialState();
  }, []);

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
    // Web: no IAP; could redirect to a web paywall later
    return false;
  };

  const restorePurchases = async (): Promise<boolean> => {
    return false;
  };

  const devCycleStatus = useCallback(() => {
    if (!__DEV__) return;
    const states: PremiumStatus[] = ['trial', 'expired', 'premium'];
    const currentIndex = states.indexOf(status);
    const next = states[(currentIndex + 1) % states.length];
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

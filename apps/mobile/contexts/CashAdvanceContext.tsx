import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { CASH_ADVANCE_MAX } from '../constants/money';

export type CashAdvanceStatus = 'none' | 'in_flow' | 'active' | 'repaid';

interface CashAdvanceContextValue {
  eligibleMax: number;
  selectedAmount: number;
  activeAdvanceAmount: number;
  status: CashAdvanceStatus;
  setSelectedAmount: (amount: number) => void;
  startFlow: () => void;
  completeFlow: (amountDollars: number) => void;
  markRepaid: () => void;
  reset: () => void;
}

const CashAdvanceContext = createContext<CashAdvanceContextValue | undefined>(undefined);

export function CashAdvanceProvider({ children }: { children: ReactNode }) {
  const [eligibleMax] = useState(CASH_ADVANCE_MAX);
  const [selectedAmount, setSelectedAmountState] = useState(0);
  const [activeAdvanceAmount, setActiveAdvanceAmount] = useState(0);
  const [status, setStatus] = useState<CashAdvanceStatus>('none');

  const setSelectedAmount = useCallback((amount: number) => {
    setSelectedAmountState(amount);
  }, []);

  const startFlow = useCallback(() => {
    setStatus('in_flow');
  }, []);

  const completeFlow = useCallback((amountDollars: number) => {
    setActiveAdvanceAmount(amountDollars);
    setStatus('active');
    setSelectedAmountState(0);
  }, []);

  const markRepaid = useCallback(() => {
    setActiveAdvanceAmount(0);
    setStatus('repaid');
  }, []);

  const reset = useCallback(() => {
    setSelectedAmountState(0);
    setActiveAdvanceAmount(0);
    setStatus('none');
  }, []);

  const value: CashAdvanceContextValue = {
    eligibleMax,
    selectedAmount,
    activeAdvanceAmount,
    status,
    setSelectedAmount,
    startFlow,
    completeFlow,
    markRepaid,
    reset,
  };

  return (
    <CashAdvanceContext.Provider value={value}>
      {children}
    </CashAdvanceContext.Provider>
  );
}

export function useCashAdvance() {
  const ctx = useContext(CashAdvanceContext);
  if (ctx === undefined) {
    throw new Error('useCashAdvance must be used within CashAdvanceProvider');
  }
  return ctx;
}

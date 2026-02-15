// =============================================================================
// EZER Mobile App - Savings Goals Context
// Shared goals so Reallocate and Saved tab stay in sync
// =============================================================================

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useTheme } from './ThemeContext';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  icon: string;
  color: string;
  subscriptionIds: string[];
}

interface SavingsGoalsContextValue {
  goals: SavingsGoal[];
  addGoal: (goal: Omit<SavingsGoal, 'id'>) => void;
  updateGoal: (id: string, updates: Partial<SavingsGoal>) => void;
  deleteGoal: (id: string) => void;
  /** Add freed money to a goal (e.g. from Reallocate). */
  addToGoal: (id: string, amountCents: number) => void;
}

const SavingsGoalsContext = createContext<SavingsGoalsContextValue | undefined>(undefined);

export function SavingsGoalsProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  useEffect(() => {
    if (goals.length === 0) {
      setGoals([
        {
          id: '1',
          name: 'Emergency Fund',
          targetAmount: 5000,
          currentAmount: 1247.5,
          icon: 'shield-checkmark',
          color: colors.primary,
          subscriptionIds: ['sub1', 'sub2'],
        },
        {
          id: '2',
          name: 'Vacation',
          targetAmount: 2000,
          currentAmount: 687.23,
          icon: 'airplane',
          color: colors.accent,
          subscriptionIds: ['sub3'],
        },
      ]);
    }
  }, []);

  const addGoal = useCallback((goal: Omit<SavingsGoal, 'id'>) => {
    const id = Date.now().toString();
    setGoals((prev) => [...prev, { ...goal, id }]);
  }, []);

  const updateGoal = useCallback((id: string, updates: Partial<SavingsGoal>) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, ...updates } : g))
    );
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const addToGoal = useCallback((id: string, amountCents: number) => {
    const amountDollars = amountCents / 100;
    setGoals((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, currentAmount: g.currentAmount + amountDollars } : g
      )
    );
  }, []);

  const value: SavingsGoalsContextValue = {
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    addToGoal,
  };

  return (
    <SavingsGoalsContext.Provider value={value}>
      {children}
    </SavingsGoalsContext.Provider>
  );
}

export function useSavingsGoals() {
  const ctx = useContext(SavingsGoalsContext);
  if (ctx === undefined) {
    throw new Error('useSavingsGoals must be used within SavingsGoalsProvider');
  }
  return ctx;
}

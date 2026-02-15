import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SubscriptionsContextValue {
  cancelSubscription: (id: string) => void;
  isCancelled: (id: string) => boolean;
  cancelledIds: Set<string>;
}

const SubscriptionsContext = createContext<SubscriptionsContextValue | undefined>(undefined);

export function SubscriptionsProvider({ children }: { children: ReactNode }) {
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());

  const cancelSubscription = useCallback((id: string) => {
    setCancelledIds((prev) => new Set(prev).add(id));
  }, []);

  const isCancelled = useCallback((id: string) => {
    return cancelledIds.has(id);
  }, [cancelledIds]);

  const value: SubscriptionsContextValue = {
    cancelSubscription,
    isCancelled,
    cancelledIds,
  };

  return (
    <SubscriptionsContext.Provider value={value}>
      {children}
    </SubscriptionsContext.Provider>
  );
}

export function useSubscriptions() {
  const ctx = useContext(SubscriptionsContext);
  if (ctx === undefined) {
    throw new Error('useSubscriptions must be used within SubscriptionsProvider');
  }
  return ctx;
}

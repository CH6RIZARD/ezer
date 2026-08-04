import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../utils/AuthContext';
// demoDataAdapter is intentionally NOT imported any more — see the note above
// EMPTY_STATE. All figures come from the Plaid-backed API.

// ─── Types matching the API response shapes ───────────────────────────────────

export interface HomeSummary {
  monthlyBurnRate: number;   // cents
  next30DayRisk: number;     // cents
  silentSubscriptionsCount: number;
  totalSubscriptions: number;
  activeTrials: number;
}

export interface RiskItem {
  id: string;
  type: 'trial' | 'renewal';
  merchantName: string;
  logo?: string;
  amountCents: number;
  dueDate: string;
  daysUntilDue: number;
  subscriptionId: string;
  trialId?: string;
}

export interface FundingInstrument {
  id: string;
  type: string;
  displayName: string;
  brand: string;
  last4: string;
  issuerColorHint?: string;
  networkArt?: string;
  isDefault: boolean;
}

export interface InstrumentSummary extends FundingInstrument {
  drainedAmountCents: number;
  activeSubscriptionsCount: number;
  topMerchants: { merchantId: string; merchantName: string; logo?: string; drainedAmountCents: number }[];
}

export interface MerchantCharge {
  merchantId: string;
  merchantName: string;
  logo?: string;
  chargeCount: number;
  totalDrainedCents: number;
  monthlyEquivalentCents: number;
  billingInterval: string;
  confidenceBadge: 'high' | 'medium' | 'low';
}

export interface Subscription {
  id: string;
  merchantId: string;
  merchantName: string;
  logo?: string;
  status: string;
  cadence: string;
  renewalDate?: string;
  startedAt: string;
  /**
   * Recurring price. Optional because the API does not always send one, but
   * without it a subscription cannot be drawn on a calendar month outside the
   * 30-day risk window — there is nothing to show against the date.
   */
  amountCents?: number;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DataState {
  homeSummary: HomeSummary | null;
  risks: RiskItem[];
  instruments: FundingInstrument[];
  subscriptions: Subscription[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean; // true when user has no connected accounts yet
}

interface DataContextType extends DataState {
  refresh: () => Promise<void>;
  getInstrumentSummary: (id: string, range?: string) => Promise<InstrumentSummary | null>;
  getMerchants: (id: string, range?: string) => Promise<MerchantCharge[]>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// =============================================================================
// NO DEMO FALLBACK.
//
// This context used to seed bundled demo subscriptions whenever the API was
// unreachable or the user was signed out. That is removed deliberately: every
// figure in this app is now real Plaid-derived data or nothing.
//
// Fake balances are worse than an empty state in a money app. They hide a
// broken sync, they hide an expired Plaid item, and they make a demo look like
// it works when the pipeline behind it does not. If the dashboard is empty, the
// correct response is to connect an account — which is what the empty state now
// tells the user to do.
// =============================================================================

const EMPTY_STATE: DataState = {
  homeSummary: null,
  risks: [],
  instruments: [],
  subscriptions: [],
  isLoading: false,
  error: null,
  isEmpty: false,
};

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();

  const [state, setState] = useState<DataState>(EMPTY_STATE);

  const refresh = useCallback(async () => {
    // No session means nothing to fetch. `isEmpty` drives the "connect an
    // account" state rather than any placeholder figures.
    if (!isAuthenticated) {
      setState({ ...EMPTY_STATE, isEmpty: true });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    // allSettled, NOT all.
    //
    // Promise.all rejects on the FIRST failure, so a single flaky endpoint
    // wiped the entire dashboard — subscriptions, cards and summary — even
    // though three of the four calls had succeeded. Each result is now taken
    // on its own merit, and a partial outcome renders partially.
    const [summaryRes, risksRes, instrumentsRes, subsRes] = await Promise.allSettled([
      api.get<{ success: boolean; data: HomeSummary }>('/home/summary'),
      api.get<{ success: boolean; data: RiskItem[] }>('/risks?days=30'),
      api.get<{ success: boolean; data: FundingInstrument[] }>('/wallet/instruments'),
      api.get<{ success: boolean; data: Subscription[] }>('/subscriptions'),
    ]);

    const valueOf = <T,>(r: PromiseSettledResult<any>, fallback: T): T =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? fallback) : fallback;

    const failures = [summaryRes, risksRes, instrumentsRes, subsRes].filter(
      r => r.status === 'rejected'
    ) as PromiseRejectedResult[];

    if (failures.length === 4) {
      // Everything failed: almost always an unreachable API or a dead session.
      const message = failures[0]?.reason?.message ?? 'Could not reach EZER';
      console.log('[DataContext] refresh failed:', message);
      setState({ ...EMPTY_STATE, error: message, isEmpty: true });
      return;
    }

    if (failures.length > 0) {
      console.log(
        '[DataContext] partial refresh;',
        failures.length,
        'of 4 calls failed:',
        failures.map(f => f.reason?.message).join(', ')
      );
    }

    const instruments = valueOf<FundingInstrument[]>(instrumentsRes, []);
    const subscriptions = valueOf<Subscription[]>(subsRes, []);

    setState({
      homeSummary: valueOf<HomeSummary | null>(summaryRes, null),
      risks: valueOf<RiskItem[]>(risksRes, []),
      instruments,
      subscriptions,
      isLoading: false,
      error: null,
      // Empty means "nothing connected yet", which the UI turns into a prompt
      // to link a bank — not a silent blank screen.
      isEmpty: instruments.length === 0 && subscriptions.length === 0,
    });
  }, [isAuthenticated]);

  const getInstrumentSummary = useCallback(async (id: string, range = 'last30'): Promise<InstrumentSummary | null> => {
    try {
      const res: any = await api.get(`/wallet/instruments/${id}/summary?range=${range}`);
      return res.data;
    } catch {
      // No demo substitute: an unreachable summary shows nothing, not a
      // plausible-looking total.
      return null;
    }
  }, []);

  const getMerchants = useCallback(async (id: string, range = 'last30'): Promise<MerchantCharge[]> => {
    try {
      const res: any = await api.get(`/wallet/instruments/${id}/merchants?range=${range}`);
      return res.data || [];
    } catch {
      return [];
    }
  }, []);

  // Load data when the user authenticates. Called unconditionally so the
  // unauthenticated preview path seeds demo data too; refresh() returns early
  // without a session, so this never fires a request it shouldn't.
  useEffect(() => {
    refresh();
  }, [isAuthenticated, refresh]);

  return (
    <DataContext.Provider value={{ ...state, refresh, getInstrumentSummary, getMerchants }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

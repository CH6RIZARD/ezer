import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../utils/api';
import { useAuth } from '../utils/AuthContext';
import { parseLocalDay } from '../utils/calendarEvents';
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
  /**
   * Issuer-approved card art from Visa/Mastercard, for a card we hold a network
   * token for. RESERVED: nothing populates this yet. It becomes available only
   * once a card is entered in full (e.g. the BNPL repayment card) and tokenized
   * through a vault that returns card art; aggregator-linked cards never get it,
   * because aggregators do not provide the card number. See utils/cardArt/.
   */
  networkTokenArtUri?: string;
  /** The BANK's name ("PNC Bank"), distinct from displayName (the account's
   *  own nickname, e.g. "Spend") — a real card shows the bank's name. */
  institutionName?: string;
  /** UI grouping label only — 'pay_in_4' when linked specifically from the
   *  Spending Power screen, undefined for a general-purpose link. Settings
   *  uses this to group the linked-banks list. */
  purpose?: string;
  isDefault: boolean;
}

export interface InstrumentSummary extends FundingInstrument {
  drainedAmountCents: number;
  activeSubscriptionsCount: number;
  topMerchants: { merchantId: string; merchantName: string; logo?: string; drainedAmountCents: number }[];
}

export interface MerchantCharge {
  /** Null when this merchant has no active/trial Subscription row — e.g.
   *  charges from a subscription that was since cancelled. */
  subscriptionId: string | null;
  merchantId: string;
  merchantName: string;
  logo?: string;
  chargeCount: number;
  totalDrainedCents: number;
  monthlyEquivalentCents: number;
  billingInterval: string;
  confidenceBadge: 'high' | 'medium' | 'low';
}

/**
 * A recurring charge that hasn't posted yet inside the requested range —
 * most often "this month" on the 1st-2nd, before any real charge has hit.
 * Projected server-side from the merchant's last real charge + one billing
 * interval; see GET /wallet/instruments/:id/merchants.
 */
export interface PredictedCharge {
  merchantId: string;
  merchantName: string;
  logo?: string;
  amountCents: number;
  predictedDate: string;
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
  /** Plaid-supplied domain for this merchant, when it has one — feeds
   *  utils/cancellation.ts's auto-discovery step. */
  website?: string;
  /** A curated real cancellation URL from the merchant's own playbook. */
  cancellationUrl?: string;
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
  getMerchants: (
    id: string,
    range?: string,
    customDates?: { startDate: string; endDate: string }
  ) => Promise<{ merchants: MerchantCharge[]; predicted: PredictedCharge[]; ok: boolean }>;
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

const LAST_BG_SYNC_KEY = '@ezer_last_bg_sync';
// An hour is enough to pick up same-day activity without calling Plaid on
// every app relaunch — most sessions in one day would otherwise all fire it.
const BG_SYNC_THROTTLE_MS = 60 * 60 * 1000;

// The last good dashboard, kept on this device so a cold start paints real
// figures at once instead of zeros while four API calls are in flight. It is
// the signed-in user's own last server answer — never a substitute for one:
// a refresh always follows and replaces it, it is stamped with the user id so
// one account can never be shown another's, and it is deleted on sign-out.
const SNAPSHOT_KEY = '@ezer_data_snapshot';
type SnapshotData = Pick<DataState, 'homeSummary' | 'risks' | 'instruments' | 'subscriptions'>;
type Snapshot = SnapshotData & { userId: string };

const EMPTY_STATE: DataState = {
  homeSummary: null,
  risks: [],
  instruments: [],
  subscriptions: [],
  isLoading: false,
  error: null,
  isEmpty: false,
};

const hasData = (d: Pick<DataState, 'instruments' | 'subscriptions'>) =>
  d.instruments.length > 0 || d.subscriptions.length > 0;

export function DataProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const userId = user?.id;

  const [state, setState] = useState<DataState>(EMPTY_STATE);

  // Stamped on every refresh entry; a snapshot from an older stamp never
  // commits. Covers the logout race (stale authed data landing after sign-out
  // already cleared the state) and two interleaved refreshes mixing snapshots.
  const refreshSeq = useRef(0);
  // Mirror of `state` for refresh(), which must read the current figures
  // without taking `state` as a dependency (that would re-run the load effect).
  const stateRef = useRef(state);
  stateRef.current = state;

  // The snapshot is read at mount, in parallel with auth restoring the
  // session, so it is already in memory when the user id arrives and the
  // dashboard's first render has figures. Read after auth instead, Home
  // mounts on the same commit and paints a frame of zeros first.
  const snapRef = useRef<Snapshot | null>(null);
  const snapReady = useRef<Promise<void> | null>(null);
  if (!snapReady.current) {
    snapReady.current = AsyncStorage.getItem(SNAPSHOT_KEY)
      .then(raw => {
        snapRef.current = raw ? JSON.parse(raw) : null;
      })
      .catch(() => {});
  }

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    // No session means nothing to fetch. `isEmpty` drives the "connect an
    // account" state rather than any placeholder figures.
    if (!isAuthenticated) {
      setState({ ...EMPTY_STATE, isEmpty: true });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    // What is on screen now (possibly the hydrated snapshot): a failed call
    // keeps its last real answer instead of blanking it.
    const last = stateRef.current;

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

    // A newer refresh (or a logout) owns the state now — drop this snapshot.
    if (seq !== refreshSeq.current) return;

    const valueOf = <T,>(r: PromiseSettledResult<any>, empty: T, kept: T): T =>
      r.status === 'fulfilled' ? ((r.value as any)?.data ?? empty) : kept;

    const failures = [summaryRes, risksRes, instrumentsRes, subsRes].filter(
      r => r.status === 'rejected'
    ) as PromiseRejectedResult[];

    if (failures.length === 4) {
      // Everything failed: almost always an unreachable API or a dead session.
      const message = failures[0]?.reason?.message ?? 'Could not reach EZER';
      console.log('[DataContext] refresh failed:', message);
      // The server refused the session (expired token, deleted account): the
      // figures must not outlive it, on screen or on disk.
      if (failures.every(f => f.reason?.status === 401 || f.reason?.status === 403)) {
        snapRef.current = null;
        AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
        setState({ ...EMPTY_STATE, error: message, isEmpty: true });
        return;
      }
      // An outage: keep the last real figures on screen — offline with a
      // snapshot must not read as "connect an account". With none, this is
      // the old blank.
      setState({ ...last, isLoading: false, error: message, isEmpty: !hasData(last) });
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

    const data: SnapshotData = {
      homeSummary: valueOf<HomeSummary | null>(summaryRes, null, last.homeSummary),
      risks: valueOf<RiskItem[]>(risksRes, [], last.risks),
      instruments: valueOf<FundingInstrument[]>(instrumentsRes, [], last.instruments),
      subscriptions: valueOf<Subscription[]>(subsRes, [], last.subscriptions),
    };

    setState({
      ...data,
      isLoading: false,
      // A kept slice is stale: say so rather than pass the mix off as current.
      error: failures.length ? failures[0].reason?.message ?? 'Some data could not be refreshed' : null,
      // Empty means "nothing connected yet", which the UI turns into a prompt
      // to link a bank — not a silent blank screen.
      isEmpty: !hasData(data),
    });
    // Only a complete server answer is saved as the snapshot.
    if (userId && failures.length === 0) {
      const snapshot: Snapshot = { ...data, userId };
      snapRef.current = snapshot;
      AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => {});
    }
  }, [isAuthenticated, userId]);

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

  const getMerchants = useCallback(
    async (
      id: string,
      range = 'last30',
      customDates?: { startDate: string; endDate: string }
    ): Promise<{ merchants: MerchantCharge[]; predicted: PredictedCharge[]; ok: boolean }> => {
      try {
        // The API's `custom` range (apps/api/src/routes/wallet.ts,
        // @ezer/shared's getDateRange) requires startDate/endDate query
        // params — without them it 500s. This was never wired up: the
        // wallet screen's own "Custom" date picker computed a real
        // start/end but the request that went out always asked for a fixed
        // preset instead, so "Total drained" for a custom range never
        // actually reflected the range the user picked.
        const qs =
          range === 'custom' && customDates
            ? `range=custom&startDate=${encodeURIComponent(customDates.startDate)}&endDate=${encodeURIComponent(customDates.endDate)}`
            : `range=${range}`;
        const res: any = await api.get(`/wallet/instruments/${id}/merchants?${qs}`);
        return { merchants: res.data || [], predicted: res.predicted?.items || [], ok: true };
      } catch {
        // Empty rows, but flagged: a swallowed failure must not be mistaken
        // for a genuine "$0 / no charges" answer by anything that caches.
        return { merchants: [], predicted: [], ok: false };
      }
    },
    []
  );

  // Load data when the user authenticates. Called unconditionally so the
  // unauthenticated preview path seeds demo data too; refresh() returns early
  // without a session, so this never fires a request it shouldn't.
  //
  // Once loaded, opportunistically resync any already-linked banks. Before
  // this, the ONLY thing that ever called POST /plaid/sync was the moment a
  // bank was first connected (useConnectBank) — nothing ever re-synced it
  // afterward. A user who linked a bank and came back a week later saw
  // exactly the transactions Plaid had on link day, forever, because nothing
  // asked Plaid again. Real subscription activity that started billing after
  // link day was invisible not because detection failed, but because it was
  // never given new data to detect anything from.
  //
  // Throttled locally (AsyncStorage, not server state) so relaunching the
  // app repeatedly doesn't refire this on every cold start — a missed window
  // just waits for the next app open past the hour mark. Silent on failure:
  // the user did not ask for this sync, so it must not interrupt them with
  // an error for something they don't know is happening.
  useEffect(() => {
    let cancelled = false;

    // Auth is still restoring the session: not signed out, so the snapshot
    // must survive, and not signed in, so there is nothing to fetch yet.
    if (authLoading) return;

    // Paint the last good dashboard before the network answers.
    const hydrate = () => {
      const snap = snapRef.current;
      if (!userId || snap?.userId !== userId || hasData(stateRef.current)) return;
      const today = new Date().setHours(0, 0, 0, 0);
      const data: SnapshotData = {
        homeSummary: snap.homeSummary ?? null,
        // daysUntilDue was computed by the server on the day of the snapshot:
        // recount it from the due date, and drop what has already passed.
        risks: (snap.risks ?? [])
          .map(r => ({
            ...r,
            daysUntilDue: Math.round((parseLocalDay(r.dueDate).getTime() - today) / 86400000),
          }))
          .filter(r => r.daysUntilDue >= 0),
        instruments: snap.instruments ?? [],
        subscriptions: snap.subscriptions ?? [],
      };
      const hydrated = { ...EMPTY_STATE, ...data, isLoading: true, isEmpty: !hasData(data) };
      // Set the mirror too: refresh() below runs before the re-render.
      stateRef.current = hydrated;
      setState(hydrated);
    };

    if (!isAuthenticated) {
      // Signed out, or the stored session was rejected: the figures must
      // not outlive the session on this device.
      snapRef.current = null;
      AsyncStorage.removeItem(SNAPSHOT_KEY).catch(() => {});
    } else {
      // Synchronously, so it lands in the same commit that mounts Home.
      hydrate();
    }

    (async () => {
      if (isAuthenticated && !hasData(stateRef.current)) {
        // Auth finished before the mount-time read did (a fast restore).
        await snapReady.current;
        if (cancelled) return;
        hydrate();
      }

      await refresh();
      if (cancelled || !isAuthenticated) return;

      try {
        const last = await AsyncStorage.getItem(LAST_BG_SYNC_KEY);
        const due = !last || Date.now() - Number(last) > BG_SYNC_THROTTLE_MS;
        if (!due) return;

        await AsyncStorage.setItem(LAST_BG_SYNC_KEY, String(Date.now()));

        // 404s harmlessly when nothing is linked yet — a normal state, not a
        // failure worth surfacing.
        await api.post('/plaid/sync');
        if (!cancelled) await refresh();
      } catch {
        // Next app open past the throttle window retries.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading, userId, refresh]);

  // Stable identity: the functions are already useCallback'd, so only a real
  // state change should re-render useData consumers.
  const value = useMemo(
    () => ({ ...state, refresh, getInstrumentSummary, getMerchants }),
    [state, refresh, getInstrumentSummary, getMerchants]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

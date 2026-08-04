// =============================================================================
// EZER Mobile — Savings, backed by the API
//
// This used to be a device-local ledger: goals in AsyncStorage, and a sweep
// engine that ran on the phone. The server has the real one — double-entry
// ledger, ACH return windows, idempotent weekly sweeps — so this file is now a
// CLIENT of `/savings/*` and holds no money logic of its own.
//
// That matters beyond tidiness. Two engines meant two answers: the phone said
// "$50 every 3 days", the server said `maxWeeklyCents` $500. Whichever the user
// read, the other one was moving their money.
//
// UNITS. The API speaks integer CENTS on the wire, always. This context
// converts once, at the boundary, and exposes DOLLARS to the screens. Every
// conversion in the app should live here.
//
// WHAT THE SERVER DOES NOT STORE. A goal has no icon or colour column, and
// adding one needs a migration that cannot currently run through the Supabase
// pooler (see DEPLOY-API.md §2). Appearance is therefore kept on the device,
// keyed by the server's goal id, and falls back to a deterministic pick from
// that id so a goal created on another device still looks like something.
// =============================================================================

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useTheme } from './ThemeContext';

// -----------------------------------------------------------------------------
// Wire types — exactly what the API returns
// -----------------------------------------------------------------------------

type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETE' | 'CLOSED';

interface WireGoal {
  id: string;
  name: string;
  targetCents: number;
  targetDate: string | null;
  priority: number;
  status: GoalStatus;
  fundedCents: number;
  withdrawableCents: number;
}

interface WireSettings {
  minCheckingCents: number;
  maxWeeklyCents: number;
  pausedUntil: string | null;
  consecutiveFailures: number;
}

interface WirePreview {
  periodKey: string;
  wouldSweep: boolean;
  reason: string | null;
  amountCents?: number;
  projectedLowCents?: number | null;
  activeGoals?: number;
}

interface WireTransfer {
  id: string;
  goalId: string | null;
  direction: 'DEBIT' | 'CREDIT';
  amountCents: number;
  status: string;
  settlesAt: string | null;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// App-facing types
// -----------------------------------------------------------------------------

export interface SavingsGoal {
  id: string;
  name: string;
  /** DOLLARS. */
  targetAmount: number;
  /** DOLLARS, derived from the ledger server-side. */
  currentAmount: number;
  /** DOLLARS available now — excludes funds inside the ACH return window. */
  withdrawable: number;
  icon: string;
  color: string;
  /** True when the sweep feeds this goal (server status ACTIVE). */
  autoSave: boolean;
  status: GoalStatus;
}

export type SavingsTxType = 'transfer' | 'withdraw' | 'move';

export interface SavingsTransaction {
  id: string;
  type: SavingsTxType;
  goalId: string | null;
  /** Always POSITIVE. `type` carries the direction. */
  amountDollars: number;
  date: Date;
  status: string;
  /** True until the ACH return window has elapsed. */
  pending: boolean;
}

export type MoveResult = { ok: true; id?: string } | { ok: false; error: string };

export interface AutoSaveSettings {
  /** False when the server has the sweep paused. */
  enabled: boolean;
  /** DOLLARS — the floor the sweep never goes below. */
  bufferDollars: number;
  /** DOLLARS — weekly ceiling the server enforces. */
  weeklyCapDollars: number;
}

export interface SweepPreview {
  /** DOLLARS the server would move now; 0 when it would skip. */
  amountDollars: number;
  wouldSweep: boolean;
  /**
   * True when we could not reach the preview endpoint.
   *
   * Distinct from "would not sweep". Claiming "nothing this time" because a
   * request failed states something about the user's money that was never
   * checked — the UI has to be able to say "we could not check" instead.
   */
  unknown: boolean;
  /** Server's machine-readable reason, e.g. ITEM_NEEDS_REAUTH. */
  reason: string | null;
  /** Human sentence for that reason, resolved here so screens stay dumb. */
  explanation: string;
  activeGoals: number;
}

export type NewGoalInput = {
  name: string;
  targetAmount: number;
  icon?: string;
  color?: string;
  autoSave?: boolean;
};

interface SavingsContextValue {
  goals: SavingsGoal[];
  transactions: SavingsTransaction[];
  autoSave: AutoSaveSettings;
  preview: SweepPreview;
  /** DOLLARS in the linked checking account; null until Plaid is linked. */
  checkingBalance: number | null;
  /** Institution + mask for display, or null. */
  checkingLabel: string | null;

  /** True once the first load has completed (success or failure). */
  hydrated: boolean;
  isLoading: boolean;
  /** Set when the last refresh failed — screens must not show stale zeros silently. */
  error: string | null;
  /** No session: screens show the signed-out state rather than empty figures. */
  isSignedOut: boolean;

  refresh: () => Promise<void>;

  addGoal: (input: NewGoalInput) => Promise<MoveResult>;
  updateGoal: (
    id: string,
    updates: { name?: string; targetAmount?: number; icon?: string; color?: string }
  ) => Promise<MoveResult>;
  closeGoal: (id: string) => Promise<MoveResult>;
  setGoalAutoSave: (id: string, on: boolean) => Promise<MoveResult>;

  depositToGoal: (id: string, amountDollars: number) => Promise<MoveResult>;
  withdrawFromGoal: (id: string, amountDollars: number) => Promise<MoveResult>;
  moveBetweenGoals: (fromId: string, toId: string, amountDollars: number) => Promise<MoveResult>;

  setBuffer: (dollars: number) => Promise<MoveResult>;
  setAutoSaveEnabled: (on: boolean) => Promise<MoveResult>;

  transactionsForGoal: (goalId: string) => SavingsTransaction[];
  totalSaved: number;
  savedThisMonth: number;
  averageSave: number;
}

const SavingsContext = createContext<SavingsContextValue | undefined>(undefined);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const toDollars = (cents: number) => cents / 100;
const toCents = (dollars: number) => Math.round(dollars * 100);

/** Appearance the server does not store. */
const APPEARANCE_KEY = '@ezer_goal_appearance_v1';
type Appearance = Record<string, { icon?: string; color?: string }>;

const FALLBACK_ICONS = [
  'shield-checkmark',
  'airplane',
  'home',
  'car-sport',
  'school',
  'gift',
  'heart',
  'laptop',
  'medkit',
  'flag',
];

/** Stable per-goal index, so the same goal keeps the same look everywhere. */
function hashIndex(id: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % buckets;
}

/**
 * Turn a server reason code into something a person can act on.
 *
 * The API returns codes like ITEM_NEEDS_REAUTH; rendering those raw is how a
 * savings screen ends up shouting an enum at someone.
 */
function explainReason(
  reason: string | null,
  wouldSweep: boolean,
  amountCents: number,
  /** False when no bank has ever been linked, which changes the right copy. */
  hasBank: boolean
): string {
  if (wouldSweep && amountCents > 0) return '';
  switch (reason) {
    case 'ITEM_NEEDS_REAUTH':
      // The server returns this both for an expired item AND for a user who
      // never linked one. "We have lost the connection to your bank" is simply
      // untrue for someone who has not connected one yet, and it sends them
      // hunting for a problem that does not exist.
      return hasBank
        ? 'We have lost the connection to your bank. Reconnect it to start saving again.'
        : 'Connect your bank and we will start putting money aside for you.';
    case 'NO_FUNDING_SOURCE':
      return 'Link a bank account and we will start putting money aside for you.';
    case 'PAUSED':
      return 'Automatic saving is paused. Resume it whenever you are ready.';
    case 'ALREADY_RUN':
      return 'Already saved this week. We look again next week.';
    case 'WEEKLY_CAP_REACHED':
      return 'You have hit your weekly saving cap. It resets next week.';
    case 'BELOW_BUFFER':
    case 'INSUFFICIENT_FUNDS':
      return 'Your balance is at or below the buffer you set, so we are skipping this one.';
    case 'NO_ACTIVE_GOALS':
      return 'Turn on automatic saving for a goal and we will start moving money into it.';
    default:
      return 'Nothing to move right now. We check again each week.';
  }
}

/**
 * Classify a Transfer row for the activity feed.
 *
 * `Transfer` has no `kind` column — adding one means an enum migration, which
 * cannot currently run through the Supabase pooler. Until then this leans on a
 * property of how the rows are written: an internal goal-to-goal move is the
 * ONLY transfer created already-SETTLED with a same-day `settlesAt`. Sweeps and
 * manual deposits are created PENDING and only reach SETTLED via the processor
 * webhook, by which time `settlesAt` is four business days out.
 *
 * A sweep and a manual deposit are genuinely indistinguishable on the wire
 * (both DEBITs with a hashed idempotency key), so both read as "money in"
 * rather than the feed guessing which and being confidently wrong.
 */
function classify(t: WireTransfer): SavingsTxType {
  if (t.direction === 'CREDIT') return 'withdraw';
  if (t.status === 'SETTLED' && t.settlesAt && new Date(t.settlesAt) <= new Date(t.createdAt)) {
    return 'move';
  }
  return 'transfer';
}

const EMPTY_PREVIEW: SweepPreview = {
  amountDollars: 0,
  wouldSweep: false,
  unknown: false,
  reason: null,
  explanation: '',
  activeGoals: 0,
};

/** What we show when the preview call itself did not come back. */
const UNKNOWN_PREVIEW: SweepPreview = {
  amountDollars: 0,
  wouldSweep: false,
  unknown: true,
  reason: null,
  explanation: 'We could not check your next save just now. Pull down to try again.',
  activeGoals: 0,
};

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

export function SavingsGoalsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { colors } = useTheme();

  const [wireGoals, setWireGoals] = useState<WireGoal[]>([]);
  const [transfers, setTransfers] = useState<WireTransfer[]>([]);
  const [settings, setSettings] = useState<WireSettings | null>(null);
  const [preview, setPreview] = useState<SweepPreview>(EMPTY_PREVIEW);
  const [checkingCents, setCheckingCents] = useState<number | null>(null);
  const [checkingLabel, setCheckingLabel] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance>({});

  const [hydrated, setHydrated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- appearance (device-local) --------------------------------------------

  useEffect(() => {
    AsyncStorage.getItem(APPEARANCE_KEY)
      .then(raw => {
        if (raw) setAppearance(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const appearanceRef = useRef<Appearance>({});
  appearanceRef.current = appearance;

  const saveAppearance = useCallback((goalId: string, look: { icon?: string; color?: string }) => {
    const next: Appearance = {
      ...appearanceRef.current,
      [goalId]: { ...(appearanceRef.current[goalId] ?? {}), ...look },
    };
    setAppearance(next);
    AsyncStorage.setItem(APPEARANCE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // --- load ------------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setWireGoals([]);
      setTransfers([]);
      setSettings(null);
      setPreview(EMPTY_PREVIEW);
      setCheckingCents(null);
      setCheckingLabel(null);
      setError(null);
      setHydrated(true);
      return;
    }

    setIsLoading(true);

    // allSettled, NOT all: a flaky balance call must not blank the goals the
    // user is looking at. Each result is taken on its own merit.
    const [goalsRes, settingsRes, previewRes, transfersRes, balanceRes] = await Promise.allSettled([
      api.get<{ data: WireGoal[] }>('/savings/goals'),
      api.get<{ data: WireSettings }>('/savings/settings'),
      api.get<{ data: WirePreview }>('/savings/sweep/preview'),
      api.get<{ data: WireTransfer[] }>('/savings/transfers'),
      api.get<{ data: { checkingAvailableCents: number | null; accounts: any[] } }>(
        '/plaid/balance'
      ),
    ]);

    if (goalsRes.status === 'fulfilled') setWireGoals(goalsRes.value.data ?? []);
    if (settingsRes.status === 'fulfilled') setSettings(settingsRes.value.data ?? null);
    if (transfersRes.status === 'fulfilled') setTransfers(transfersRes.value.data ?? []);

    // Resolved BEFORE the preview copy, because whether a bank exists changes
    // which sentence is true.
    let hasBank = false;
    if (balanceRes.status === 'fulfilled') {
      const b = balanceRes.value.data;
      hasBank = (b?.accounts ?? []).length > 0;
      setCheckingCents(b?.checkingAvailableCents ?? null);
      const acct = (b?.accounts ?? []).find(
        (a: any) => a.type === 'depository' && a.subtype === 'checking'
      );
      setCheckingLabel(acct ? `${acct.institutionName} •••• ${acct.mask}` : null);
    } else {
      // A 404 here just means "no bank linked yet", which is a normal state.
      setCheckingCents(null);
      setCheckingLabel(null);
    }

    if (previewRes.status === 'fulfilled') {
      const p = previewRes.value.data;
      const cents = p.amountCents ?? 0;
      const willSweep = !!p.wouldSweep && cents > 0;
      setPreview({
        amountDollars: toDollars(cents),
        wouldSweep: willSweep,
        unknown: false,
        reason: p.reason ?? null,
        // `|| fallback` guards the one path that returns '' (a sweep IS
        // happening, so the reason line is redundant) from leaking an empty
        // sentence into a card that always renders one.
        explanation:
          explainReason(p.reason ?? null, !!p.wouldSweep, cents, hasBank) ||
          'We check again each week.',
        activeGoals: p.activeGoals ?? 0,
      });
    } else {
      setPreview(UNKNOWN_PREVIEW);
    }

    // Only the goals call failing is worth surfacing — without it the screen is
    // empty, and silence would read as "you have no savings".
    setError(goalsRes.status === 'rejected' ? 'Could not load your savings.' : null);

    setIsLoading(false);
    setHydrated(true);
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The sweep runs server-side on its own schedule, so returning to the app is
  // the moment the numbers may have changed underneath us.
  const lastRefresh = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      // Debounced: iOS fires `active` on every incidental foreground.
      if (state === 'active' && Date.now() - lastRefresh.current > 30_000) {
        lastRefresh.current = Date.now();
        refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  // --- derived ---------------------------------------------------------------

  const goals = useMemo<SavingsGoal[]>(
    () =>
      wireGoals
        .filter(g => g.status !== 'CLOSED')
        .map(g => {
          const look = appearance[g.id] ?? {};
          return {
            id: g.id,
            name: g.name,
            targetAmount: toDollars(g.targetCents),
            currentAmount: toDollars(g.fundedCents),
            withdrawable: toDollars(g.withdrawableCents),
            icon: look.icon ?? FALLBACK_ICONS[hashIndex(g.id, FALLBACK_ICONS.length)],
            color: look.color ?? colors.accInk,
            autoSave: g.status === 'ACTIVE',
            status: g.status,
          };
        }),
    [wireGoals, appearance, colors.accInk]
  );

  const transactions = useMemo<SavingsTransaction[]>(
    () =>
      transfers.map(t => ({
        id: t.id,
        type: classify(t),
        goalId: t.goalId,
        amountDollars: toDollars(t.amountCents),
        date: new Date(t.createdAt),
        status: t.status,
        // Money is pending until it settles. Showing it as available is how
        // someone spends funds that can still bounce.
        pending: t.status !== 'SETTLED',
      })),
    [transfers]
  );

  const autoSaveSettings = useMemo<AutoSaveSettings>(() => {
    const paused = settings?.pausedUntil ? new Date(settings.pausedUntil) > new Date() : false;
    return {
      enabled: !paused,
      bufferDollars: toDollars(settings?.minCheckingCents ?? 0),
      weeklyCapDollars: toDollars(settings?.maxWeeklyCents ?? 0),
    };
  }, [settings]);

  const totalSaved = useMemo(
    () => toDollars(wireGoals.reduce((s, g) => s + g.fundedCents, 0)),
    [wireGoals]
  );

  const savedThisMonth = useMemo(() => {
    const now = new Date();
    return toDollars(
      transfers
        .filter(t => {
          if (t.direction !== 'DEBIT') return false;
          const d = new Date(t.createdAt);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        })
        .reduce((s, t) => s + t.amountCents, 0)
    );
  }, [transfers]);

  const averageSave = useMemo(() => {
    const ins = transfers.filter(t => t.direction === 'DEBIT');
    if (ins.length === 0) return 0;
    return toDollars(Math.round(ins.reduce((s, t) => s + t.amountCents, 0) / ins.length));
  }, [transfers]);

  const transactionsForGoal = useCallback(
    (goalId: string) => transactions.filter(t => t.goalId === goalId),
    [transactions]
  );

  // --- mutations -------------------------------------------------------------
  //
  // Every one re-reads from the server rather than patching local state.
  // Balances here are DERIVED from a double-entry ledger with settlement rules;
  // optimistically guessing the result would put a number on screen that the
  // ledger never agreed to.

  /** Turn an API error into copy, without leaking a stack trace to the user. */
  const fail = (err: unknown, fallback: string): MoveResult => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('INSUFFICIENT_WITHDRAWABLE')) {
      return {
        ok: false,
        error: 'Some of that money is still clearing. Try again once it has settled.',
      };
    }
    if (msg.includes('SAME_GOAL')) return { ok: false, error: 'Pick a different goal.' };
    if (msg.includes('GOAL_CLOSED') || msg.includes('DESTINATION_CLOSED')) {
      return { ok: false, error: 'That goal is closed.' };
    }
    return { ok: false, error: msg || fallback };
  };

  const addGoal = useCallback(
    async (input: NewGoalInput): Promise<MoveResult> => {
      try {
        const res: any = await api.post('/savings/goals', {
          name: input.name,
          targetCents: toCents(input.targetAmount),
        });
        const id = res?.data?.id as string | undefined;

        if (id && (input.icon || input.color)) {
          saveAppearance(id, { icon: input.icon, color: input.color });
        }
        // A new goal defaults to ACTIVE server-side; only switching auto-save
        // OFF needs a follow-up call.
        if (id && input.autoSave === false) {
          await api.patch(`/savings/goals/${id}`, { status: 'PAUSED' });
        }
        await refresh();
        return { ok: true, id };
      } catch (err) {
        return fail(err, 'Could not create that goal.');
      }
    },
    [saveAppearance, refresh]
  );

  const updateGoal = useCallback(
    async (
      id: string,
      updates: { name?: string; targetAmount?: number; icon?: string; color?: string }
    ): Promise<MoveResult> => {
      try {
        const body: Record<string, unknown> = {};
        if (updates.name !== undefined) body.name = updates.name;
        if (updates.targetAmount !== undefined) body.targetCents = toCents(updates.targetAmount);

        if (Object.keys(body).length > 0) await api.patch(`/savings/goals/${id}`, body);
        if (updates.icon || updates.color) {
          saveAppearance(id, { icon: updates.icon, color: updates.color });
        }
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'Could not save those changes.');
      }
    },
    [saveAppearance, refresh]
  );

  const closeGoal = useCallback(
    async (id: string): Promise<MoveResult> => {
      try {
        await api.patch(`/savings/goals/${id}`, { status: 'CLOSED' });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'Could not close that goal.');
      }
    },
    [refresh]
  );

  const setGoalAutoSave = useCallback(
    async (id: string, on: boolean): Promise<MoveResult> => {
      try {
        await api.patch(`/savings/goals/${id}`, { status: on ? 'ACTIVE' : 'PAUSED' });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'Could not change that setting.');
      }
    },
    [refresh]
  );

  const depositToGoal = useCallback(
    async (id: string, amountDollars: number): Promise<MoveResult> => {
      if (!(amountDollars > 0)) return { ok: false, error: 'Enter an amount above $0.00.' };
      try {
        await api.post(`/savings/goals/${id}/deposit`, { amountCents: toCents(amountDollars) });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'That transfer did not go through.');
      }
    },
    [refresh]
  );

  const withdrawFromGoal = useCallback(
    async (id: string, amountDollars: number): Promise<MoveResult> => {
      if (!(amountDollars > 0)) return { ok: false, error: 'Enter an amount above $0.00.' };
      try {
        await api.post(`/savings/goals/${id}/withdraw`, {
          amountCents: toCents(amountDollars),
          speed: 'STANDARD',
        });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'That withdrawal did not go through.');
      }
    },
    [refresh]
  );

  const moveBetweenGoals = useCallback(
    async (fromId: string, toId: string, amountDollars: number): Promise<MoveResult> => {
      if (!(amountDollars > 0)) return { ok: false, error: 'Enter an amount above $0.00.' };
      try {
        await api.post('/savings/transfer', {
          fromGoalId: fromId,
          toGoalId: toId,
          amountCents: toCents(amountDollars),
        });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'That move did not go through.');
      }
    },
    [refresh]
  );

  const setBuffer = useCallback(
    async (dollars: number): Promise<MoveResult> => {
      try {
        // The server rejects anything under $10 — it is overdraft protection,
        // not a preference. Clamp here so the user meets the rule, not a 400.
        const cents = Math.max(1000, toCents(dollars));
        await api.patch('/savings/settings', { minCheckingCents: cents });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'Could not update your buffer.');
      }
    },
    [refresh]
  );

  const setAutoSaveEnabled = useCallback(
    async (on: boolean): Promise<MoveResult> => {
      try {
        // "Paused" server-side is a date, not a flag. A far-future date pauses
        // it; null resumes it.
        const pausedUntil = on ? null : new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
        await api.patch('/savings/settings', { pausedUntil });
        await refresh();
        return { ok: true };
      } catch (err) {
        return fail(err, 'Could not change that setting.');
      }
    },
    [refresh]
  );

  const value: SavingsContextValue = {
    goals,
    transactions,
    autoSave: autoSaveSettings,
    preview,
    checkingBalance: checkingCents === null ? null : toDollars(checkingCents),
    checkingLabel,
    hydrated,
    isLoading,
    error,
    isSignedOut: !isAuthenticated,
    refresh,
    addGoal,
    updateGoal,
    closeGoal,
    setGoalAutoSave,
    depositToGoal,
    withdrawFromGoal,
    moveBetweenGoals,
    setBuffer,
    setAutoSaveEnabled,
    transactionsForGoal,
    totalSaved,
    savedThisMonth,
    averageSave,
  };

  return <SavingsContext.Provider value={value}>{children}</SavingsContext.Provider>;
}

export function useSavingsGoals() {
  const ctx = useContext(SavingsContext);
  if (ctx === undefined) {
    throw new Error('useSavingsGoals must be used within SavingsGoalsProvider');
  }
  return ctx;
}

// =============================================================================
// EZER — automated goal savings engine
//
// Runs once per user per period. Idempotent on (userId, periodKey).
//
//   1. gate()        — is this user eligible to be swept right now?
//   2. safeToSave()  — how much can we take without hurting them?
//   3. allocate()    — split that across their goals
//   4. execute()     — originate ACH debits, write ledger
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
//   * Money is only ever a user's goal balance AFTER the processor settles it.
//     A debit books to IN_TRANSIT, never straight to the goal. ACH can be
//     returned for days; crediting early means paying out money that gets
//     clawed back.
//   * Balances are DERIVED from ledger entries. There is no mutable balance
//     column in this subsystem. Every movement is two signed rows summing to
//     zero, so the books cannot silently drift.
// =============================================================================

import { prisma } from '@ezer/db';
import { createHash } from 'crypto';

type Cents = number;

// -----------------------------------------------------------------------------
// Small date helpers. Kept local so the engine has no date-library dependency.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

/** ACH settles in business days; weekends do not count. */
export function addBusinessDays(d: Date, n: number): Date {
  let out = new Date(d);
  let left = n;
  while (left > 0) {
    out = addDays(out, 1);
    const day = out.getDay();
    if (day !== 0 && day !== 6) left--;
  }
  return out;
}

function last7Days(): Date {
  return addDays(today(), -7);
}

/** ISO week key, e.g. "2026-W31". Used as the idempotency period. */
export function weekKey(d: Date = today()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // ISO weeks run Monday-Sunday and week 1 contains the first Thursday.
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface DatedAmount {
  date: Date;
  cents: Cents;
}

// =============================================================================
// 1. GATE — cheap disqualifiers, before we spend a Plaid balance call
// =============================================================================

export type GateReason =
  | 'ALREADY_RUN'
  | 'USER_PAUSED'
  | 'FAILURE_BACKOFF'
  | 'ITEM_NEEDS_REAUTH'
  | 'WEEKLY_CAP'
  | 'NO_GOALS';

export interface GateResult {
  ok: boolean;
  reason?: GateReason;
}

export async function gate(userId: string, periodKey: string): Promise<GateResult> {
  // Cheapest check first: the unique index on (userId, periodKey) is the real
  // lock, but reading it here avoids doing any work at all on a retried cron.
  const existing = await prisma.sweepRun.findUnique({
    where: { userId_periodKey: { userId, periodKey } },
  });
  if (existing) return { ok: false, reason: 'ALREADY_RUN' };

  const settings = await getSettings(userId);

  if (settings.pausedUntil && settings.pausedUntil > today()) {
    return { ok: false, reason: 'USER_PAUSED' };
  }

  // Three strikes stops us hammering an account that keeps returning debits —
  // every NSF costs the user a fee.
  if (settings.consecutiveFailures >= 3) {
    return { ok: false, reason: 'FAILURE_BACKOFF' };
  }

  const src = await getPrimaryFundingSource(userId);
  if (!src || src.status !== 'ACTIVE') {
    // Caller should send the user through Plaid Link update-mode.
    return { ok: false, reason: 'ITEM_NEEDS_REAUTH' };
  }

  const weekTotal = await sumDebits(userId, last7Days());
  if (weekTotal >= settings.maxWeeklyCents) {
    return { ok: false, reason: 'WEEKLY_CAP' };
  }

  const activeGoals = await prisma.savingsGoal.count({
    where: { userId, status: 'ACTIVE' },
  });
  if (activeGoals === 0) return { ok: false, reason: 'NO_GOALS' };

  return { ok: true };
}

// =============================================================================
// 2. SAFE TO SAVE
// =============================================================================

export interface GoalWithFunding {
  id: string;
  targetCents: Cents;
  targetDate: Date | null;
  priority: number;
  fundedCents: Cents;
  rule: {
    mode: 'FIXED' | 'ADAPTIVE';
    cadence: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'PAYDAY';
    fixedAmountCents: Cents | null;
    maxPeriodCents: Cents | null;
    aggressiveness: number;
  };
}

const CADENCE_DAYS: Record<GoalWithFunding['rule']['cadence'], number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  MONTHLY: 30,
  // Treated as biweekly until real payroll cadence is detected from inflows.
  PAYDAY: 14,
};

function periodsBetween(from: Date, to: Date, cadence: GoalWithFunding['rule']['cadence']): number {
  const days = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
  return Math.ceil(days / CADENCE_DAYS[cadence]);
}

/**
 * FIXED mode: pure arithmetic, recomputed every run so it SELF-HEALS. If a
 * period is skipped or a debit is returned, the next run divides the same
 * remaining amount by fewer periods and catches up automatically — no separate
 * catch-up bookkeeping.
 */
export function fixedPerPeriod(goal: GoalWithFunding, fundedCents: Cents): Cents {
  const remaining = goal.targetCents - fundedCents;
  if (remaining <= 0) return 0;
  if (!goal.targetDate) return goal.rule.fixedAmountCents ?? 0;

  const periodsLeft = Math.max(1, periodsBetween(today(), goal.targetDate, goal.rule.cadence));
  return Math.min(Math.ceil(remaining / periodsLeft), remaining);
}

/**
 * Day-by-day minimum across the horizon.
 *
 * The MINIMUM is what matters, not the end state: an account that ends the
 * fortnight healthy can still dip below zero on the day rent clears. Bills are
 * applied before inflows within a day, and the balance is sampled after the
 * debits — the pessimistic reading, which is the correct bias when the downside
 * is an overdraft fee.
 */
export function simulateDailyMinimum(
  start: Cents,
  inflows: DatedAmount[],
  outflows: DatedAmount[],
  horizonEnd: Date
): Cents {
  let bal = start;
  let min = start;

  for (const day of eachDay(today(), horizonEnd)) {
    for (const o of outflows.filter(x => sameDay(x.date, day))) bal -= o.cents;
    min = Math.min(min, bal);
    for (const i of inflows.filter(x => sameDay(x.date, day))) bal += i.cents;
  }
  return min;
}

export interface SafeToSaveResult {
  cents: Cents;
  reason: 'OK' | 'NO_SURPLUS' | 'BELOW_MIN_SWEEP' | 'NO_BALANCE';
  projectedLow?: Cents;
}

/**
 * ADAPTIVE mode — forecast the checking account's LOW POINT between now and the
 * next paycheck, and sweep only what sits above the user's buffer.
 *
 * EZER's advantage: the subscription tracker already knows the recurring
 * debits, so the outflow forecast is real data rather than a guess.
 */
export async function safeToSave(userId: string): Promise<SafeToSaveResult> {
  const settings = await getSettings(userId);

  // ALWAYS a live balance call — never a cached one. This is the single most
  // important guardrail against overdrafting someone.
  const balance = await fetchLiveBalance(userId);
  if (balance === null) return { cents: 0, reason: 'NO_BALANCE' };

  const horizonEnd = (await nextExpectedInflowDate(userId)) ?? addDays(today(), 14);
  const outflows = await forecastOutflows(userId, today(), horizonEnd);
  const inflows = await forecastInflows(userId, today(), horizonEnd);

  const projectedLow = simulateDailyMinimum(balance, inflows, outflows, horizonEnd);

  const surplus = projectedLow - settings.minCheckingCents;
  if (surplus <= 0) return { cents: 0, reason: 'NO_SURPLUS', projectedLow };

  const aggressiveness = await getUserAggressiveness(userId);
  let amount = Math.floor(surplus * aggressiveness);

  // Never breach the weekly cap, even if the surplus is large.
  const remainingWeekly = settings.maxWeeklyCents - (await sumDebits(userId, last7Days()));
  amount = Math.min(amount, Math.max(0, remainingWeekly));

  // Whole dollars — a $3.47 sweep looks like a bug on a statement.
  amount = Math.floor(amount / 100) * 100;

  if (amount < 100) return { cents: 0, reason: 'BELOW_MIN_SWEEP', projectedLow };
  return { cents: amount, reason: 'OK', projectedLow };
}

// =============================================================================
// 3. ALLOCATE across goals
// =============================================================================

function byPriority(a: GoalWithFunding, b: GoalWithFunding): number {
  // Lower priority number first; ties broken by the nearer deadline.
  if (a.priority !== b.priority) return a.priority - b.priority;
  const at = a.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bt = b.targetDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return at - bt;
}

/**
 * Required-rate allocation: every goal first gets what it NEEDS this period to
 * hit its date, and only the remainder is distributed by priority.
 *
 * The alternative — pure priority order — starves a deadline goal sitting
 * behind an open-ended "vacation" goal that can absorb unlimited money.
 */
export function allocate(pool: Cents, goals: GoalWithFunding[]): Map<string, Cents> {
  const out = new Map<string, Cents>();
  const active = goals.filter(g => g.fundedCents < g.targetCents);
  if (!active.length || pool <= 0) return out;

  const needs = active.map(g => ({
    goal: g,
    need: Math.min(fixedPerPeriod(g, g.fundedCents), g.targetCents - g.fundedCents),
  }));
  const totalNeed = needs.reduce((s, n) => s + n.need, 0);

  if (pool >= totalNeed) {
    // Everyone gets their required rate; the surplus goes by priority.
    let left = pool;
    for (const n of needs) {
      out.set(n.goal.id, n.need);
      left -= n.need;
    }
    for (const g of [...active].sort(byPriority)) {
      if (left <= 0) break;
      const already = out.get(g.id) ?? 0;
      const room = g.targetCents - g.fundedCents - already;
      const ceiling = g.rule.maxPeriodCents != null ? g.rule.maxPeriodCents - already : left;
      const extra = Math.max(0, Math.min(left, room, ceiling));
      out.set(g.id, already + extra);
      left -= extra;
    }
  } else {
    // Short: split proportionally to need, rounded down to whole dollars.
    let assigned = 0;
    for (const n of needs) {
      const share = Math.floor((pool * (n.need / totalNeed)) / 100) * 100;
      out.set(n.goal.id, share);
      assigned += share;
    }
    // Rounding always loses cents; give the drift to the top-priority goal
    // rather than letting it vanish from the plan.
    const drift = pool - assigned;
    if (drift > 0) {
      const top = [...active].sort(byPriority)[0];
      out.set(top.id, (out.get(top.id) ?? 0) + drift);
    }
  }

  // Never emit zero-value legs — they would create empty transfers.
  for (const [k, v] of [...out]) if (v <= 0) out.delete(k);
  return out;
}

// =============================================================================
// 4. EXECUTE — originate + ledger
// =============================================================================

export interface ProcessorClient {
  originateDebit(args: {
    processorToken: string | null;
    amountCents: Cents;
    idempotencyKey: string;
  }): Promise<{ externalId: string }>;
  originateCredit(args: {
    processorToken: string | null;
    amountCents: Cents;
    idempotencyKey: string;
    rail: 'ACH' | 'RTP';
  }): Promise<{ externalId: string }>;
}

export function idempotencyKey(userId: string, goalId: string, periodKey: string): string {
  return createHash('sha256').update(`${userId}:${goalId}:${periodKey}`).digest('hex');
}

/**
 * Write the plan and originate the debits.
 *
 * ORDERING: the DB transaction records intent (sweep_runs + transfers + ledger)
 * and commits BEFORE any processor call. The alternative — calling the
 * processor inside the transaction — risks a network timeout rolling back the
 * DB while the money still moves at the bank, which is unrecoverable. Here, a
 * crash after commit leaves a PENDING transfer that the reconciler retries
 * safely under the same idempotency key.
 */
export async function execute(
  userId: string,
  periodKey: string,
  plan: Map<string, Cents>,
  processor: ProcessorClient
): Promise<{ transferIds: string[] }> {
  if (plan.size === 0) return { transferIds: [] };

  const src = await getPrimaryFundingSource(userId);
  const settlesAt = addBusinessDays(today(), 4); // ACH return window

  const created = await prisma.$transaction(async tx => {
    // UNIQUE(userId, periodKey) — a concurrent run throws here and aborts.
    await tx.sweepRun.create({
      data: { userId, periodKey, decided: Object.fromEntries(plan) as object },
    });

    const ids: { id: string; key: string; cents: Cents }[] = [];

    for (const [goalId, cents] of plan) {
      if (cents <= 0) continue;
      const key = idempotencyKey(userId, goalId, periodKey);

      const transfer = await tx.transfer.create({
        data: {
          userId,
          goalId,
          direction: 'DEBIT',
          amountCents: cents,
          status: 'PENDING',
          idempotencyKey: key,
          settlesAt,
        },
      });

      // Booked as IN_TRANSIT, NOT as goal balance. It only becomes the user's
      // savings when the processor says it settled.
      const inTransit = await ensureAccount(tx, userId, 'IN_TRANSIT');
      const fbo = await ensureAccount(tx, userId, 'FBO_CASH');
      await tx.savingsLedgerEntry.createMany({
        data: [
          { transferId: transfer.id, accountId: inTransit.id, amountCents: cents },
          { transferId: transfer.id, accountId: fbo.id, amountCents: -cents },
        ],
      });

      ids.push({ id: transfer.id, key, cents });
    }

    return ids;
  });

  // Processor calls sit OUTSIDE the money math, keyed by the same idempotency
  // key so a retry cannot double-debit.
  for (const t of created) {
    try {
      const res = await processor.originateDebit({
        processorToken: src?.processorToken ?? null,
        amountCents: t.cents,
        idempotencyKey: t.key,
      });
      await prisma.transfer.update({
        where: { id: t.id },
        data: { status: 'SUBMITTED', externalId: res.externalId },
      });
    } catch {
      // Left PENDING on purpose. A failed origination is NOT a returned debit:
      // marking it FAILED here would reverse a ledger entry for money that may
      // yet move. The reconciler resolves it against the processor.
      await prisma.transfer.update({ where: { id: t.id }, data: { status: 'PENDING' } });
    }
  }

  return { transferIds: created.map(c => c.id) };
}

// =============================================================================
// Webhook — the ONLY place money becomes a user's goal balance
// =============================================================================

export interface ProcessorEvent {
  externalId: string;
  type: 'settled' | 'returned';
  returnCode?: string;
}

export async function onTransferEvent(evt: ProcessorEvent): Promise<void> {
  const tr = await prisma.transfer.findUnique({ where: { externalId: evt.externalId } });
  if (!tr) return;

  // Webhooks are at-least-once; replaying a settled transfer would double-credit.
  if (tr.status === 'SETTLED' || tr.status === 'RETURNED') return;

  if (evt.type === 'settled') {
    await prisma.$transaction(async tx => {
      await tx.transfer.update({ where: { id: tr.id }, data: { status: 'SETTLED' } });

      if (tr.direction === 'DEBIT' && tr.goalId) {
        const inTransit = await ensureAccount(tx, tr.userId, 'IN_TRANSIT');
        const goalAcct = await ensureAccount(tx, tr.userId, 'GOAL', tr.goalId);
        await tx.savingsLedgerEntry.createMany({
          data: [
            { transferId: tr.id, accountId: inTransit.id, amountCents: -tr.amountCents },
            { transferId: tr.id, accountId: goalAcct.id, amountCents: tr.amountCents },
          ],
        });
        await maybeCompleteGoal(tx, tr.goalId);
      }
    });
    await prisma.savingsSettings.updateMany({
      where: { userId: tr.userId },
      data: { consecutiveFailures: 0 },
    });
    return;
  }

  // returned — R01 NSF, R02 closed, R08 stop payment…
  await prisma.$transaction(async tx => {
    await tx.transfer.update({
      where: { id: tr.id },
      data: { status: 'RETURNED', returnCode: evt.returnCode ?? null },
    });

    // Reverse by writing the exact inverse rows. We never delete ledger
    // entries — the history of a reversal is itself auditable.
    const entries = await tx.savingsLedgerEntry.findMany({ where: { transferId: tr.id } });
    if (entries.length) {
      await tx.savingsLedgerEntry.createMany({
        data: entries.map(e => ({
          transferId: tr.id,
          accountId: e.accountId,
          amountCents: -e.amountCents,
        })),
      });
    }
  });

  await bumpFailureCount(tr.userId);

  // Learn from the miss: an NSF means our buffer was too low for this user.
  if (evt.returnCode === 'R01') await raiseMinBuffer(tr.userId);
  if (['R02', 'R03', 'R04'].includes(evt.returnCode ?? '')) await markSourceRevoked(tr.userId);
}

// =============================================================================
// 5. WITHDRAWAL
// =============================================================================

/**
 * Withdrawable = settled goal balance MINUS anything still inside the ACH
 * return window. Skip that subtraction and you are paying out money the bank
 * can still claw back.
 */
export async function withdrawableCents(userId: string, goalId: string): Promise<Cents> {
  const settled = await goalBalanceCents(userId, goalId);

  const held = await prisma.transfer.aggregate({
    where: {
      userId,
      goalId,
      direction: 'DEBIT',
      status: 'SETTLED',
      settlesAt: { gt: today() },
    },
    _sum: { amountCents: true },
  });

  return Math.max(0, settled - (held._sum.amountCents ?? 0));
}

export async function withdraw(
  userId: string,
  goalId: string,
  cents: Cents,
  speed: 'STANDARD' | 'INSTANT',
  processor: ProcessorClient
): Promise<{ transferId: string }> {
  const avail = await withdrawableCents(userId, goalId);
  if (cents <= 0) throw new Error('INVALID_AMOUNT');
  if (cents > avail) throw new Error('INSUFFICIENT_WITHDRAWABLE');

  const src = await getPrimaryFundingSource(userId);
  const key = createHash('sha256')
    .update(`wd:${userId}:${goalId}:${Date.now()}`)
    .digest('hex');

  const transfer = await prisma.$transaction(async tx => {
    const tr = await tx.transfer.create({
      data: {
        userId,
        goalId,
        direction: 'CREDIT',
        amountCents: cents,
        status: 'PENDING',
        idempotencyKey: key,
      },
    });

    const goalAcct = await ensureAccount(tx, userId, 'GOAL', goalId);
    const inTransit = await ensureAccount(tx, userId, 'IN_TRANSIT');
    await tx.savingsLedgerEntry.createMany({
      data: [
        { transferId: tr.id, accountId: goalAcct.id, amountCents: -cents },
        { transferId: tr.id, accountId: inTransit.id, amountCents: cents },
      ],
    });

    return tr;
  });

  const res = await processor.originateCredit({
    processorToken: src?.processorToken ?? null,
    amountCents: cents,
    idempotencyKey: key,
    // RTP/FedNow is instant but costs per transfer; ACH is free and slow.
    rail: speed === 'INSTANT' ? 'RTP' : 'ACH',
  });

  await prisma.transfer.update({
    where: { id: transfer.id },
    data: { status: 'SUBMITTED', externalId: res.externalId },
  });

  return { transferId: transfer.id };
}

// =============================================================================
// Orchestration
// =============================================================================

export interface SweepOutcome {
  ran: boolean;
  reason?: string;
  periodKey: string;
  totalCents: Cents;
  plan: Record<string, Cents>;
}

export async function runSweep(
  userId: string,
  processor: ProcessorClient,
  periodKey: string = weekKey()
): Promise<SweepOutcome> {
  const g = await gate(userId, periodKey);
  if (!g.ok) return { ran: false, reason: g.reason, periodKey, totalCents: 0, plan: {} };

  const safe = await safeToSave(userId);
  if (safe.cents <= 0) {
    return { ran: false, reason: safe.reason, periodKey, totalCents: 0, plan: {} };
  }

  const goals = await loadGoalsWithFunding(userId);
  const plan = allocate(safe.cents, goals);
  if (plan.size === 0) {
    return { ran: false, reason: 'NOTHING_TO_FUND', periodKey, totalCents: 0, plan: {} };
  }

  await execute(userId, periodKey, plan, processor);

  const total = [...plan.values()].reduce((s, v) => s + v, 0);
  return { ran: true, periodKey, totalCents: total, plan: Object.fromEntries(plan) };
}

// =============================================================================
// Data access
// =============================================================================

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Buckets are created on demand; UNIQUE(userId, kind, goalId) keeps them singular. */
async function ensureAccount(
  tx: Tx,
  userId: string,
  kind: 'AVAILABLE' | 'GOAL' | 'IN_TRANSIT' | 'FBO_CASH',
  goalId: string | null = null
) {
  const existing = await tx.internalAccount.findFirst({ where: { userId, kind, goalId } });
  if (existing) return existing;
  return tx.internalAccount.create({ data: { userId, kind, goalId } });
}

export async function getSettings(userId: string) {
  const s = await prisma.savingsSettings.findUnique({ where: { userId } });
  if (s) return s;
  return prisma.savingsSettings.create({ data: { userId } });
}

export async function getPrimaryFundingSource(userId: string) {
  return (
    (await prisma.fundingSource.findFirst({ where: { userId, isPrimary: true } })) ??
    (await prisma.fundingSource.findFirst({ where: { userId, status: 'ACTIVE' } }))
  );
}

/** Sum of DEBIT transfers since a date, excluding returns (they never landed). */
export async function sumDebits(userId: string, since: Date): Promise<Cents> {
  const agg = await prisma.transfer.aggregate({
    where: {
      userId,
      direction: 'DEBIT',
      createdAt: { gte: since },
      status: { notIn: ['RETURNED', 'FAILED', 'CANCELED'] },
    },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

/** Derived balance for a goal bucket. Never a stored column. */
export async function goalBalanceCents(userId: string, goalId: string): Promise<Cents> {
  const acct = await prisma.internalAccount.findFirst({
    where: { userId, kind: 'GOAL', goalId },
  });
  if (!acct) return 0;
  const agg = await prisma.savingsLedgerEntry.aggregate({
    where: { accountId: acct.id },
    _sum: { amountCents: true },
  });
  return agg._sum.amountCents ?? 0;
}

export async function loadGoalsWithFunding(userId: string): Promise<GoalWithFunding[]> {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { rule: true },
  });

  return Promise.all(
    goals.map(async g => ({
      id: g.id,
      targetCents: g.targetCents,
      targetDate: g.targetDate,
      priority: g.priority,
      fundedCents: await goalBalanceCents(userId, g.id),
      rule: {
        mode: g.rule?.mode ?? 'ADAPTIVE',
        cadence: g.rule?.cadence ?? 'WEEKLY',
        fixedAmountCents: g.rule?.fixedAmountCents ?? null,
        maxPeriodCents: g.rule?.maxPeriodCents ?? null,
        aggressiveness: g.rule ? Number(g.rule.aggressiveness) : 0.5,
      },
    }))
  );
}

async function getUserAggressiveness(userId: string): Promise<number> {
  const rule = await prisma.goalAllocationRule.findFirst({
    where: { goal: { userId, status: 'ACTIVE' } },
    orderBy: { goal: { priority: 'asc' } },
  });
  const v = rule ? Number(rule.aggressiveness) : 0.5;
  // Clamp: a corrupt value must not turn into "sweep everything".
  return Math.min(0.75, Math.max(0.25, v));
}

async function maybeCompleteGoal(tx: Tx, goalId: string) {
  const goal = await tx.savingsGoal.findUnique({ where: { id: goalId } });
  if (!goal) return;

  const acct = await tx.internalAccount.findFirst({
    where: { userId: goal.userId, kind: 'GOAL', goalId },
  });
  if (!acct) return;

  const agg = await tx.savingsLedgerEntry.aggregate({
    where: { accountId: acct.id },
    _sum: { amountCents: true },
  });
  const funded = agg._sum.amountCents ?? 0;

  if (funded >= goal.targetCents && goal.status === 'ACTIVE') {
    await tx.savingsGoal.update({
      where: { id: goalId },
      data: { status: 'COMPLETE', completedAt: new Date() },
    });
  }
}

async function bumpFailureCount(userId: string) {
  await prisma.savingsSettings.update({
    where: { userId },
    data: { consecutiveFailures: { increment: 1 } },
  });
}

/**
 * An R01 means our forecast let the balance go too low for this user's real
 * spending. Raise their floor by $25 (capped at $500) so the next sweep is
 * more conservative.
 */
async function raiseMinBuffer(userId: string) {
  const s = await getSettings(userId);
  const next = Math.min(s.minCheckingCents + 2500, 50000);
  await prisma.savingsSettings.update({
    where: { userId },
    data: { minCheckingCents: next },
  });
}

async function markSourceRevoked(userId: string) {
  await prisma.fundingSource.updateMany({
    where: { userId, isPrimary: true },
    data: { status: 'REVOKED' },
  });
}

// =============================================================================
// Forecast inputs
//
// These are the seams where Plaid plugs in. Each is written against data EZER
// already holds, so the engine is testable and demo-able before a processor
// is contracted.
// =============================================================================

/**
 * Live available balance. Returns null when we cannot read one — the caller
 * MUST treat that as "do not sweep" rather than assuming zero or a default.
 */
async function fetchLiveBalance(userId: string): Promise<Cents | null> {
  const src = await getPrimaryFundingSource(userId);
  if (!src) return null;

  // TODO(plaid): plaidClient.accountsBalanceGet({ access_token }) and read
  // balances.available (NOT .current — current includes uncleared credits).
  // Deliberately null until wired: guessing a balance here is how people get
  // overdrafted.
  return null;
}

/** Recurring debits we already track, projected into the horizon. */
export async function forecastOutflows(
  userId: string,
  from: Date,
  to: Date
): Promise<DatedAmount[]> {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: { in: ['active', 'trial'] } },
    include: { priceHistory: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  const out: DatedAmount[] = [];
  for (const s of subs) {
    if (!s.renewalDate) continue;
    const cents = s.priceHistory[0]?.amountCents ?? 0;
    if (cents <= 0) continue;

    // Roll the renewal forward on its cadence until past the horizon.
    const step = s.cadence === 'weekly' ? 7 : s.cadence === 'yearly' ? 365 : 30;
    for (let d = new Date(s.renewalDate); d <= to; d = addDays(d, step)) {
      if (d >= from) out.push({ date: new Date(d), cents });
    }
  }
  return out;
}

/** Detected paychecks. Empty until income detection is wired. */
export async function forecastInflows(
  _userId: string,
  _from: Date,
  _to: Date
): Promise<DatedAmount[]> {
  // TODO(plaid): derive from recurring credit transactions. Returning [] is the
  // conservative choice — it makes the projected low POINT lower, so we sweep
  // less, never more.
  return [];
}

/** Next expected paycheck, which bounds the forecast horizon. */
async function nextExpectedInflowDate(_userId: string): Promise<Date | null> {
  // TODO(plaid): from detected payroll cadence. Null falls back to 14 days.
  return null;
}

// ============================================================================
// Manual money movement
//
// The sweep is automatic and the withdrawal is the exit. These two cover the
// cases in between: pushing money in on purpose, and re-aiming money you have
// already saved at a different goal.
//
// Both are written here rather than in the route so they share the ledger
// invariants with the sweep: every transfer's entries sum to zero, and nothing
// becomes withdrawable before its ACH return window has elapsed.
// ============================================================================

/**
 * Deposit the user's own money into a goal, on demand.
 *
 * Deliberately identical to a sweep leg: booked to IN_TRANSIT (not to the goal)
 * and only credited to the goal when the processor confirms settlement, with
 * the same four-business-day return window. A manual deposit that landed
 * instantly would be spendable before the ACH pull could bounce, which is the
 * exact hole `withdrawableCents` exists to close.
 */
export async function deposit(
  userId: string,
  goalId: string,
  cents: Cents,
  processor: ProcessorClient
): Promise<{ transferId: string; settlesAt: Date }> {
  if (cents <= 0) throw new Error('INVALID_AMOUNT');

  const src = await getPrimaryFundingSource(userId);
  const settlesAt = addBusinessDays(today(), 4);

  // Time-based, because a user may legitimately deposit twice in one day. The
  // sweep's key is (user, goal, period) precisely because it must NOT repeat.
  const key = createHash('sha256')
    .update(`dep:${userId}:${goalId}:${Date.now()}:${cents}`)
    .digest('hex');

  const transfer = await prisma.$transaction(async tx => {
    const tr = await tx.transfer.create({
      data: {
        userId,
        goalId,
        direction: 'DEBIT',
        amountCents: cents,
        status: 'PENDING',
        idempotencyKey: key,
        settlesAt,
      },
    });

    const inTransit = await ensureAccount(tx, userId, 'IN_TRANSIT');
    const fbo = await ensureAccount(tx, userId, 'FBO_CASH');
    await tx.savingsLedgerEntry.createMany({
      data: [
        { transferId: tr.id, accountId: inTransit.id, amountCents: cents },
        { transferId: tr.id, accountId: fbo.id, amountCents: -cents },
      ],
    });

    return tr;
  });

  try {
    // No `rail` here: pulls from the user's bank are ACH by definition, so
    // `originateDebit` does not take one. Only credits (payouts) choose a rail,
    // because only there does instant-vs-standard cost money.
    const res = await processor.originateDebit({
      processorToken: src?.processorToken ?? null,
      amountCents: cents,
      idempotencyKey: key,
    });
    await prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: 'SUBMITTED', externalId: res.externalId },
    });
  } catch (err) {
    await prisma.transfer.update({ where: { id: transfer.id }, data: { status: 'FAILED' } });
    throw err;
  }

  return { transferId: transfer.id, settlesAt };
}

/**
 * Move settled money from one goal to another.
 *
 * No money leaves the institution, so there is no processor call and no return
 * window to wait out — the funds already served theirs in the source goal.
 * That is also why it is capped at `withdrawableCents` rather than the raw
 * balance: allowing unsettled money to hop goals would launder the return
 * window and let it be withdrawn early from the destination.
 *
 * NOTE ON `direction`. `TransferDirection` models money crossing the bank
 * boundary and has only DEBIT and CREDIT; an internal move crosses nothing.
 * It is recorded as a DEBIT that is already SETTLED, with an `mv:` idempotency
 * prefix so these are trivially separable in the transfer history. Adding an
 * INTERNAL enum value would be truer, but `ALTER TYPE … ADD VALUE` needs a
 * migration, and migrations cannot currently run through the Supabase
 * transaction pooler (see DEPLOY-API.md §2).
 */
export async function moveBetweenGoals(
  userId: string,
  fromGoalId: string,
  toGoalId: string,
  cents: Cents
): Promise<{ transferId: string }> {
  if (cents <= 0) throw new Error('INVALID_AMOUNT');
  if (fromGoalId === toGoalId) throw new Error('SAME_GOAL');

  const avail = await withdrawableCents(userId, fromGoalId);
  if (cents > avail) throw new Error('INSUFFICIENT_WITHDRAWABLE');

  const key = createHash('sha256')
    .update(`mv:${userId}:${fromGoalId}:${toGoalId}:${Date.now()}:${cents}`)
    .digest('hex');

  const transfer = await prisma.$transaction(async tx => {
    const tr = await tx.transfer.create({
      data: {
        userId,
        goalId: toGoalId,
        direction: 'DEBIT',
        amountCents: cents,
        // Already settled: this money cleared when it entered the source goal.
        status: 'SETTLED',
        idempotencyKey: key,
        // MUST be `today()` (midnight), not `new Date()`.
        //
        // `withdrawableCents` holds back settled DEBITs whose `settlesAt` is
        // strictly greater than `today()`. A timestamp of "now" is greater than
        // midnight, so stamping the current time made moved funds count as a
        // hold — money that had already cleared its return window in the source
        // goal became unwithdrawable in the destination until the next day.
        // An internal move must not restart a clock that already ran.
        settlesAt: today(),
      },
    });

    const fromAcct = await ensureAccount(tx, userId, 'GOAL', fromGoalId);
    const toAcct = await ensureAccount(tx, userId, 'GOAL', toGoalId);
    await tx.savingsLedgerEntry.createMany({
      data: [
        { transferId: tr.id, accountId: fromAcct.id, amountCents: -cents },
        { transferId: tr.id, accountId: toAcct.id, amountCents: cents },
      ],
    });

    await maybeCompleteGoal(tx, toGoalId);
    return tr;
  });

  return { transferId: transfer.id };
}

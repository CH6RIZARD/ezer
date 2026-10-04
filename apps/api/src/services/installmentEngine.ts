// =============================================================================
// EZER — Pay in 4 installment charging engine
//
// Mirrors services/savingsEngine.ts's shape deliberately: same PENDING →
// SUBMITTED → SETTLED/RETURNED Transfer lifecycle, same stub ProcessorClient
// contract, same "book intent, then call the processor outside the DB
// transaction" ordering. Nothing here moves real money yet — there is no
// processor contracted and no BIN sponsor, exactly like savingsEngine's own
// FundingSource.processorToken, which is null until that exists. The point of
// building this now rather than when the sponsor is live is that the
// SCORING side (trustScoring.ts's activeMissedInstallments /
// missedInstallmentsLast12mo) has somewhere real to read from immediately,
// and wiring a real purchase flow later only means: call createPlan() from
// the checkout screen, and point a real cron at chargeDueInstallments().
//
// "Restrict tightly on a missed payment" is enforced in exactly one place —
// onInstallmentTransferEvent's 'returned' branch — the moment a bounced debit
// exhausts its single in-grace retry, not on the user's next Spending Power
// check. That is the behavior CLAUDE.md's Spending Power section promises and
// the old stub only asserted in a comment.
// =============================================================================

import { prisma } from '@ezer/db';
import { createHash } from 'crypto';
import { assessAccess } from './trustScoring';
import { addBusinessDays } from './savingsEngine';
import type { ProcessorClient, TransferEventResult } from './savingsEngine';

const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLMENTS = 4;
/** Standard BNPL cadence: first payment at checkout, then every two weeks. */
const SPACING_DAYS = 14;
/**
 * BUSINESS days a returned debit gets to resolve — via the single retry in
 * onInstallmentTransferEvent or the user paying another way — before it
 * counts as a hard miss for scoring. Business days, not calendar days,
 * because ACH itself settles in business days (savingsEngine's
 * addBusinessDays(today(), 4) return window) — an on-time payer whose debit
 * spans a weekend must not be defaulted by the clock.
 */
const GRACE_DAYS = 4;

/** The instant an installment's grace window closes. */
function graceDeadline(dueDate: Date): Date {
  return addBusinessDays(dueDate, GRACE_DAYS);
}

function transferKey(installmentId: string, attempt: number): string {
  return createHash('sha256').update(`inst:${installmentId}:${attempt}`).digest('hex');
}

// -----------------------------------------------------------------------------
// Plan creation — the seam a real "split this purchase" checkout calls.
// -----------------------------------------------------------------------------

export async function createPlan(userId: string, totalCents: number): Promise<{ planId: string }> {
  // Integer cents, and at least one cent per leg.
  if (!Number.isInteger(totalCents) || totalCents < INSTALLMENTS) throw new Error('INVALID_AMOUNT');

  // Underwrite HERE, not just at Spending Power display time: the limit the
  // user was shown is meaningless if plan creation never checks it. Suspended
  // users (uncured miss) and zero-limit users cannot open a plan at all, and
  // the new plan plus everything still owed on ACTIVE plans must fit inside
  // the limit.
  const access = await assessAccess(userId);
  if (access.status === 'suspended' || access.limitCents <= 0) throw new Error('ACCESS_SUSPENDED');
  if (totalCents > access.limitCents) throw new Error('OVER_LIMIT');

  // ponytail: check-then-create without a lock — two simultaneous createPlan
  // calls can jointly exceed the ceiling; serialize on a user row lock (as
  // savingsEngine.lockGoalAccount does) if checkout ever goes concurrent.
  const outstanding = await prisma.installment.aggregate({
    where: { userId, status: { notIn: ['PAID', 'CURED'] }, plan: { status: 'ACTIVE' } },
    _sum: { amountCents: true },
  });
  if (totalCents > access.limitCents - (outstanding._sum.amountCents ?? 0)) {
    throw new Error('OVER_LIMIT');
  }

  const each = Math.floor(totalCents / INSTALLMENTS);
  const now = Date.now();

  const plan = await prisma.installmentPlan.create({
    data: {
      userId,
      totalCents,
      installments: {
        create: Array.from({ length: INSTALLMENTS }, (_, i) => ({
          userId,
          n: i + 1,
          // Rounding remainder goes on the last installment rather than
          // silently dropped cents that would make the four legs not sum to
          // the purchase total.
          amountCents: i === INSTALLMENTS - 1 ? totalCents - each * (INSTALLMENTS - 1) : each,
          dueDate: new Date(now + i * SPACING_DAYS * DAY_MS),
        })),
      },
    },
  });

  return { planId: plan.id };
}

// -----------------------------------------------------------------------------
// Funding source — prefers a bank the user linked specifically for Pay in 4.
// -----------------------------------------------------------------------------

async function getRepaymentSource(userId: string) {
  return (
    (await prisma.fundingSource.findFirst({ where: { userId, purpose: 'pay_in_4', status: 'ACTIVE' } })) ??
    (await prisma.fundingSource.findFirst({ where: { userId, isPrimary: true, status: 'ACTIVE' } })) ??
    (await prisma.fundingSource.findFirst({ where: { userId, status: 'ACTIVE' } }))
  );
}

// -----------------------------------------------------------------------------
// Charging — the seam a real cron calls once a BIN sponsor/processor exists.
// -----------------------------------------------------------------------------

async function originate(
  installment: { id: string; userId: string; amountCents: number },
  processor: ProcessorClient,
  attempt: number
): Promise<void> {
  const src = await getRepaymentSource(installment.userId);
  const key = transferKey(installment.id, attempt);

  // Book intent first, exactly like savingsEngine.execute — a crash after
  // this commits leaves a PENDING transfer a reconciler can retry under the
  // same idempotency key; calling the processor inside the transaction risks
  // the opposite failure, where the debit lands but the DB rolls back.
  const transfer = await prisma.transfer.create({
    data: {
      userId: installment.userId,
      installmentId: installment.id,
      direction: 'DEBIT',
      amountCents: installment.amountCents,
      status: 'PENDING',
      idempotencyKey: key,
    },
  });

  try {
    const res = await processor.originateDebit({
      processorToken: src?.processorToken ?? null,
      amountCents: installment.amountCents,
      idempotencyKey: key,
    });
    await prisma.transfer.update({
      where: { id: transfer.id },
      data: { status: 'SUBMITTED', externalId: res.externalId },
    });
  } catch {
    // Left PENDING — see savingsEngine.execute's identical comment. A failed
    // origination call is not a returned debit and must not mark the
    // installment MISSED; only a processor-reported return does that.
  }
}

/** Page size for the cross-user charge/sweep loops. */
const SWEEP_PAGE = 500;

/**
 * Charge every installment that is due and hasn't been charged yet. Safe to
 * call repeatedly — each installment is CLAIMED out of PENDING (a CAS to
 * SUBMITTED) before its Transfer is created, so a retried or concurrent run
 * skips anything already claimed instead of re-selecting it and colliding on
 * the Transfer idempotencyKey, which used to kill the whole sweep.
 *
 * Cross-user by design, the same way a real BNPL charge run is: there is no
 * per-user trigger for "is my payment due today," this runs for everyone.
 * There is no cron in this codebase yet (see CLAUDE.md — migrations and
 * sweeps are both manually triggered today), so this is exposed as an
 * internal, secret-gated route for an external scheduler to call; see
 * routes/installments.ts.
 */
export async function chargeDueInstallments(
  processor: ProcessorClient,
  now: Date = new Date()
): Promise<{ charged: number }> {
  let charged = 0;

  // Paged so one request never holds an unbounded result set. No cursor
  // needed: claimed rows leave PENDING, so re-querying page one advances.
  for (;;) {
    const due = await prisma.installment.findMany({
      where: { status: 'PENDING', dueDate: { lte: now } },
      select: { id: true, userId: true, amountCents: true },
      orderBy: { dueDate: 'asc' },
      take: SWEEP_PAGE,
    });
    if (due.length === 0) break;

    for (const installment of due) {
      // Claim FIRST. count 0 means another run (or a concurrent request)
      // already claimed it — skip, never a second Transfer.
      const claimed = await prisma.installment.updateMany({
        where: { id: installment.id, status: 'PENDING' },
        data: { status: 'SUBMITTED' },
      });
      if (claimed.count === 0) continue;

      await originate(installment, processor, 1);
      charged++;
    }

    if (due.length < SWEEP_PAGE) break;
  }

  return { charged };
}

/**
 * Sweep installments that blew past their grace window with NO in-flight
 * Transfer into a hard MISS. A processor's 'returned' webhook event already
 * does this immediately for a debit we KNOW bounced (see
 * onInstallmentTransferEvent below); this is the fallback for an installment
 * that was never charged, or whose debit died before origination.
 *
 * Two guards keep on-time payers out of here:
 *   - grace is measured in BUSINESS days (graceDeadline), because ACH settles
 *     in business days — a debit spanning a weekend is not late;
 *   - an installment with a Transfer still PENDING/SUBMITTED is skipped: the
 *     money may be mid-flight, and only a processor-reported return (or the
 *     absence of any attempt) may default someone.
 *
 * ponytail: a Transfer stuck SUBMITTED forever now blocks the miss
 * indefinitely; a reconciler that expires transfers past the processor's own
 * window is the upgrade path once a real processor exists.
 */
export async function sweepOverdueInstallments(now: Date = new Date()): Promise<{ missed: number }> {
  let missed = 0;
  const reassessed = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const batch: { id: string; userId: string; dueDate: Date }[] =
      await prisma.installment.findMany({
        where: {
          status: { in: ['PENDING', 'SUBMITTED'] },
          // Calendar-day prefilter: the business-day deadline is always >=
          // dueDate + GRACE_DAYS calendar days, so this is a superset. The
          // exact business-day check happens below, per row.
          dueDate: { lte: new Date(now.getTime() - GRACE_DAYS * DAY_MS) },
          transfers: { none: { status: { in: ['PENDING', 'SUBMITTED'] } } },
        },
        select: { id: true, userId: true, dueDate: true },
        orderBy: { id: 'asc' },
        take: SWEEP_PAGE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    if (batch.length === 0) break;

    for (const installment of batch) {
      if (graceDeadline(installment.dueDate) > now) continue; // still inside business-day grace
      await markMissed(installment.id, installment.userId, reassessed);
      missed++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < SWEEP_PAGE) break;
  }

  return { missed };
}

// -----------------------------------------------------------------------------
// Missed / cured — the restrict-tightly half.
// -----------------------------------------------------------------------------

/**
 * `reassessed` dedupes the assessAccess call (live Plaid balance reads) to
 * once per user per sweep run — ten missed installments on one user is one
 * downgrade, not ten Plaid round-trips. Callers outside the sweep omit it.
 */
async function markMissed(
  installmentId: string,
  userId: string,
  reassessed?: Set<string>
): Promise<void> {
  const installment = await prisma.installment.findUnique({
    where: { id: installmentId },
    select: { planId: true },
  });
  if (!installment) return;

  // CAS, not read-then-write: only the caller that wins the flip to MISSED
  // defaults the plan and re-scores — and a PAID/CURED installment can never
  // be clobbered back to MISSED by a late sweep.
  const flipped = await prisma.$transaction(async tx => {
    const r = await tx.installment.updateMany({
      where: { id: installmentId, status: { in: ['PENDING', 'SUBMITTED'] } },
      data: { status: 'MISSED', missedAt: new Date() },
    });
    if (r.count === 1) {
      await tx.installmentPlan.update({
        where: { id: installment.planId },
        // Sticky: a later installment on this plan settling does not undo that
        // this plan had a miss — see InstallmentPlanStatus's own comment.
        data: { status: 'DEFAULTED' },
      });
    }
    return r.count === 1;
  });
  if (!flipped) return; // already handled, avoid double-counting

  if (reassessed?.has(userId)) return;
  reassessed?.add(userId);

  // Re-score and record the downgrade IMMEDIATELY, not on the user's next
  // Spending Power check. This is the one automatic write to CardAccessList
  // that does not originate from a user tapping anything — it is the model
  // "restricting tightly" on its own, which is the entire point.
  const outcome = await assessAccess(userId);
  await prisma.cardAccessList.create({
    data: {
      userId,
      designId: null,
      mode: 'plaid',
      status: outcome.status,
      limitCents: outcome.limitCents,
      trustScore: outcome.trustScore,
    },
  });
}

async function markCured(installmentId: string): Promise<void> {
  const installment = await prisma.installment.findUnique({ where: { id: installmentId } });
  if (!installment) return;

  await prisma.installment.update({
    where: { id: installmentId },
    data: { status: installment.status === 'MISSED' ? 'CURED' : 'PAID', paidAt: new Date() },
  });

  // Last leg settled → the plan is done. Guarded on ACTIVE so a DEFAULTED
  // plan stays DEFAULTED (sticky — see InstallmentPlanStatus's comment) even
  // once its missed leg is cured.
  // ponytail: no cancel/refund flow — COMPLETE is the only terminal state a
  // plan can reach besides DEFAULTED; add a CANCELED status + refund path
  // when real purchases (and therefore real refunds) exist.
  const open = await prisma.installment.count({
    where: { planId: installment.planId, status: { notIn: ['PAID', 'CURED'] } },
  });
  if (open === 0) {
    await prisma.installmentPlan.updateMany({
      where: { id: installment.planId, status: 'ACTIVE' },
      data: { status: 'COMPLETE' },
    });
  }

  // Re-score here too: curing a miss lifts the hard suspension — a user
  // should not have to reopen Spending Power to see that reflected. (A cured
  // installment is a PAID one for scoring: it no longer counts toward
  // missedInstallmentsLast12mo — see trustScoring.deriveInstallmentSignals.)
  const outcome = await assessAccess(installment.userId);
  await prisma.cardAccessList.create({
    data: {
      userId: installment.userId,
      designId: null,
      mode: 'plaid',
      status: outcome.status,
      limitCents: outcome.limitCents,
      trustScore: outcome.trustScore,
    },
  });
}

// -----------------------------------------------------------------------------
// Webhook — the ONLY place an installment's outcome becomes real.
// -----------------------------------------------------------------------------

export interface InstallmentTransferEvent {
  externalId: string;
  type: 'settled' | 'returned';
  returnCode?: string;
}

/**
 * Called from routes/processorWebhook.ts alongside savingsEngine's own
 * onTransferEvent. Guarded on `tr.installmentId` so the two never act on each
 * other's transfers — a savings sweep debit and a Pay in 4 repayment debit
 * share the Transfer table but not its side effects.
 *
 * Returns 'NOT_FOUND' when no transfer carries this externalId, so the route
 * can refuse the event (un-dedupe it and 5xx) instead of silently losing a
 * settlement forever. `processor` is needed for the one in-grace retry of a
 * returned debit.
 */
export async function onInstallmentTransferEvent(
  evt: InstallmentTransferEvent,
  processor: ProcessorClient
): Promise<TransferEventResult> {
  const tr = await prisma.transfer.findUnique({ where: { externalId: evt.externalId } });
  if (!tr) return 'NOT_FOUND';
  if (!tr.installmentId) return 'OK'; // a savings transfer — not this subsystem's
  if (tr.status === 'SETTLED' || tr.status === 'RETURNED') return 'OK'; // at-least-once webhook, already applied

  if (evt.type === 'settled') {
    const claimed = await prisma.transfer.updateMany({
      where: { id: tr.id, status: { notIn: ['SETTLED', 'RETURNED'] } },
      data: { status: 'SETTLED' },
    });
    if (claimed.count === 1) await markCured(tr.installmentId);
    return 'OK';
  }

  // returned — R01 NSF, R02 closed, R08 stop payment…
  const claimed = await prisma.transfer.updateMany({
    where: { id: tr.id, status: { notIn: ['SETTLED', 'RETURNED'] } },
    data: { status: 'RETURNED', returnCode: evt.returnCode ?? null },
  });
  if (claimed.count !== 1) return 'OK';

  // A first bounce inside the grace window gets ONE retry — NSF the day
  // before payday is routine, and defaulting on it is the old hair-trigger
  // this engine was audited for. transferKey(installment, attempt) keeps the
  // re-origination idempotent.
  // ponytail: hard single-retry ceiling, blind to return code and timing;
  // upgrade to a per-code retry schedule (e.g. retry R01 after payday, never
  // retry R02/R08) when a real processor is contracted.
  const installment = await prisma.installment.findUnique({ where: { id: tr.installmentId } });
  if (installment && installment.status === 'SUBMITTED' && graceDeadline(installment.dueDate) > new Date()) {
    const attempts = await prisma.transfer.count({ where: { installmentId: installment.id } });
    if (attempts < 2) {
      await originate(installment, processor, attempts + 1);
      return 'OK';
    }
  }

  await markMissed(tr.installmentId, tr.userId);
  return 'OK';
}

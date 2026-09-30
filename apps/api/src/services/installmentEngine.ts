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
// onInstallmentTransferEvent's 'returned' branch — the instant a debit
// bounces, not on the user's next Spending Power check. That is the behavior
// CLAUDE.md's Spending Power section promises and the old stub only asserted
// in a comment.
// =============================================================================

import { prisma } from '@ezer/db';
import { createHash } from 'crypto';
import { assessAccess } from './trustScoring';
import type { ProcessorClient } from './savingsEngine';

const DAY_MS = 24 * 60 * 60 * 1000;
const INSTALLMENTS = 4;
/** Standard BNPL cadence: first payment at checkout, then every two weeks. */
const SPACING_DAYS = 14;
/**
 * Days a returned debit gets to resolve — via a processor retry or the user
 * paying another way — before it counts as a hard miss for scoring. Matches
 * the ACH return window savingsEngine already uses elsewhere in this app
 * (addBusinessDays(today(), 4)) rather than inventing a second number.
 */
const GRACE_DAYS = 4;

function transferKey(installmentId: string, attempt: number): string {
  return createHash('sha256').update(`inst:${installmentId}:${attempt}`).digest('hex');
}

// -----------------------------------------------------------------------------
// Plan creation — the seam a real "split this purchase" checkout calls.
// -----------------------------------------------------------------------------

export async function createPlan(userId: string, totalCents: number): Promise<{ planId: string }> {
  if (!Number.isFinite(totalCents) || totalCents <= 0) throw new Error('INVALID_AMOUNT');

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

/**
 * Charge every installment that is due and hasn't been charged yet. Safe to
 * call repeatedly — an installment moves out of PENDING the moment a Transfer
 * is created for it, so a retried call only picks up ones still owed.
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
  const due = await prisma.installment.findMany({
    where: { status: 'PENDING', dueDate: { lte: now } },
    select: { id: true, userId: true, amountCents: true },
  });

  for (const installment of due) {
    await originate(installment, processor, 1);
  }

  return { charged: due.length };
}

/**
 * Sweep SUBMITTED installments whose Transfer never resolved within the
 * grace window into a hard MISS. A processor's 'returned' webhook event
 * already does this immediately for a debit we KNOW bounced (see
 * onInstallmentTransferEvent below); this is the fallback for a debit that
 * simply never got a webhook at all — the same asymmetry ACH reconciliation
 * always needs, since "no event" and "silently still pending" look identical
 * without an explicit sweep.
 */
export async function sweepOverdueInstallments(now: Date = new Date()): Promise<{ missed: number }> {
  const overdue = await prisma.installment.findMany({
    where: {
      status: { in: ['PENDING', 'SUBMITTED'] },
      dueDate: { lte: new Date(now.getTime() - GRACE_DAYS * DAY_MS) },
    },
    select: { id: true, userId: true },
  });

  for (const installment of overdue) {
    await markMissed(installment.id, installment.userId);
  }

  return { missed: overdue.length };
}

// -----------------------------------------------------------------------------
// Missed / cured — the restrict-tightly half.
// -----------------------------------------------------------------------------

async function markMissed(installmentId: string, userId: string): Promise<void> {
  const installment = await prisma.installment.findUnique({ where: { id: installmentId } });
  if (!installment || installment.status === 'MISSED') return; // already handled, avoid double-counting

  await prisma.$transaction([
    prisma.installment.update({
      where: { id: installmentId },
      data: { status: 'MISSED', missedAt: new Date() },
    }),
    prisma.installmentPlan.update({
      where: { id: installment.planId },
      // Sticky: a later installment on this plan settling does not undo that
      // this plan had a miss — see InstallmentPlanStatus's own comment.
      data: { status: 'DEFAULTED' },
    }),
  ]);

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

  // Re-score here too: curing a miss lifts the hard suspension (though the
  // score-level penalty in scoreTrust persists for missedInstallmentsLast12mo)
  // — a user should not have to reopen Spending Power to see that reflected.
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
 */
export async function onInstallmentTransferEvent(evt: InstallmentTransferEvent): Promise<void> {
  const tr = await prisma.transfer.findUnique({ where: { externalId: evt.externalId } });
  if (!tr || !tr.installmentId) return;
  if (tr.status === 'SETTLED' || tr.status === 'RETURNED') return; // at-least-once webhook, already applied

  if (evt.type === 'settled') {
    await prisma.transfer.update({ where: { id: tr.id }, data: { status: 'SETTLED' } });
    await markCured(tr.installmentId);
    return;
  }

  // returned — R01 NSF, R02 closed, R08 stop payment…
  await prisma.transfer.update({
    where: { id: tr.id },
    data: { status: 'RETURNED', returnCode: evt.returnCode ?? null },
  });
  await markMissed(tr.installmentId, tr.userId);
}

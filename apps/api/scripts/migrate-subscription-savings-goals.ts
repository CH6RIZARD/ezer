// One-off: fold the old per-subscription "<merchant> savings" goals into the
// user's ONE Subscription savings pool (CLAUDE.md "Subscription saving is ONE
// goal"). Needs migration 20261020000000_subscription_savings_pool applied.
//
//   cd apps/api
//   railway run --service ezer-api npx tsx scripts/migrate-subscription-savings-goals.ts --dry-run
//   railway run --service ezer-api npx tsx scripts/migrate-subscription-savings-goals.ts
//
// Idempotent: a migrated goal is CLOSED and no longer matches; a crash between
// steps leaves a state the next run finishes. Money moves only through the
// engine's internal move (ledger entries), never a balance overwrite. A goal
// with in-flight transfers or money still inside the ACH return window is
// skipped; rerun after it settles.

import { prisma } from '@ezer/db';
import {
  ensurePoolGoal,
  goalBalanceCents,
  moveBetweenGoals,
  withdrawableCents,
} from '../src/services/savingsEngine';

const DRY = process.argv.includes('--dry-run');

async function main() {
  // Smart-saving goals were created as STANDARD + FIXED/MONTHLY, named
  // `${merchantName} savings` (SubscriptionDetail.tsx's old addGoal).
  const candidates = await prisma.savingsGoal.findMany({
    where: {
      kind: 'STANDARD',
      status: { not: 'CLOSED' },
      name: { endsWith: ' savings' },
      rule: { mode: 'FIXED', cadence: 'MONTHLY' },
    },
    include: { rule: true },
  });
  const byUser = new Map<string, typeof candidates>();
  for (const g of candidates) byUser.set(g.userId, [...(byUser.get(g.userId) ?? []), g]);

  for (const [userId, goals] of byUser) {
    const subs = await prisma.subscription.findMany({
      where: { userId },
      include: { merchant: true, priceHistory: { orderBy: { month: 'desc' }, take: 1 } },
      // Live subscriptions win over a canceled one for the same merchant.
      orderBy: { updatedAt: 'desc' },
    });
    const subFor = (goalName: string) =>
      subs
        .filter(s => `${s.merchant.canonicalName} savings` === goalName)
        .sort((a, b) => Number(a.status === 'canceled') - Number(b.status === 'canceled'))[0];

    for (const goal of goals) {
      const sub = subFor(goal.name);
      if (!sub) continue; // a user goal that merely ends in "savings"

      const inFlight = await prisma.transfer.count({
        where: { goalId: goal.id, status: { in: ['PENDING', 'SUBMITTED', 'POSTED'] } },
      });
      const balance = await goalBalanceCents(userId, goal.id);
      const settled = await withdrawableCents(userId, goal.id);
      if (inFlight > 0 || settled !== balance) {
        console.log(`[skip] user=${userId} goal=${goal.id} "${goal.name}": in-flight=${inFlight} balance=${balance} settled=${settled}; rerun after it settles`);
        continue;
      }

      const price = sub.priceHistory[0]?.amountCents ?? null;
      const mode = goal.rule?.fixedAmountCents != null && goal.rule.fixedAmountCents === price ? 'MATCH' : 'HALF';
      const ended = sub.status === 'canceled';
      console.log(`${DRY ? '[dry-run] ' : ''}user=${userId} goal=${goal.id} "${goal.name}" -> pool, sub=${sub.id} mode=${mode}${ended ? ' (ENDED)' : ''}, move ${balance}c`);
      if (DRY) continue;

      const pool = await prisma.$transaction(async tx => {
        const p = await ensurePoolGoal(tx, userId);
        const existing = await tx.subscriptionSavingSource.findUnique({
          where: { goalId_subscriptionId: { goalId: p.id, subscriptionId: sub.id } },
        });
        if (!existing) {
          await tx.subscriptionSavingSource.create({
            data: {
              userId,
              goalId: p.id,
              subscriptionId: sub.id,
              mode,
              status: ended ? 'ENDED' : 'ACTIVE',
              endedAt: ended ? new Date() : null,
            },
          });
        }
        return p;
      });

      if (balance > 0) await moveBetweenGoals(userId, goal.id, pool.id, balance);
      await prisma.savingsGoal.update({ where: { id: goal.id }, data: { status: 'CLOSED' } });
    }
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

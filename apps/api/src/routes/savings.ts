// =============================================================================
// EZER — automated goal savings API
//
// Wraps services/savingsEngine.ts. Everything here requires auth: these
// endpoints read balances and move money, unlike /cards which is deliberately
// open at the top of the funnel.
//
// Amounts are ALWAYS integer cents on the wire. No floats, no dollar strings.
// =============================================================================

import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import {
  runSweep,
  safeToSave,
  gate,
  withdraw,
  withdrawableCents,
  goalBalanceCents,
  loadGoalsWithFunding,
  getSettings,
  weekKey,
  deposit,
  moveBetweenGoals,
  type ProcessorClient,
} from '../services/savingsEngine';

/**
 * Stub processor.
 *
 * There is no ACH provider contracted yet (Dwolla / Increase / Column would
 * each slot in here). It records what WOULD have been originated and returns a
 * deterministic external id derived from the idempotency key, so the whole
 * pipeline — ledger, settlement webhook, withdrawal holds — is exercisable
 * end to end without moving real money.
 *
 * It intentionally does NOT auto-settle. Settlement only happens when a
 * webhook arrives, exactly as it will in production; auto-settling here would
 * hide the return-window logic that is the point of the design.
 */
const stubProcessor: ProcessorClient = {
  async originateDebit({ idempotencyKey }) {
    return { externalId: `stub_debit_${idempotencyKey.slice(0, 24)}` };
  },
  async originateCredit({ idempotencyKey }) {
    return { externalId: `stub_credit_${idempotencyKey.slice(0, 24)}` };
  },
};

function userIdOf(request: unknown): string {
  return (request as { userId: string }).userId;
}

export async function savingsRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // ---------------------------------------------------------------------------
  // Goals
  // ---------------------------------------------------------------------------

  /** All goals with DERIVED balances and what is withdrawable right now. */
  server.get('/goals', async request => {
    const userId = userIdOf(request);

    const goals = await prisma.savingsGoal.findMany({
      where: { userId, status: { in: ['ACTIVE', 'PAUSED', 'COMPLETE'] } },
      include: { rule: true },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const data = await Promise.all(
      goals.map(async g => ({
        id: g.id,
        name: g.name,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        priority: g.priority,
        status: g.status,
        fundedCents: await goalBalanceCents(userId, g.id),
        withdrawableCents: await withdrawableCents(userId, g.id),
        rule: g.rule
          ? {
              mode: g.rule.mode,
              cadence: g.rule.cadence,
              fixedAmountCents: g.rule.fixedAmountCents,
              maxPeriodCents: g.rule.maxPeriodCents,
              aggressiveness: Number(g.rule.aggressiveness),
            }
          : null,
      }))
    );

    return { success: true, data };
  });

  server.post('/goals', async (request, reply) => {
    const userId = userIdOf(request);
    const body = request.body as {
      name?: string;
      targetCents?: number;
      targetDate?: string | null;
      priority?: number;
      mode?: 'FIXED' | 'ADAPTIVE';
      cadence?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'PAYDAY';
      fixedAmountCents?: number | null;
      maxPeriodCents?: number | null;
      aggressiveness?: number;
    };

    if (!body?.name?.trim()) {
      return reply.status(400).send({ error: 'name is required' });
    }
    if (!Number.isInteger(body.targetCents) || (body.targetCents ?? 0) <= 0) {
      return reply.status(400).send({ error: 'targetCents must be a positive integer' });
    }
    // A FIXED goal with no deadline and no amount can never compute a rate.
    if (body.mode === 'FIXED' && !body.targetDate && !body.fixedAmountCents) {
      return reply
        .status(400)
        .send({ error: 'FIXED mode needs either a targetDate or a fixedAmountCents' });
    }

    const goal = await prisma.savingsGoal.create({
      data: {
        userId,
        name: body.name.trim(),
        targetCents: body.targetCents!,
        targetDate: body.targetDate ? new Date(body.targetDate) : null,
        priority: body.priority ?? 100,
        rule: {
          create: {
            mode: body.mode ?? 'ADAPTIVE',
            cadence: body.cadence ?? 'WEEKLY',
            fixedAmountCents: body.fixedAmountCents ?? null,
            maxPeriodCents: body.maxPeriodCents ?? null,
            // Clamped so a bad client value cannot make the engine aggressive.
            aggressiveness: Math.min(0.75, Math.max(0.25, body.aggressiveness ?? 0.5)),
          },
        },
      },
      include: { rule: true },
    });

    return { success: true, data: { id: goal.id } };
  });

  server.patch('/goals/:id', async (request, reply) => {
    const userId = userIdOf(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      targetCents?: number;
      targetDate?: string | null;
      priority?: number;
      status?: 'ACTIVE' | 'PAUSED' | 'CLOSED';
    };

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });

    const updated = await prisma.savingsGoal.update({
      where: { id },
      data: {
        name: body.name?.trim() ?? undefined,
        targetCents: Number.isInteger(body.targetCents) ? body.targetCents : undefined,
        targetDate:
          body.targetDate === undefined ? undefined : body.targetDate ? new Date(body.targetDate) : null,
        priority: Number.isInteger(body.priority) ? body.priority : undefined,
        status: body.status ?? undefined,
      },
    });

    return { success: true, data: { id: updated.id } };
  });

  // ---------------------------------------------------------------------------
  // Settings — the safety rails
  // ---------------------------------------------------------------------------

  server.get('/settings', async request => {
    const s = await getSettings(userIdOf(request));
    return { success: true, data: s };
  });

  server.patch('/settings', async (request, reply) => {
    const userId = userIdOf(request);
    const body = request.body as {
      minCheckingCents?: number;
      maxWeeklyCents?: number;
      pausedUntil?: string | null;
    };

    // Floor of $10 stops a user disabling their own overdraft protection.
    if (body.minCheckingCents !== undefined && body.minCheckingCents < 1000) {
      return reply.status(400).send({ error: 'minCheckingCents must be at least 1000 ($10)' });
    }
    if (body.maxWeeklyCents !== undefined && body.maxWeeklyCents <= 0) {
      return reply.status(400).send({ error: 'maxWeeklyCents must be positive' });
    }

    await getSettings(userId); // ensure the row exists
    const updated = await prisma.savingsSettings.update({
      where: { userId },
      data: {
        minCheckingCents: body.minCheckingCents ?? undefined,
        maxWeeklyCents: body.maxWeeklyCents ?? undefined,
        pausedUntil:
          body.pausedUntil === undefined ? undefined : body.pausedUntil ? new Date(body.pausedUntil) : null,
      },
    });

    return { success: true, data: updated };
  });

  // ---------------------------------------------------------------------------
  // Sweep
  // ---------------------------------------------------------------------------

  /**
   * Dry run: what WOULD we sweep right now, and why. Read-only — safe to call
   * from the app to show "we'd move $X this week".
   */
  server.get('/sweep/preview', async request => {
    const userId = userIdOf(request);
    const periodKey = weekKey();

    const g = await gate(userId, periodKey);
    if (!g.ok) {
      return { success: true, data: { periodKey, wouldSweep: false, reason: g.reason } };
    }

    const safe = await safeToSave(userId);
    const goals = await loadGoalsWithFunding(userId);

    return {
      success: true,
      data: {
        periodKey,
        wouldSweep: safe.cents > 0,
        reason: safe.reason,
        amountCents: safe.cents,
        projectedLowCents: safe.projectedLow ?? null,
        activeGoals: goals.length,
      },
    };
  });

  /**
   * Execute the sweep. Idempotent on (userId, periodKey) — a second call in the
   * same period returns ALREADY_RUN rather than double-charging.
   */
  server.post('/sweep/run', async request => {
    const userId = userIdOf(request);
    const body = (request.body ?? {}) as { periodKey?: string };
    const outcome = await runSweep(userId, stubProcessor, body.periodKey ?? weekKey());
    return { success: true, data: outcome };
  });

  // ---------------------------------------------------------------------------
  // Withdrawals
  // ---------------------------------------------------------------------------

  server.get('/goals/:id/withdrawable', async (request, reply) => {
    const userId = userIdOf(request);
    const { id } = request.params as { id: string };

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });

    return {
      success: true,
      data: {
        goalId: id,
        balanceCents: await goalBalanceCents(userId, id),
        withdrawableCents: await withdrawableCents(userId, id),
      },
    };
  });

  server.post('/goals/:id/withdraw', async (request, reply) => {
    const userId = userIdOf(request);
    const { id } = request.params as { id: string };
    const body = request.body as { amountCents?: number; speed?: 'STANDARD' | 'INSTANT' };

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });

    if (!Number.isInteger(body?.amountCents) || (body.amountCents ?? 0) <= 0) {
      return reply.status(400).send({ error: 'amountCents must be a positive integer' });
    }

    try {
      const res = await withdraw(
        userId,
        id,
        body.amountCents!,
        body.speed ?? 'STANDARD',
        stubProcessor
      );
      return { success: true, data: res };
    } catch (err) {
      const msg = (err as Error).message;
      // The interesting failure: they asked for money still inside the ACH
      // return window. Report the real number so the UI can explain it.
      if (msg === 'INSUFFICIENT_WITHDRAWABLE') {
        return reply.status(409).send({
          error: msg,
          withdrawableCents: await withdrawableCents(userId, id),
        });
      }
      return reply.status(400).send({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // Manual deposit — the user pushing money in themselves
  //
  // The sweep is the product; this is the escape hatch for "I just got paid,
  // put $200 in the holiday fund now". It deliberately reuses `deposit()` in
  // the engine rather than writing its own ledger rows, so a manual deposit
  // gets the identical ACH return window as an automatic one. Money that
  // arrives by a different code path with different settlement rules is how a
  // ledger stops balancing.
  // ---------------------------------------------------------------------------

  server.post('/goals/:id/deposit', async (request, reply) => {
    const userId = userIdOf(request);
    const { id } = request.params as { id: string };
    const body = request.body as { amountCents?: number };

    const goal = await prisma.savingsGoal.findFirst({ where: { id, userId } });
    if (!goal) return reply.status(404).send({ error: 'Goal not found' });
    if (goal.status === 'CLOSED') {
      return reply.status(409).send({ error: 'GOAL_CLOSED' });
    }

    if (!Number.isInteger(body?.amountCents) || (body.amountCents ?? 0) <= 0) {
      return reply.status(400).send({ error: 'amountCents must be a positive integer' });
    }

    try {
      const res = await deposit(userId, id, body.amountCents!, stubProcessor);
      return { success: true, data: res };
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // ---------------------------------------------------------------------------
  // Move between goals — purely internal, no money leaves the institution
  // ---------------------------------------------------------------------------

  server.post('/transfer', async (request, reply) => {
    const userId = userIdOf(request);
    const body = request.body as { fromGoalId?: string; toGoalId?: string; amountCents?: number };

    if (!body?.fromGoalId || !body?.toGoalId) {
      return reply.status(400).send({ error: 'fromGoalId and toGoalId are required' });
    }
    if (body.fromGoalId === body.toGoalId) {
      return reply.status(400).send({ error: 'SAME_GOAL' });
    }
    if (!Number.isInteger(body.amountCents) || (body.amountCents ?? 0) <= 0) {
      return reply.status(400).send({ error: 'amountCents must be a positive integer' });
    }

    const [from, to] = await Promise.all([
      prisma.savingsGoal.findFirst({ where: { id: body.fromGoalId, userId } }),
      prisma.savingsGoal.findFirst({ where: { id: body.toGoalId, userId } }),
    ]);
    if (!from || !to) return reply.status(404).send({ error: 'Goal not found' });
    if (to.status === 'CLOSED') return reply.status(409).send({ error: 'DESTINATION_CLOSED' });

    try {
      const res = await moveBetweenGoals(userId, body.fromGoalId, body.toGoalId, body.amountCents!);
      return { success: true, data: res };
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === 'INSUFFICIENT_WITHDRAWABLE') {
        // Same rule as a withdrawal: funds inside the ACH return window cannot
        // be moved either. Otherwise hopping a goal would launder the window
        // and let unsettled money be withdrawn early from the destination.
        return reply.status(409).send({
          error: msg,
          withdrawableCents: await withdrawableCents(userId, body.fromGoalId),
        });
      }
      return reply.status(400).send({ error: msg });
    }
  });

  // ---------------------------------------------------------------------------
  // Transfers + processor webhook
  // ---------------------------------------------------------------------------

  server.get('/transfers', async request => {
    const userId = userIdOf(request);
    const rows = await prisma.transfer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { success: true, data: rows };
  });

  // NOTE: the processor webhook is NOT here.
  //
  // It lives in routes/processorWebhook.ts as its own Fastify plugin, because
  // this plugin's `preHandler` requires a user JWT and processors do not send
  // one. Registering it there puts it in a separate encapsulation context, so
  // it structurally cannot inherit the auth hook — rather than relying on a
  // path exception inside the hook, which would regress the first time someone
  // refactors it. Its authentication is the HMAC signature.
}

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
  accrualCents,
  ensurePoolGoal,
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

/**
 * Engine errors a client caused and may see. Anything else (Prisma errors,
 * processor failures…) rethrows to a generic 500 — raw internals must not
 * echo to clients.
 */
const CLIENT_ERRORS = new Set(['INVALID_AMOUNT', 'SAME_GOAL']);

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
        // SUBSCRIPTION_POOL renders separately (GET /subscription-pool).
        kind: g.kind,
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
    // The pool is named by the app and has no target; only status applies.
    if (
      goal.kind === 'SUBSCRIPTION_POOL' &&
      (body.name !== undefined || body.targetCents !== undefined || body.targetDate !== undefined)
    ) {
      return reply.status(400).send({ error: 'Subscription savings has no name or target to edit' });
    }

    // Validate before it reaches Prisma — an unknown enum value 500s there.
    if (body.status !== undefined && !['ACTIVE', 'PAUSED', 'CLOSED'].includes(body.status)) {
      return reply.status(400).send({ error: 'status must be ACTIVE, PAUSED or CLOSED' });
    }

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
    // periodKey is ALWAYS derived server-side. Accepting the client's value
    // would let one user mint arbitrary keys and run the sweep (and its
    // debits) as many times per week as they liked.
    const outcome = await runSweep(userId, stubProcessor, weekKey());
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
    if (body.speed !== undefined && !['STANDARD', 'INSTANT'].includes(body.speed)) {
      return reply.status(400).send({ error: 'speed must be STANDARD or INSTANT' });
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
      if (CLIENT_ERRORS.has(msg)) return reply.status(400).send({ error: msg });
      throw err;
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
      const msg = (err as Error).message;
      if (CLIENT_ERRORS.has(msg)) return reply.status(400).send({ error: msg });
      throw err;
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
      if (CLIENT_ERRORS.has(msg)) return reply.status(400).send({ error: msg });
      throw err;
    }
  });

  // ---------------------------------------------------------------------------
  // Subscription savings pool: ONE goal, many subscriptions feeding it
  // ---------------------------------------------------------------------------

  server.get('/subscription-pool', async request => {
    const userId = userIdOf(request);
    const goal = await prisma.savingsGoal.findFirst({ where: { userId, kind: 'SUBSCRIPTION_POOL' } });
    if (!goal) return { success: true, data: { goal: null, sources: [], recent: [] } };

    const sources = await prisma.subscriptionSavingSource.findMany({
      where: { goalId: goal.id },
      orderBy: { startedAt: 'asc' },
      include: {
        subscription: {
          include: { merchant: true, priceHistory: { orderBy: { month: 'desc' }, take: 1 } },
        },
        accruals: { orderBy: { createdAt: 'desc' } },
      },
    });

    const transferIds = [
      ...new Set(sources.flatMap(s => s.accruals.map(a => a.sweptTransferId)).filter((x): x is string => !!x)),
    ];
    const statusOf = new Map(
      (
        await prisma.transfer.findMany({ where: { id: { in: transferIds } }, select: { id: true, status: true } })
      ).map(t => [t.id, t.status])
    );
    // queued = accrued, no sweep has carried it yet (or its transfer came back).
    const stateOf = (transferId: string | null): 'queued' | 'pending' | 'saved' => {
      const st = transferId ? statusOf.get(transferId) : undefined;
      if (st === 'SETTLED' || st === 'POSTED') return 'saved';
      if (st === 'PENDING' || st === 'SUBMITTED') return 'pending';
      return 'queued';
    };
    const sum = (rows: { amountCents: number; sweptTransferId: string | null }[], want: string) =>
      rows.filter(a => stateOf(a.sweptTransferId) === want).reduce((n, a) => n + a.amountCents, 0);

    return {
      success: true,
      data: {
        goal: {
          id: goal.id,
          name: goal.name,
          status: goal.status,
          createdAt: goal.createdAt,
          fundedCents: await goalBalanceCents(userId, goal.id),
          withdrawableCents: await withdrawableCents(userId, goal.id),
        },
        sources: sources.map(s => ({
          subscriptionId: s.subscriptionId,
          merchantName: s.subscription.merchant.canonicalName,
          logo: s.subscription.merchant.logo,
          mode: s.mode,
          status: s.status,
          // From the latest price; the real accrual follows each actual charge.
          perChargeCents: accrualCents(s.mode, s.subscription.priceHistory[0]?.amountCents ?? 0),
          renewalDate: s.subscription.renewalDate,
          savedCents: sum(s.accruals, 'saved'),
          pendingCents: sum(s.accruals, 'pending'),
          queuedCents: sum(s.accruals, 'queued'),
          charges: s.accruals.length,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
        })),
        recent: sources
          .flatMap(s =>
            s.accruals.map(a => ({
              id: a.id,
              subscriptionId: s.subscriptionId,
              merchantName: s.subscription.merchant.canonicalName,
              amountCents: a.amountCents,
              state: stateOf(a.sweptTransferId),
              createdAt: a.createdAt,
            }))
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, 20),
      },
    };
  });

  /** Enable / switch mode / restart. Creates the pool on first use. Idempotent. */
  server.put('/subscription-pool/sources/:subscriptionId', async (request, reply) => {
    const userId = userIdOf(request);
    const { subscriptionId } = request.params as { subscriptionId: string };
    const mode = (request.body as { mode?: string } | undefined)?.mode;
    if (mode !== 'HALF' && mode !== 'MATCH') {
      return reply.status(400).send({ error: 'mode must be HALF or MATCH' });
    }

    const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
    if (!sub) return reply.status(404).send({ error: 'Subscription not found' });
    if (sub.status === 'canceled') return reply.status(409).send({ error: 'Subscription is canceled' });

    const enable = () =>
      prisma.$transaction(async tx => {
        const goal = await ensurePoolGoal(tx, userId);
        const existing = await tx.subscriptionSavingSource.findUnique({
          where: { goalId_subscriptionId: { goalId: goal.id, subscriptionId } },
        });
        if (!existing) {
          return tx.subscriptionSavingSource.create({ data: { userId, goalId: goal.id, subscriptionId, mode } });
        }
        return tx.subscriptionSavingSource.update({
          where: { id: existing.id },
          data: {
            mode,
            status: 'ACTIVE',
            endedAt: null,
            // Charges from while it was off never accrue.
            ...(existing.status !== 'ACTIVE' ? { activeSince: new Date() } : {}),
          },
        });
      });

    let source;
    try {
      source = await enable();
    } catch (err) {
      // Two first enables racing: one loses on the one-pool-per-user (or the
      // goal+subscription) unique index. The retry finds the winner's rows.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      source = await enable();
    }
    return { success: true, data: { subscriptionId, mode: source.mode, status: source.status } };
  });

  server.patch('/subscription-pool/sources/:subscriptionId', async (request, reply) => {
    const userId = userIdOf(request);
    const { subscriptionId } = request.params as { subscriptionId: string };
    const status = (request.body as { status?: string } | undefined)?.status;
    if (status !== 'PAUSED' && status !== 'ACTIVE') {
      return reply.status(400).send({ error: 'status must be PAUSED or ACTIVE' });
    }
    const source = await prisma.subscriptionSavingSource.findFirst({ where: { userId, subscriptionId } });
    if (!source) return reply.status(404).send({ error: 'Not saving from this subscription' });
    if (source.status === 'ENDED') {
      return reply.status(409).send({ error: 'Stopped; restart with PUT' });
    }
    if (source.status !== status) {
      await prisma.subscriptionSavingSource.update({
        where: { id: source.id },
        data: { status, ...(status === 'ACTIVE' ? { activeSince: new Date() } : {}) },
      });
    }
    return { success: true, data: { subscriptionId, status } };
  });

  /** Stop saving from it. Keeps every accrual and every dollar already in the goal. */
  server.delete('/subscription-pool/sources/:subscriptionId', async (request, reply) => {
    const userId = userIdOf(request);
    const { subscriptionId } = request.params as { subscriptionId: string };
    const source = await prisma.subscriptionSavingSource.findFirst({ where: { userId, subscriptionId } });
    if (!source) return reply.status(404).send({ error: 'Not saving from this subscription' });
    if (source.status !== 'ENDED') {
      await prisma.subscriptionSavingSource.update({
        where: { id: source.id },
        data: { status: 'ENDED', endedAt: new Date() },
      });
    }
    return { success: true, data: { subscriptionId, status: 'ENDED' } };
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

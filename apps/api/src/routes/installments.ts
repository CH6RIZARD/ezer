// =============================================================================
// EZER API — Pay in 4 installment plans
//
// Two very different trust levels on one file, like processorWebhook.ts:
//
//   POST /cards/installments/plans — a real user, JWT-authenticated, creating
//     a plan for THEIR OWN purchase. Not reachable from any screen yet (Pay in
//     4 checkout does not exist — see payin4.tsx's own "not yet available"),
//     but the moment it does, this is the one call it needs to make.
//
//   POST /cards/installments/sweep — no user at all. An external scheduler
//     (there is no cron inside this process — see CLAUDE.md) calling in to
//     charge what's due and mark what's overdue as missed. Secret-gated the
//     same way processorWebhook.ts's signature gates a processor, because
//     this route originates real debits once a processor exists and must not
//     be callable by anyone holding a user JWT, let alone no auth at all.
// =============================================================================

import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { createPlan, chargeDueInstallments, sweepOverdueInstallments } from '../services/installmentEngine';
import type { ProcessorClient } from '../services/savingsEngine';

/**
 * Same stub as routes/savings.ts's stubProcessor, and for the same reason:
 * no ACH provider is contracted yet. It exercises the full PENDING →
 * SUBMITTED → (webhook) → SETTLED/RETURNED pipeline without moving real
 * money — settlement only ever happens via a webhook call, never here.
 */
const stubProcessor: ProcessorClient = {
  async originateDebit({ idempotencyKey }) {
    return { externalId: `stub_debit_${idempotencyKey.slice(0, 24)}` };
  },
  async originateCredit({ idempotencyKey }) {
    return { externalId: `stub_credit_${idempotencyKey.slice(0, 24)}` };
  },
};

const SWEEP_SECRET = process.env.INSTALLMENT_SWEEP_SECRET || '';

export async function installmentRoutes(server: FastifyInstance) {
  // POST /cards/installments/plans
  server.post<{ Body: { totalCents?: number } }>(
    '/plans',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const userId = (request as unknown as { userId: string }).userId;
      const { totalCents } = request.body || {};

      // Integer cents only — no rounding a float the client chose.
      if (typeof totalCents !== 'number' || !Number.isInteger(totalCents) || totalCents < 4) {
        return reply.status(400).send({ success: false, error: 'totalCents must be an integer of at least 4' });
      }

      try {
        const { planId } = await createPlan(userId, totalCents);
        return { success: true, data: { planId } };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg === 'ACCESS_SUSPENDED' || msg === 'OVER_LIMIT') {
          return reply.status(403).send({ success: false, error: msg });
        }
        if (msg === 'INVALID_AMOUNT') {
          return reply.status(400).send({ success: false, error: msg });
        }
        throw err; // unknown — 500 without echoing internals
      }
    }
  );

  // POST /cards/installments/sweep — charge what's due, miss what's overdue.
  server.post('/sweep', async (request, reply) => {
    if (!SWEEP_SECRET) {
      // Fail CLOSED, same reasoning as PROCESSOR_WEBHOOK_SECRET: an unset
      // secret must never mean "anyone can trigger debits."
      request.log.error('INSTALLMENT_SWEEP_SECRET is not configured');
      return reply.status(503).send({ success: false, error: 'SWEEP_NOT_CONFIGURED' });
    }

    // Constant-time compare, same length-guard pattern as processorWebhook.ts
    // — `!==` leaks how many leading bytes matched via timing.
    const provided = Buffer.from(String(request.headers['x-sweep-secret'] ?? ''));
    const expected = Buffer.from(SWEEP_SECRET);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return reply.status(401).send({ success: false, error: 'UNAUTHORIZED' });
    }

    // Sweep BEFORE charging: a stale, past-grace installment must resolve to
    // MISSED first, not be charged and then missed in the same request.
    const missed = await sweepOverdueInstallments();
    const charged = await chargeDueInstallments(stubProcessor);

    return { success: true, data: { ...charged, ...missed } };
  });
}

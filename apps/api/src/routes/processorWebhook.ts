// =============================================================================
// EZER — ACH processor webhook
//
// Registered as its OWN Fastify plugin, deliberately. Fastify plugins are
// encapsulation contexts, so a hook added inside another plugin cannot reach
// this route. That is structural: an auth `preHandler` registered on the
// savings plugin can never accidentally apply here, and nobody can regress it
// by refactoring that hook. The alternative — a path exception inside the auth
// hook — breaks the first time someone tidies it up.
//
// The signature IS the authentication for this route. Processors send no user
// JWT, so requiring one would be the wrong auth, not stronger auth.
//
// RAW BYTES MATTER. HMAC must be computed over exactly what the processor
// signed. Fastify's default JSON parser hands back a parsed object, and
// re-serialising it with JSON.stringify produces different bytes — key order
// and whitespace will not match — so verification fails intermittently, which
// is the worst possible failure mode. This plugin registers a buffer parser
// scoped to itself, verifies against the raw buffer, and only then parses.
// =============================================================================

import { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@ezer/db';
import { onTransferEvent, type ProcessorClient } from '../services/savingsEngine';
import { onInstallmentTransferEvent } from '../services/installmentEngine';

/**
 * Same stub as routes/savings.ts / routes/installments.ts — no ACH provider
 * is contracted yet. Needed here because the installment handler may
 * re-originate a bounced debit (its single in-grace retry).
 */
const stubProcessor: ProcessorClient = {
  async originateDebit({ idempotencyKey }) {
    return { externalId: `stub_debit_${idempotencyKey.slice(0, 24)}` };
  },
  async originateCredit({ idempotencyKey }) {
    return { externalId: `stub_credit_${idempotencyKey.slice(0, 24)}` };
  },
};

/** Reject anything signed outside this window — bounds replay attacks. */
const MAX_SKEW_MS = 5 * 60 * 1000;

const PROVIDER = process.env.PROCESSOR_NAME || 'stub';
const SIGNING_SECRET = process.env.PROCESSOR_WEBHOOK_SECRET || '';

/**
 * Constant-time compare. `===` on a signature leaks how many leading bytes
 * matched via timing, which is enough to forge one byte at a time.
 */
function signatureMatches(expectedHex: string, providedHex: string): boolean {
  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(providedHex, 'hex');
  // timingSafeEqual throws on length mismatch, so check length first — that
  // comparison is not secret.
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function processorWebhookRoutes(server: FastifyInstance) {
  // Scoped to THIS plugin only. Other routes keep the normal JSON parser.
  server.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  );

  server.post('/transfers', async (request, reply) => {
    const ip = request.ip;
    const raw = request.body as Buffer;

    const signature = String(request.headers['x-processor-signature'] ?? '');
    const timestamp = String(request.headers['x-processor-timestamp'] ?? '');

    const reject = (status: number, reason: string) => {
      // Every rejection is logged with the source IP: a burst of bad
      // signatures from one address is the signal you want to see.
      request.log.warn({ ip, reason, provider: PROVIDER }, 'processor webhook rejected');
      return reply.status(status).send({ error: reason });
    };

    if (!SIGNING_SECRET) {
      // Fail CLOSED. An unset secret must never mean "accept everything" on a
      // route that credits money to user balances.
      request.log.error({ ip }, 'PROCESSOR_WEBHOOK_SECRET is not configured');
      return reject(503, 'WEBHOOK_NOT_CONFIGURED');
    }
    if (!signature || !timestamp) return reject(401, 'MISSING_SIGNATURE');

    // Replay window.
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
      return reject(401, 'STALE_TIMESTAMP');
    }

    // Sign timestamp + raw body so a captured signature cannot be replayed
    // against a different payload.
    const expected = createHmac('sha256', SIGNING_SECRET)
      .update(`${timestamp}.`)
      .update(raw)
      .digest('hex');

    if (!signatureMatches(expected, signature)) return reject(401, 'BAD_SIGNATURE');

    // Only now is it safe to parse.
    let payload: { eventId?: string; type?: string; externalId?: string; returnCode?: string };
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return reject(400, 'MALFORMED_JSON');
    }

    if (!payload.eventId || !payload.externalId || !payload.type) {
      return reject(400, 'MISSING_FIELDS');
    }

    // Idempotency: insert first. A unique violation means we have seen this
    // eventId before — but "seen" is only "applied" once processedAt is set.
    // A receipt with processedAt null is a delivery that died mid-handler, so
    // that one re-runs the handlers (they are idempotent: every status flip
    // is a CAS). Only a PROCESSED duplicate gets the early 2xx; returning 2xx
    // on the unprocessed one would dedupe the retry that was going to finish
    // the job.
    try {
      await prisma.processorWebhookEvent.create({
        data: {
          eventId: payload.eventId,
          provider: PROVIDER,
          eventType: payload.type,
          rawBody: raw.toString('utf8'),
        },
      });
    } catch {
      const existing = await prisma.processorWebhookEvent.findUnique({
        where: { eventId: payload.eventId },
      });
      if (!existing) return reject(500, 'RECEIPT_WRITE_FAILED'); // insert failed for a non-duplicate reason
      if (existing.processedAt) {
        request.log.info({ ip, eventId: payload.eventId }, 'duplicate webhook ignored');
        return reply.status(200).send({ success: true, duplicate: true });
      }
      request.log.info({ ip, eventId: payload.eventId }, 'unprocessed duplicate — re-running handlers');
    }

    if (payload.type !== 'settled' && payload.type !== 'returned') {
      // Recorded but not actionable. 2xx so the processor stops retrying an
      // event type we simply do not handle.
      return reply.status(200).send({ success: true, ignored: payload.type });
    }

    // Both are safe to call for every event: each looks the transfer up and
    // no-ops unless it owns that transfer's domain (installmentId vs goalId).
    const savingsResult = await onTransferEvent({
      externalId: payload.externalId,
      type: payload.type,
      returnCode: payload.returnCode,
    });
    const installmentResult = await onInstallmentTransferEvent(
      {
        externalId: payload.externalId,
        type: payload.type,
        returnCode: payload.returnCode,
      },
      stubProcessor
    );

    if (savingsResult === 'NOT_FOUND' && installmentResult === 'NOT_FOUND') {
      // NEITHER engine knows this transfer — most likely the webhook raced
      // origination's own externalId write. A 2xx here would be fatal: the
      // receipt row would dedupe the processor's retry and the settlement
      // would be lost forever. Delete the receipt so the retry is fresh, and
      // 5xx so there IS a retry.
      await prisma.processorWebhookEvent
        .delete({ where: { eventId: payload.eventId } })
        .catch(() => {});
      return reject(500, 'TRANSFER_NOT_FOUND');
    }

    await prisma.processorWebhookEvent.update({
      where: { eventId: payload.eventId },
      data: { processedAt: new Date() },
    });

    // 2xx only after the event is durably recorded AND applied.
    return reply.status(200).send({ success: true });
  });
}

// =============================================================================
// EZER — Highnote collaborative authorization (TEST environment)
//
// Highnote calls this on every Pay in 4 card swipe and waits up to 2s; past
// that, its stand-in rules decide. Own plugin for the same reason as
// processorWebhook.ts: the signature is the auth, and HMAC needs the raw bytes.
//
// Reads only the CACHED Spending Power (latest CardAccessList row), never
// assessAccess() — that calls Plaid live and would blow the 2s budget.
// =============================================================================

import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { decide, signatureValid } from '../services/highnoteAuth';

const SECRET = process.env.HIGHNOTE_COLLAB_AUTH_SECRET || '';

export async function highnoteAuthRoutes(server: FastifyInstance) {
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  server.post('/authorize', async (request, reply) => {
    const raw = request.body as Buffer;
    const reject = (status: number, reason: string) => {
      request.log.warn({ ip: request.ip, reason }, 'highnote auth rejected');
      return reply.status(status).send({ error: reason });
    };

    // Fail closed: no secret configured must never mean "approve everything".
    if (!SECRET) return reject(503, 'NOT_CONFIGURED');
    if (!signatureValid(SECRET, raw, String(request.headers['highnote-signature'] ?? ''))) {
      return reject(401, 'BAD_SIGNATURE');
    }

    let req: {
      id?: string;
      transaction?: { id?: string };
      paymentCard?: { id?: string };
      requestedAmount?: { value?: number; currencyCode?: string };
    };
    try {
      req = JSON.parse(raw.toString('utf8'))?.data?.collaborativeAuthorizationRequest ?? {};
    } catch {
      return reject(400, 'MALFORMED_JSON');
    }
    const transactionId = req.transaction?.id;
    if (!transactionId) return reject(400, 'MISSING_TRANSACTION');

    const user = req.paymentCard?.id
      ? await prisma.user.findUnique({ where: { highnoteCardId: req.paymentCard.id }, select: { id: true } })
      : null;

    let responseCode: ReturnType<typeof decide> = 'INSUFFICIENT_FUNDS';
    if (user) {
      const [access, owed, missed] = await Promise.all([
        prisma.cardAccessList.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { status: true, limitCents: true },
        }),
        prisma.installment.aggregate({
          where: { userId: user.id, status: { notIn: ['PAID', 'CURED'] }, plan: { status: 'ACTIVE' } },
          _sum: { amountCents: true },
        }),
        prisma.installment.count({ where: { userId: user.id, status: 'MISSED' } }),
      ]);
      responseCode = decide({
        amountCents: Number(req.requestedAmount?.value),
        currencyCode: String(req.requestedAmount?.currencyCode ?? ''),
        access,
        outstandingCents: owed._sum.amountCents ?? 0,
        hasMissed: missed > 0,
      });
    }

    request.log.info({ transactionId, card: req.paymentCard?.id, responseCode }, 'highnote auth decided');
    return reply.send({ transaction: { id: transactionId }, responseCode });
  });
}

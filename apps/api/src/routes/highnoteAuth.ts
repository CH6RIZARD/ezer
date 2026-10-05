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
import { decide, fresh, signatureValid } from '../services/highnoteAuth';

const SECRET = process.env.HIGHNOTE_COLLAB_AUTH_SECRET || '';

export async function highnoteAuthRoutes(server: FastifyInstance) {
  // Every content type as raw bytes — the signature covers them, whatever Highnote labels them.
  server.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  // Reachability probe: harmless, and a GET-based verification would 404 otherwise.
  server.get('/authorize', async () => ({ success: true }));

  server.post('/authorize', async (request, reply) => {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const reject = (status: number, reason: string) => {
      // error level: production logs only errors, and a rejected Highnote call
      // is exactly what needs to be visible.
      request.log.error(
        { ip: request.ip, reason, ua: request.headers['user-agent'], ct: request.headers['content-type'], bytes: raw.length, signed: !!request.headers['highnote-signature'] },
        'highnote auth rejected'
      );
      return reply.status(status).send({ error: reason });
    };

    // Fail closed: no secret configured must never mean "approve everything".
    if (!SECRET) return reject(503, 'NOT_CONFIGURED');
    if (!signatureValid(SECRET, raw, String(request.headers['highnote-signature'] ?? ''))) {
      return reject(401, 'BAD_SIGNATURE');
    }

    let body: any;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return reject(400, 'MALFORMED_JSON');
    }
    const req: {
      transaction?: { id?: string };
      paymentCard?: { id?: string };
      requestedAmount?: { value?: number; currencyCode?: string };
    } | undefined = body?.data?.collaborativeAuthorizationRequest;
    // Activation sends a signed test event with no authorization request in
    // it and only needs a 2xx back — a 400 here is what failed activation.
    if (!req) return reply.send({ success: true });
    // Replay guard on the part that matters: a captured approval request.
    if (!fresh(body?.extensions?.signatureTimestamp)) return reject(401, 'STALE_SIGNATURE');
    const transactionId = req.transaction?.id;
    if (!transactionId) {
      // Activation's verification event is a signed request with no
      // transaction. It needs a 2xx; answering it with a decline keeps this
      // fail-closed if a real swipe ever arrived without one.
      request.log.error({ keys: Object.keys(req), data: Object.keys(body?.data ?? {}) }, 'highnote auth: no transaction (verification?)');
      return reply.send({ responseCode: 'INSUFFICIENT_FUNDS' });
    }

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

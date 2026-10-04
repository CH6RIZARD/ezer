// =============================================================================
// EZER — account lifecycle
//
// Exists because a privacy policy that promises deletion and a codebase with
// no delete path is a misrepresentation, not a roadmap item. Plaid, Apple and
// the GDPR/CPRA all require this to be real before launch.
// =============================================================================

import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import { decrypt } from '../utils/encryption';
import { getPlaidClient } from './plaid';

export async function accountRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // DELETE /account
  server.delete('/', async (request, reply) => {
    const userId = (request as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { plaidItems: true },
    });
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Plaid FIRST, and this ordering is the whole point.
    //
    // Deleting our rows destroys the access tokens, and an item we can no
    // longer address is an item that stays live on Plaid's side: still
    // connected to the user's bank, still billing us every month, with no way
    // left to revoke it. Revoke upstream while we can still decrypt, then
    // delete locally.
    const failed: string[] = [];
    if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
      const plaid = getPlaidClient();
      for (const item of user.plaidItems) {
        try {
          await plaid.itemRemove({ access_token: decrypt(item.accessTokenEnc) });
        } catch (err) {
          // An item Plaid has already forgotten is not a reason to strand a
          // deletion request — record it and keep going. Never log the full
          // Axios error: its config carries the Plaid credential headers.
          const e = err as { response?: { data?: unknown }; message?: string };
          request.log.error(
            { err: e?.response?.data || e?.message, plaidItemId: item.plaidItemId },
            'itemRemove failed during account deletion'
          );
          failed.push(item.plaidItemId);
        }
      }
    }

    // One statement erases everything: the schema carries onDelete: Cascade on
    // every user-owned relation, so subscriptions, transactions, Plaid items,
    // funding sources, goals, transfers and ledger entries all go with it.
    await prisma.user.delete({ where: { id: userId } });

    if (failed.length > 0) {
      request.log.warn({ userId, failed }, 'account deleted with unrevoked Plaid items — revoke manually');
    }

    return reply.status(200).send({
      success: true,
      data: { deleted: true, plaidItemsRevoked: user.plaidItems.length - failed.length },
    });
  });

  // POST /account/dev-unlock
  //
  // A private bypass for one person to keep testing past the local device
  // trial window — see apps/mobile/app/screens/Paywall.tsx for the link that
  // calls this. It intentionally does NOT compare against anything the
  // client sends except the code itself: no client-supplied date, no
  // client-computed "is this expired" boolean. Expiry is this fixed
  // constant, checked against `new Date()` on THIS server, which is the
  // only clock a phone's local time (settable to whatever, including
  // backward to defeat an expiry check) cannot touch.
  //
  // DEV_UNLOCK_CODE must be set on Railway; it is never present in the
  // mobile bundle, unlike a hardcoded client-side bypass would be — anyone
  // who decompiled the APK would find nothing to extract.
  const DEV_UNLOCK_EXPIRES_AT = new Date('2026-10-06T23:59:59Z');

  server.post<{ Body: { code?: string } }>(
    '/dev-unlock',
    { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } },
    async (request, reply) => {
    const userId = (request as any).userId;
    const code = request.body?.code;

    if (!process.env.DEV_UNLOCK_CODE) {
      return reply.status(503).send({ success: false, error: 'Not configured on this server' });
    }
    // Constant-time compare — `!==` leaks matching-prefix length via timing.
    // Same pattern as processorWebhook.ts: length is not secret, check it first.
    const expected = Buffer.from(process.env.DEV_UNLOCK_CODE);
    const provided = Buffer.from(code ?? '');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return reply.status(401).send({ success: false, error: 'Invalid code' });
    }
    if (new Date() > DEV_UNLOCK_EXPIRES_AT) {
      return reply.status(410).send({ success: false, error: 'This code has expired' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { devUnlockedUntil: DEV_UNLOCK_EXPIRES_AT },
    });

    return { success: true, data: { unlockedUntil: DEV_UNLOCK_EXPIRES_AT.toISOString() } };
  });

  // GET /account/dev-status — computed fresh on every call against THIS
  // server's clock, never cached as a raw expiry timestamp for the client to
  // evaluate itself. The client only ever learns a boolean.
  server.get('/dev-status', async (request, reply) => {
    const userId = (request as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { devUnlockedUntil: true },
    });

    const devUnlocked = !!user?.devUnlockedUntil && new Date() < user.devUnlockedUntil;
    return { success: true, data: { devUnlocked } };
  });

  // GET /account/export — the access half of the same right.
  server.get('/export', async (request, reply) => {
    const userId = (request as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        authAccounts: true,
        subscriptions: { include: { merchant: true } },
        transactions: true,
        savingsGoals: true,
        transfers: true,
      },
    });
    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    // Never export the credential material itself — a data subject access
    // request is for the subject's data, not for our secrets about it.
    const { passwordHash, ...safe } = user as any;

    reply.header('Content-Disposition', 'attachment; filename="ezer-data-export.json"');
    return { success: true, data: { exportedAt: new Date().toISOString(), user: safe } };
  });
}

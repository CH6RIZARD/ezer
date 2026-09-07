// =============================================================================
// EZER — account lifecycle
//
// Exists because a privacy policy that promises deletion and a codebase with
// no delete path is a misrepresentation, not a roadmap item. Plaid, Apple and
// the GDPR/CPRA all require this to be real before launch.
// =============================================================================

import { FastifyInstance } from 'fastify';
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
          // deletion request — record it and keep going.
          request.log.error({ err, plaidItemId: item.plaidItemId }, 'itemRemove failed during account deletion');
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

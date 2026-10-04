import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';

export async function ingestRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // /ingest/eml and /ingest/sms were removed: both were dead ends — /eml
  // wrote raw email files to ./uploads with no retention and no consumer,
  // /sms acknowledged and discarded. Nothing parsed either.

  // POST /ingest/csv
  server.post<{
    Body: {
      transactions: Array<{
        date: string;
        merchant: string;
        amount: number;
        description?: string;
      }>;
    };
  }>('/csv', async (request, reply) => {
    const userId = (request as any).userId;
    const { transactions } = request.body;

    if (!transactions || transactions.length === 0) {
      return reply.status(400).send({ success: false, error: 'Missing transactions' });
    }

    // Create transaction records
    const created = await prisma.transaction.createMany({
      data: transactions.map((tx) => ({
        userId,
        merchantNameRaw: tx.merchant,
        amountCents: Math.round(tx.amount * 100),
        date: new Date(tx.date),
        source: 'csv_import',
        rawData: tx,
      })),
    });

    return {
      success: true,
      message: `${created.count} transactions imported. Analysis will run shortly.`,
    };
  });

  // POST /ingest/gmail/pull
  server.post<{
    Body: { maxResults?: number; afterDate?: string };
  }>('/gmail/pull', async (request, reply) => {
    const userId = (request as any).userId;
    const { maxResults = 100, afterDate } = request.body;

    // In production, this would use Gmail API with stored OAuth tokens
    // For dev mode, return mock response

    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/mock-inbox instead.',
      };
    }

    // Check if user has Gmail connected
    const oauthToken = await prisma.oAuthToken.findFirst({
      where: { userId, provider: 'gmail' },
    });

    if (!oauthToken) {
      return reply.status(400).send({
        success: false,
        error: 'Gmail not connected. Use /connect/gmail/start first.',
      });
    }

    return {
      success: true,
      message: 'Gmail pull queued. Messages will be processed shortly.',
    };
  });

  // POST /ingest/outlook/pull
  server.post<{
    Body: { maxResults?: number; afterDate?: string };
  }>('/outlook/pull', async (request, reply) => {
    const userId = (request as any).userId;
    const { maxResults = 100, afterDate } = request.body;

    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/mock-inbox instead.',
      };
    }

    // Check if user has Outlook connected
    const oauthToken = await prisma.oAuthToken.findFirst({
      where: { userId, provider: 'outlook' },
    });

    if (!oauthToken) {
      return reply.status(400).send({
        success: false,
        error: 'Outlook not connected. Use /connect/outlook/start first.',
      });
    }

    return {
      success: true,
      message: 'Outlook pull queued. Messages will be processed shortly.',
    };
  });
}

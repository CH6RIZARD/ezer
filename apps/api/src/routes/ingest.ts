import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import { saveFile } from '../utils/storage';
import path from 'path';

export async function ingestRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // POST /ingest/eml
  server.post('/eml', async (request, reply) => {
    const userId = (request as any).userId;

    // Handle file upload
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ success: false, error: 'Missing file' });
    }

    const buffer = await data.toBuffer();
    const ext = path.extname(data.filename);

    if (ext.toLowerCase() !== '.eml') {
      return reply.status(400).send({ success: false, error: 'Only .eml files are supported' });
    }

    const filename = await saveFile(buffer, ext);

    // In production, this would queue a job to parse the .eml file
    // For now, just acknowledge receipt

    return {
      success: true,
      message: 'Email file uploaded. Parsing will begin shortly.',
      filename,
    };
  });

  // POST /ingest/sms
  server.post<{
    Body: { from: string; body: string; timestamp: string };
  }>('/sms', async (request, reply) => {
    const userId = (request as any).userId;
    const { from, body, timestamp } = request.body;

    if (!from || !body || !timestamp) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' });
    }

    // In production, this would queue a job to parse the SMS
    // For now, just acknowledge receipt

    return {
      success: true,
      message: 'SMS received. Parsing will begin shortly.',
    };
  });

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

import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { encrypt } from '../utils/encryption';
import { authMiddleware } from '../middleware/auth';

export async function connectRoutes(server: FastifyInstance) {
  // All connect routes require auth
  server.addHook('preHandler', authMiddleware);

  // POST /connect/gmail/start
  server.post('/gmail/start', async (request, reply) => {
    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/mock-inbox instead.',
      };
    }

    // Production: Generate Gmail OAuth URL with mail.readonly scope
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.GOOGLE_REDIRECT_URI}/gmail`;

    if (!clientId || !redirectUri) {
      return reply.status(500).send({
        success: false,
        error: 'Gmail OAuth not configured.',
      });
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly&access_type=offline`;

    return { success: true, authUrl };
  });

  // POST /connect/gmail/callback
  server.post<{ Body: { code: string } }>('/gmail/callback', async (request, reply) => {
    const userId = (request as any).userId;
    const { code } = request.body;

    if (!code) {
      return reply.status(400).send({ success: false, error: 'Missing code' });
    }

    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(501).send({
        success: false,
        error: 'Gmail OAuth not fully implemented. Use DEV_OAUTH_BYPASS=true for local dev.',
      });
    }

    return reply.status(400).send({
      success: false,
      error: 'Use /simulator/mock-inbox in dev mode',
    });
  });

  // POST /connect/outlook/start
  server.post('/outlook/start', async (request, reply) => {
    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/mock-inbox instead.',
      };
    }

    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const redirectUri = `${process.env.MICROSOFT_REDIRECT_URI}/outlook`;

    if (!clientId || !redirectUri) {
      return reply.status(500).send({
        success: false,
        error: 'Outlook OAuth not configured.',
      });
    }

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=https://graph.microsoft.com/Mail.Read&response_mode=query`;

    return { success: true, authUrl };
  });

  // POST /connect/outlook/callback
  server.post<{ Body: { code: string } }>('/outlook/callback', async (request, reply) => {
    const userId = (request as any).userId;
    const { code } = request.body;

    if (!code) {
      return reply.status(400).send({ success: false, error: 'Missing code' });
    }

    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(501).send({
        success: false,
        error: 'Outlook OAuth not fully implemented. Use DEV_OAUTH_BYPASS=true for local dev.',
      });
    }

    return reply.status(400).send({
      success: false,
      error: 'Use /simulator/mock-inbox in dev mode',
    });
  });

  // POST /connect/imap
  server.post<{
    Body: { host: string; port: number; email: string; password: string };
  }>('/imap', async (request, reply) => {
    const userId = (request as any).userId;
    const { host, port, email, password } = request.body;

    if (!host || !port || !email || !password) {
      return reply.status(400).send({ success: false, error: 'Missing IMAP credentials' });
    }

    // Encrypt password
    const encryptedPassword = encrypt(password);

    // Create data source
    await prisma.dataSource.create({
      data: {
        userId,
        type: 'imap',
        status: 'active',
        config: {
          host,
          port,
          email,
          passwordEnc: encryptedPassword,
        },
      },
    });

    return {
      success: true,
      message: 'IMAP connection saved. Email parsing will begin shortly.',
    };
  });
}

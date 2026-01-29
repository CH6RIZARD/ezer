import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { signJwt } from '../utils/jwt';
import { authProviderSchema } from '@ezer/shared';

export async function authRoutes(server: FastifyInstance) {
  // POST /auth/oauth/google/start
  server.post('/oauth/google/start', async (request, reply) => {
    // In production, this would redirect to Google OAuth consent screen
    // For dev mode with DEV_OAUTH_BYPASS, we return a mock URL
    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/dev-login instead.',
      };
    }

    // Production implementation would generate OAuth URL
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId || !redirectUri) {
      return reply.status(500).send({
        success: false,
        error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.',
      });
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=openid%20email%20profile&access_type=offline`;

    return { success: true, authUrl };
  });

  // POST /auth/oauth/google/callback
  server.post<{ Body: { code: string } }>('/oauth/google/callback', async (request, reply) => {
    const { code } = request.body;

    if (!code) {
      return reply.status(400).send({ success: false, error: 'Missing code' });
    }

    // In production, exchange code for tokens, get user info, create/update user
    // For now, return error if not in dev mode
    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(501).send({
        success: false,
        error: 'OAuth callback not fully implemented. Use DEV_OAUTH_BYPASS=true for local dev.',
      });
    }

    return reply.status(400).send({
      success: false,
      error: 'Use /simulator/dev-login in dev mode',
    });
  });

  // POST /auth/oauth/apple/complete
  server.post<{ Body: { identityToken: string; user?: any } }>(
    '/oauth/apple/complete',
    async (request, reply) => {
      const { identityToken, user } = request.body;

      if (!identityToken) {
        return reply.status(400).send({ success: false, error: 'Missing identityToken' });
      }

      // In production, verify Apple identity token and create/update user
      if (process.env.DEV_OAUTH_BYPASS !== 'true') {
        return reply.status(501).send({
          success: false,
          error: 'Apple Sign-In not fully implemented. Use DEV_OAUTH_BYPASS=true for local dev.',
        });
      }

      return reply.status(400).send({
        success: false,
        error: 'Use /simulator/dev-login in dev mode',
      });
    }
  );

  // POST /auth/oauth/microsoft/start
  server.post('/oauth/microsoft/start', async (request, reply) => {
    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      return {
        success: true,
        message: 'DEV_OAUTH_BYPASS enabled. Use /simulator/dev-login instead.',
      };
    }

    const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
    const clientId = process.env.MICROSOFT_CLIENT_ID;

    if (!clientId || !redirectUri) {
      return reply.status(500).send({
        success: false,
        error:
          'Microsoft OAuth not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_REDIRECT_URI.',
      });
    }

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&scope=openid%20email%20profile&response_mode=query`;

    return { success: true, authUrl };
  });

  // POST /auth/oauth/microsoft/callback
  server.post<{ Body: { code: string } }>('/oauth/microsoft/callback', async (request, reply) => {
    const { code } = request.body;

    if (!code) {
      return reply.status(400).send({ success: false, error: 'Missing code' });
    }

    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(501).send({
        success: false,
        error: 'OAuth callback not fully implemented. Use DEV_OAUTH_BYPASS=true for local dev.',
      });
    }

    return reply.status(400).send({
      success: false,
      error: 'Use /simulator/dev-login in dev mode',
    });
  });

  // POST /auth/session - Verify current session
  server.post('/session', { preHandler: require('../middleware/auth').authMiddleware }, async (request, reply) => {
    const userId = (request as any).userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        authAccounts: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return {
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        authProviders: user.authAccounts.map((a) => a.provider),
      },
    };
  });
}

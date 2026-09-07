import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import bcrypt from 'bcryptjs';
import { signJwt } from '../utils/jwt';
import {
  authProviderSchema,
  appleCompleteSchema,
  emailSignupSchema,
  googleCompleteSchema,
  microsoftCompleteSchema,
} from '@ezer/shared';
import { upsertOAuthUser } from '../utils/oauthUser';
import { CONSENT_VERSION } from '../utils/consent';
import { verifyAppleIdentityToken } from '../utils/verifyApple';
import { verifyGoogleIdToken } from '../utils/verifyGoogle';
import { verifyMicrosoftIdToken } from '../utils/verifyMicrosoft';

function formatZodError(error: { issues: { message: string }[] }): string {
  return error.issues.map(issue => issue.message).join('; ');
}


export async function authRoutes(server: FastifyInstance) {
  // POST /auth/signup
  server.post<{ Body: { email: string; password: string; name: string } }>(
    '/signup',
    async (request, reply) => {
      const { email, password, name } = request.body;

      if (!email || !password || !name) {
        return reply.status(400).send({ success: false, error: 'email, password and name are required' });
      }
      if (password.length < 6) {
        return reply.status(400).send({ success: false, error: 'Password must be at least 6 characters' });
      }

      // Normalised, because the unique index is case-SENSITIVE: signing up as
      // "Daniel@x.com" then logging in as "daniel@x.com" created one account
      // and then failed to find it.
      const normalisedEmail = email.toLowerCase().trim();

      const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
      if (existing) {
        return reply.status(400).send({ success: false, error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      // Consent is recorded, not just collected. A checkbox the client ticks
      // and nobody stores proves nothing when a regulator or Plaid asks when
      // this user agreed and to which version.
      const user = await prisma.user.create({
        data: {
          email: normalisedEmail,
          name: name.trim(),
          passwordHash,
          consentedAt: new Date(),
          consentVersion: CONSENT_VERSION,
        },
      });
      const token = signJwt({ userId: user.id, email: user.email });

      return { success: true, data: { token, userId: user.id, email: user.email, name: user.name } };
    }
  );

  // POST /auth/login
  server.post<{ Body: { email: string; password: string } }>(
    '/login',
    async (request, reply) => {
      const { email, password } = request.body;

      if (!email || !password) {
        return reply.status(400).send({ success: false, error: 'email and password are required' });
      }

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!user || !user.passwordHash) {
        return reply.status(401).send({ success: false, error: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ success: false, error: 'Invalid credentials' });
      }

      const token = signJwt({ userId: user.id, email: user.email });
      return { success: true, data: { token, userId: user.id, email: user.email, name: user.name } };
    }
  );

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
  // NOTE: the previous /oauth/apple/complete stub lived here. It never verified
  // the identity token — it 501'd outside dev and pointed at the dev-login
  // bypass inside it. The real implementation below verifies against Apple's
  // public keys. Two handlers on one path also made Fastify refuse to boot
  // (FST_ERR_DUPLICATED_ROUTE), so the stub had to go, not just be ignored.

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

  // ---------------------------------------------------------------------------
  // Native provider sign-in (merged from the standalone ezer repo)
  //
  // The device performs the provider flow and sends the resulting ID token; the
  // server verifies it against the provider's own keys before minting a JWT.
  // These replace nothing — the /oauth/*/start routes above remain, because
  // they exist for a different purpose (Gmail / Outlook mailbox ingest).
  // ---------------------------------------------------------------------------

  server.post<{ Body: unknown }>('/oauth/google/complete', async (request, reply) => {
    const parsed = googleCompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: formatZodError(parsed.error),
      });
    }

    try {
      const identity = await verifyGoogleIdToken(parsed.data.idToken);
      const session = await upsertOAuthUser({
        provider: 'google',
        providerUserId: identity.providerUserId,
        email: identity.email,
        name: identity.name,
      });
      return { success: true, data: session };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      return reply.status(401).send({ success: false, error: message });
    }
  });

  // POST /auth/oauth/apple/complete â€” native Apple identity token
  server.post<{ Body: unknown }>('/oauth/apple/complete', async (request, reply) => {
    const parsed = appleCompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: formatZodError(parsed.error),
      });
    }

    try {
      const identity = await verifyAppleIdentityToken(parsed.data.identityToken);
      const fullName = [parsed.data.fullName?.givenName, parsed.data.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();

      const email = identity.email || parsed.data.email;
      if (!email) {
        return reply.status(400).send({
          success: false,
          error:
            'Apple did not return an email for this account. Sign in once with email sharing enabled, or use another provider.',
        });
      }

      const session = await upsertOAuthUser({
        provider: 'apple',
        providerUserId: identity.providerUserId,
        email,
        name: fullName || null,
      });
      return { success: true, data: session };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apple sign-in failed';
      return reply.status(401).send({ success: false, error: message });
    }
  });

  // POST /auth/oauth/microsoft/complete â€” Microsoft ID token from auth session
  server.post<{ Body: unknown }>('/oauth/microsoft/complete', async (request, reply) => {
    const parsed = microsoftCompleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: formatZodError(parsed.error),
      });
    }

    try {
      const identity = await verifyMicrosoftIdToken(parsed.data.idToken);
      const session = await upsertOAuthUser({
        provider: 'microsoft',
        providerUserId: identity.providerUserId,
        email: identity.email,
        name: identity.name,
      });
      return { success: true, data: session };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microsoft sign-in failed';
      return reply.status(401).send({ success: false, error: message });
    }
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

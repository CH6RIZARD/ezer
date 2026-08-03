import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '@ezer/db';
import {
  appleCompleteSchema,
  emailLoginSchema,
  emailSignupSchema,
  googleCompleteSchema,
  microsoftCompleteSchema,
} from '@ezer/shared';
import { authMiddleware } from '../middleware/auth';
import { signJwt } from '../utils/jwt';
import { upsertOAuthUser } from '../utils/oauthUser';
import { verifyAppleIdentityToken } from '../utils/verifyApple';
import { verifyGoogleIdToken } from '../utils/verifyGoogle';
import { verifyMicrosoftIdToken } from '../utils/verifyMicrosoft';

function formatZodError(error: { issues: { message: string }[] }): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

export async function authRoutes(server: FastifyInstance) {
  // POST /auth/signup
  server.post<{ Body: unknown }>('/signup', async (request, reply) => {
    const parsed = emailSignupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: formatZodError(parsed.error),
      });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: 'An account with this email already exists. Sign in instead.',
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash,
      },
    });

    const token = signJwt({ userId: user.id, email: user.email });
    return {
      success: true,
      data: {
        token,
        userId: user.id,
        email: user.email,
        name: user.name,
        provider: 'email' as const,
      },
    };
  });

  // POST /auth/login
  server.post<{ Body: unknown }>('/login', async (request, reply) => {
    const parsed = emailLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: formatZodError(parsed.error),
      });
    }

    const email = parsed.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid email or password',
      });
    }

    const token = signJwt({ userId: user.id, email: user.email });
    return {
      success: true,
      data: {
        token,
        userId: user.id,
        email: user.email,
        name: user.name,
        provider: 'email' as const,
      },
    };
  });

  // POST /auth/oauth/google/complete — native Google ID token
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

  // POST /auth/oauth/apple/complete — native Apple identity token
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

  // POST /auth/oauth/microsoft/complete — Microsoft ID token from auth session
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

  // POST /auth/session — verify current JWT session
  server.post('/session', { preHandler: authMiddleware }, async (request, reply) => {
    const userId = (request as { userId?: string }).userId;

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
        name: user.name,
        authProviders: user.authAccounts.map((account) => account.provider),
        hasPassword: Boolean(user.passwordHash),
      },
    };
  });
}

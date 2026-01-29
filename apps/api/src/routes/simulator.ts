import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { signJwt } from '../utils/jwt';
import { encrypt } from '../utils/encryption';

export async function simulatorRoutes(server: FastifyInstance) {
  // POST /simulator/seed
  server.post('/seed', async (request, reply) => {
    // This is already handled by the Prisma seed script
    // Just return success
    return {
      success: true,
      message: 'Use `pnpm db:seed` to seed the database.',
    };
  });

  // POST /simulator/dev-login
  server.post<{
    Body: { provider: 'google' | 'apple' | 'microsoft' };
  }>('/dev-login', async (request, reply) => {
    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(403).send({
        success: false,
        error: 'DEV_OAUTH_BYPASS must be enabled',
      });
    }

    const { provider } = request.body;

    if (!provider || !['google', 'apple', 'microsoft'].includes(provider)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid provider. Must be google, apple, or microsoft.',
      });
    }

    // Get or create demo user
    let user = await prisma.user.findUnique({
      where: { email: 'demo@ezer.app' },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: 'demo@ezer.app' },
      });
    }

    // Get or create auth account
    let authAccount = await prisma.authAccount.findFirst({
      where: {
        userId: user.id,
        provider,
      },
    });

    if (!authAccount) {
      authAccount = await prisma.authAccount.create({
        data: {
          userId: user.id,
          provider,
          providerUserId: `${provider}-demo-user-123`,
          email: user.email,
        },
      });
    }

    // Generate JWT
    const token = signJwt({
      userId: user.id,
      email: user.email,
    });

    return {
      success: true,
      data: {
        token,
        userId: user.id,
        email: user.email,
        provider,
      },
    };
  });

  // POST /simulator/mock-inbox
  server.post<{
    Body: { provider: 'gmail' | 'outlook' };
  }>('/mock-inbox', async (request, reply) => {
    if (process.env.DEV_OAUTH_BYPASS !== 'true') {
      return reply.status(403).send({
        success: false,
        error: 'DEV_OAUTH_BYPASS must be enabled',
      });
    }

    const { provider } = request.body;

    if (!provider || !['gmail', 'outlook'].includes(provider)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid provider. Must be gmail or outlook.',
      });
    }

    // Get demo user
    const user = await prisma.user.findUnique({
      where: { email: 'demo@ezer.app' },
    });

    if (!user) {
      return reply.status(404).send({
        success: false,
        error: 'Demo user not found. Run /simulator/dev-login first.',
      });
    }

    // Create mock OAuth token
    const mockAccessToken = encrypt('mock-access-token');
    const mockRefreshToken = encrypt('mock-refresh-token');

    await prisma.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        },
      },
      create: {
        userId: user.id,
        provider,
        accessTokenEnc: mockAccessToken,
        refreshTokenEnc: mockRefreshToken,
        expiry: new Date(Date.now() + 3600000), // 1 hour
        scopes: provider === 'gmail' ? ['https://www.googleapis.com/auth/gmail.readonly'] : ['Mail.Read'],
      },
      update: {
        accessTokenEnc: mockAccessToken,
        refreshTokenEnc: mockRefreshToken,
        expiry: new Date(Date.now() + 3600000),
      },
    });

    // Create data source
    await prisma.dataSource.upsert({
      where: {
        id: `${user.id}-${provider}`,
      },
      create: {
        id: `${user.id}-${provider}`,
        userId: user.id,
        type: provider,
        status: 'active',
      },
      update: {
        status: 'active',
      },
    });

    // Create mock inbox messages (this simulates having subscription receipts)
    // In a real implementation, these would be parsed and create subscriptions/charges

    const mockMessages = [
      {
        from: 'noreply@netflix.com',
        subject: 'Your Netflix subscription has been renewed',
        body: 'Your payment of $15.49 has been processed. Charged to Visa •••• 1234. Thank you for being a member!',
        merchant: 'Netflix',
        amountCents: 1549,
        fundingHint: { brand: 'Visa', last4: '1234' },
      },
      {
        from: 'receipts@spotify.com',
        subject: 'Receipt from Spotify',
        body: 'Your Spotify Premium subscription was renewed for $10.99. Payment method: Amex •••• 0005.',
        merchant: 'Spotify',
        amountCents: 1099,
        fundingHint: { brand: 'Amex', last4: '0005' },
      },
      {
        from: 'billing@adobe.com',
        subject: 'Adobe Creative Cloud - Payment Confirmation',
        body: 'Your payment of $54.99 for Adobe Creative Cloud has been processed using Visa ending in 1234.',
        merchant: 'Adobe',
        amountCents: 5499,
        fundingHint: { brand: 'Visa', last4: '1234' },
      },
      {
        from: 'help@chatgpt.com',
        subject: 'Your free trial is ending soon',
        body: 'Your ChatGPT Plus free trial will end on ' + new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + '. After that, you will be charged $20/month.',
        merchant: 'ChatGPT',
        isTrial: true,
      },
    ];

    return {
      success: true,
      message: `Mock ${provider} inbox created with sample subscription receipts.`,
      data: {
        provider,
        messagesCount: mockMessages.length,
        messages: mockMessages,
      },
    };
  });

  // POST /simulator/auto-cancel/:trialId
  server.post<{ Params: { trialId: string } }>('/auto-cancel/:trialId', async (request, reply) => {
    const { trialId } = request.params;

    const trial = await prisma.trial.findUnique({
      where: { id: trialId },
      include: {
        subscription: true,
        decisionRule: true,
      },
    });

    if (!trial) {
      return reply.status(404).send({ success: false, error: 'Trial not found' });
    }

    if (!trial.decisionRule || trial.decisionRule.type !== 'autoCancel') {
      return reply.status(400).send({
        success: false,
        error: 'Trial does not have auto-cancel rule',
      });
    }

    // Simulate auto-cancel
    await prisma.subscription.update({
      where: { id: trial.subscriptionId },
      data: { status: 'canceled' },
    });

    await prisma.decisionRule.update({
      where: { id: trial.decisionRule.id },
      data: { executed: true },
    });

    return {
      success: true,
      message: 'Trial auto-canceled (simulated)',
    };
  });

  // POST /simulator/mark-canceled/:subscriptionId
  server.post<{ Params: { subscriptionId: string } }>(
    '/mark-canceled/:subscriptionId',
    async (request, reply) => {
      const { subscriptionId } = request.params;

      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
      });

      if (!subscription) {
        return reply.status(404).send({ success: false, error: 'Subscription not found' });
      }

      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'canceled' },
      });

      return {
        success: true,
        message: 'Subscription marked as canceled (simulated)',
      };
    }
  );
}

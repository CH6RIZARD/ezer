import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import {
  calculateInvestmentOpportunityCost,
  decisionRuleTypeSchema,
  getDifficultyLabel,
} from '@ezer/shared';

export async function coreRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // GET /home/summary
  server.get('/home/summary', async (request, reply) => {
    const userId = (request as any).userId;

    // Get active subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        userId,
        status: { in: ['active', 'trial'] },
      },
      include: {
        merchant: true,
      },
    });

    // Calculate monthly burn rate (sum of active subscription charges in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCharges = await prisma.subscriptionCharge.findMany({
      where: {
        userId,
        chargeTimestamp: {
          gte: thirtyDaysAgo,
        },
      },
    });

    const monthlyBurnRate = recentCharges.reduce((sum, c) => sum + c.amountCents, 0);

    // Calculate next 30-day risk (trials expiring + upcoming renewals)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const upcomingTrials = await prisma.trial.findMany({
      where: {
        subscription: {
          userId,
        },
        trialEndDate: {
          gte: new Date(),
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        subscription: {
          include: {
            merchant: true,
          },
        },
      },
    });

    const upcomingRenewals = await prisma.subscription.findMany({
      where: {
        userId,
        status: 'active',
        renewalDate: {
          gte: new Date(),
          lte: thirtyDaysFromNow,
        },
      },
      include: {
        priceHistory: {
          orderBy: { month: 'desc' },
          take: 1,
        },
      },
    });

    const trialRisk = upcomingTrials.reduce((sum, t) => {
      const lastCharge = recentCharges.find((c) => c.merchantId === t.subscription.merchantId);
      return sum + (lastCharge?.amountCents || 0);
    }, 0);

    const renewalRisk = upcomingRenewals.reduce((sum, s) => {
      return sum + (s.priceHistory[0]?.amountCents || 0);
    }, 0);

    const next30DayRisk = trialRisk + renewalRisk;

    // Count silent subscriptions (active but no recent activity)
    const silentSubscriptionsCount = subscriptions.filter((s) => {
      return !recentCharges.some((c) => c.merchantId === s.merchantId);
    }).length;

    const activeTrials = await prisma.trial.count({
      where: {
        subscription: {
          userId,
        },
        trialEndDate: {
          gte: new Date(),
        },
      },
    });

    return {
      success: true,
      data: {
        monthlyBurnRate,
        next30DayRisk,
        silentSubscriptionsCount,
        totalSubscriptions: subscriptions.length,
        activeTrials,
      },
    };
  });

  // GET /risks?days=30
  server.get<{ Querystring: { days?: string } }>('/risks', async (request, reply) => {
    const userId = (request as any).userId;
    const days = parseInt(request.query.days || '30', 10);

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);

    // Get trials expiring
    const trials = await prisma.trial.findMany({
      where: {
        trialEndDate: {
          gte: new Date(),
          lte: targetDate,
        },
        subscription: {
          userId,
        },
      },
      include: {
        subscription: {
          include: {
            merchant: true,
          },
        },
      },
      orderBy: {
        trialEndDate: 'asc',
      },
    });

    // Get upcoming renewals
    const renewals = await prisma.subscription.findMany({
      where: {
        userId,
        status: 'active',
        renewalDate: {
          gte: new Date(),
          lte: targetDate,
        },
      },
      include: {
        merchant: true,
        priceHistory: {
          orderBy: { month: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        renewalDate: 'asc',
      },
    });

    const risks = [
      ...trials.map((t) => {
        const daysUntilDue = Math.ceil(
          (t.trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        return {
          id: t.id,
          type: 'trial' as const,
          merchantName: t.subscription.merchant.canonicalName,
          logo: t.subscription.merchant.logo,
          amountCents: 0, // Will be filled from last charge or default
          dueDate: t.trialEndDate,
          daysUntilDue,
          subscriptionId: t.subscriptionId,
          trialId: t.id,
        };
      }),
      ...renewals.map((r) => {
        const daysUntilDue = r.renewalDate
          ? Math.ceil((r.renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          id: r.id,
          type: 'renewal' as const,
          merchantName: r.merchant.canonicalName,
          logo: r.merchant.logo,
          amountCents: r.priceHistory[0]?.amountCents || 0,
          dueDate: r.renewalDate || new Date(),
          daysUntilDue,
          subscriptionId: r.id,
        };
      }),
    ];

    // Sort by due date
    risks.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      success: true,
      data: risks,
    };
  });

  // GET /trials
  server.get('/trials', async (request, reply) => {
    const userId = (request as any).userId;

    const trials = await prisma.trial.findMany({
      where: {
        subscription: {
          userId,
        },
        trialEndDate: {
          gte: new Date(),
        },
      },
      include: {
        subscription: {
          include: {
            merchant: true,
          },
        },
        decisionRule: true,
      },
      orderBy: {
        trialEndDate: 'asc',
      },
    });

    const data = trials.map((t) => {
      const daysRemaining = Math.ceil(
        (t.trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: t.id,
        subscriptionId: t.subscriptionId,
        merchantName: t.subscription.merchant.canonicalName,
        logo: t.subscription.merchant.logo,
        trialEndDate: t.trialEndDate,
        daysRemaining,
        detectedFrom: t.detectedFrom,
        hasDecisionRule: !!t.decisionRule,
        decisionRule: t.decisionRule
          ? {
              type: t.decisionRule.type,
              usageThreshold: t.decisionRule.usageThreshold,
              balanceThreshold: t.decisionRule.balanceThreshold,
            }
          : undefined,
      };
    });

    return {
      success: true,
      data,
    };
  });

  // POST /trials/:id/decision
  server.post<{
    Params: { id: string };
    Body: {
      ruleType: string;
      usageThreshold?: number;
      balanceThreshold?: number;
      notes?: string;
    };
  }>('/trials/:id/decision', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;
    const { ruleType, usageThreshold, balanceThreshold, notes } = request.body;

    // Same enum Prisma's DecisionRuleType declares — reject anything else
    // instead of casting it straight into the database.
    const parsedRuleType = decisionRuleTypeSchema.safeParse(ruleType);
    if (!parsedRuleType.success) {
      return reply.status(400).send({
        success: false,
        error: `ruleType must be one of: ${decisionRuleTypeSchema.options.join(', ')}`,
      });
    }

    // Verify trial belongs to user
    const trial = await prisma.trial.findFirst({
      where: {
        id,
        subscription: {
          userId,
        },
      },
    });

    if (!trial) {
      return reply.status(404).send({ success: false, error: 'Trial not found' });
    }

    // Create or update decision rule
    const runAtDate = new Date(trial.trialEndDate);
    runAtDate.setDate(runAtDate.getDate() - 1); // Run 1 day before trial ends

    const decisionRule = await prisma.decisionRule.upsert({
      where: { trialId: trial.id },
      create: {
        trialId: trial.id,
        type: parsedRuleType.data,
        usageThreshold,
        balanceThreshold,
        runAtDate,
      },
      update: {
        type: parsedRuleType.data,
        usageThreshold,
        balanceThreshold,
        runAtDate,
      },
    });

    return {
      success: true,
      data: decisionRule,
    };
  });

  // GET /subscriptions
  server.get('/subscriptions', async (request, reply) => {
    const userId = (request as any).userId;

    const subscriptions = await prisma.subscription.findMany({
      where: { userId },
      include: {
        merchant: true,
        trial: true,
        priceHistory: { orderBy: { month: 'desc' }, take: 1 },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Two things the client type (mobile/contexts/DataContext.tsx
    // Subscription) expects flat that this raw Prisma shape never provided:
    //
    // - merchantName / logo. Prisma's `include: { merchant: true }` nests
    //   them at s.merchant.canonicalName / s.merchant.logo; this endpoint
    //   returned that nested shape directly. Every caller reading
    //   `sub.merchantName` got undefined — the calendar day popover, for
    //   one, rendered a blank name for every event because of exactly
    //   this, which is what "doesn't show what subscription it actually
    //   is" was.
    // - amountCents. The Subscription model has no price column of its
    //   own — price is tracked month-by-month in PriceHistory, which this
    //   query never even included. Home's "Top ticket" panel filters on
    //   `s.amountCents` truthiness and silently rendered nothing.
    //
    // Both prices were always sitting in the database; this endpoint just
    // never surfaced them in the shape every client-side consumer expected.
    const data = subscriptions.map(s => {
      const playbook = s.merchant.cancellationPlaybook as { url?: string } | null | undefined;
      return {
        ...s,
        merchantName: s.merchant.canonicalName,
        logo: s.merchant.logo ?? undefined,
        amountCents: s.priceHistory[0]?.amountCents ?? 0,
        // Same two fields GET /subscriptions/:id exposes — DrainReview.tsx
        // lists rows straight from this endpoint and cancels straight from
        // it, so without these it never had a merchant-supplied URL or a
        // domain to auto-discover against, only the small curated table
        // baked into the app bundle.
        website: s.merchant.website ?? undefined,
        cancellationUrl: playbook?.url ?? undefined,
      };
    });

    return {
      success: true,
      data,
    };
  });

  // GET /subscriptions/:id
  server.get<{ Params: { id: string } }>('/subscriptions/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;

    const subscription = await prisma.subscription.findFirst({
      where: { id, userId },
      include: {
        merchant: true,
        priceHistory: {
          orderBy: { month: 'desc' },
        },
      },
    });

    if (!subscription) {
      return reply.status(404).send({ success: false, error: 'Subscription not found' });
    }

    // Get charges
    const charges = await prisma.subscriptionCharge.findMany({
      where: {
        userId,
        merchantId: subscription.merchantId,
      },
      include: {
        fundingInstrument: true,
      },
      orderBy: {
        chargeTimestamp: 'desc',
      },
    });

    // Calculate lifetime cost
    const lifetimeCostCents = charges.reduce((sum, c) => sum + c.amountCents, 0);

    // Calculate investment opportunity cost
    const monthsElapsed = subscription.priceHistory.length;
    const avgMonthly =
      subscription.priceHistory.reduce((sum, p) => sum + p.amountCents, 0) / monthsElapsed || 0;
    const investmentOpportunityCostCents = calculateInvestmentOpportunityCost(
      avgMonthly,
      monthsElapsed
    );

    // The merchant record carries a real cancellation URL for merchants we've
    // curated a playbook for (see packages/db/seed.ts). This was being
    // computed in cancel.ts's POST /subscriptions/:id/cancel but never
    // surfaced here, so the client had nothing but the curated table baked
    // into the app bundle to work with — which is why merchants without a
    // bundled entry fell all the way through to a search-engine query.
    const playbook = subscription.merchant.cancellationPlaybook as
      | { url?: string }
      | null
      | undefined;

    return {
      success: true,
      data: {
        id: subscription.id,
        merchantId: subscription.merchantId,
        merchantName: subscription.merchant.canonicalName,
        logo: subscription.merchant.logo,
        website: subscription.merchant.website,
        status: subscription.status,
        cadence: subscription.cadence,
        renewalDate: subscription.renewalDate,
        startedAt: subscription.startedAt,
        cancellationUrl: playbook?.url ?? undefined,
        cancellationDifficulty: subscription.merchant.cancellationDifficulty,
        difficultyLabel: getDifficultyLabel(subscription.merchant.cancellationDifficulty),
        charges: charges.map((c) => ({
          id: c.id,
          amountCents: c.amountCents,
          chargeTimestamp: c.chargeTimestamp,
          fundingInstrument: {
            displayName: c.fundingInstrument.displayName,
            brand: c.fundingInstrument.brand,
            last4: c.fundingInstrument.last4,
          },
        })),
        priceHistory: subscription.priceHistory,
        lifetimeCostCents,
        investmentOpportunityCostCents,
      },
    };
  });
}

import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import { getDateRange } from '@ezer/shared';

export async function walletRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // GET /wallet/instruments
  server.get('/instruments', async (request, reply) => {
    const userId = (request as any).userId;

    const instruments = await prisma.fundingInstrument.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return {
      success: true,
      data: instruments,
    };
  });

  // GET /wallet/instruments/:id/summary
  server.get<{
    Params: { id: string };
    Querystring: { range?: string; startDate?: string; endDate?: string };
  }>('/instruments/:id/summary', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;
    const { range = 'last30', startDate, endDate } = request.query;

    // Verify instrument belongs to user
    const instrument = await prisma.fundingInstrument.findFirst({
      where: { id, userId },
    });

    if (!instrument) {
      return reply.status(404).send({ success: false, error: 'Funding instrument not found' });
    }

    // Get date range
    const { startDate: start, endDate: end } = getDateRange(range, startDate, endDate);

    // Get all charges in range for this instrument
    const charges = await prisma.subscriptionCharge.findMany({
      where: {
        userId,
        fundingInstrumentId: id,
        chargeTimestamp: {
          gte: start,
          lte: end,
        },
      },
      include: {
        merchant: true,
      },
    });

    // Calculate total drained
    const totalDrainedCents = charges.reduce((sum, c) => sum + c.amountCents, 0);

    // Get unique subscriptions
    const uniqueMerchants = new Map<
      string,
      { merchantId: string; merchantName: string; logo?: string; totalCents: number }
    >();

    for (const charge of charges) {
      const existing = uniqueMerchants.get(charge.merchantId);
      if (existing) {
        existing.totalCents += charge.amountCents;
      } else {
        uniqueMerchants.set(charge.merchantId, {
          merchantId: charge.merchantId,
          merchantName: charge.merchantName,
          logo: charge.merchant.logo || undefined,
          totalCents: charge.amountCents,
        });
      }
    }

    // Get top 3 merchants
    const topMerchants = Array.from(uniqueMerchants.values())
      .sort((a, b) => b.totalCents - a.totalCents)
      .slice(0, 3)
      .map((m) => ({
        merchantId: m.merchantId,
        merchantName: m.merchantName,
        logo: m.logo,
        drainedAmountCents: m.totalCents,
      }));

    return {
      success: true,
      data: {
        id: instrument.id,
        type: instrument.type,
        displayName: instrument.displayName,
        brand: instrument.brand,
        last4: instrument.last4,
        networkArt: instrument.networkArt,
        issuerColorHint: instrument.issuerColorHint,
        isDefault: instrument.isDefault,
        drainedAmountCents: totalDrainedCents,
        activeSubscriptionsCount: uniqueMerchants.size,
        topMerchants,
      },
    };
  });

  // GET /wallet/instruments/:id/merchants
  server.get<{
    Params: { id: string };
    Querystring: { range?: string; startDate?: string; endDate?: string };
  }>('/instruments/:id/merchants', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;
    const { range = 'last30', startDate, endDate } = request.query;

    // Verify instrument belongs to user
    const instrument = await prisma.fundingInstrument.findFirst({
      where: { id, userId },
    });

    if (!instrument) {
      return reply.status(404).send({ success: false, error: 'Funding instrument not found' });
    }

    // Get date range
    const { startDate: start, endDate: end } = getDateRange(range, startDate, endDate);

    // Get all charges in range for this instrument
    const charges = await prisma.subscriptionCharge.findMany({
      where: {
        userId,
        fundingInstrumentId: id,
        chargeTimestamp: {
          gte: start,
          lte: end,
        },
      },
      include: {
        merchant: true,
      },
      orderBy: {
        chargeTimestamp: 'desc',
      },
    });

    // Group by merchant
    const merchantMap = new Map<
      string,
      {
        merchantId: string;
        merchantName: string;
        logo?: string;
        chargeCount: number;
        totalDrainedCents: number;
        billingInterval: string;
        confidenceScore: number;
      }
    >();

    for (const charge of charges) {
      const existing = merchantMap.get(charge.merchantId);
      if (existing) {
        existing.chargeCount += 1;
        existing.totalDrainedCents += charge.amountCents;
        existing.confidenceScore = Math.max(existing.confidenceScore, charge.confidenceScore);
      } else {
        merchantMap.set(charge.merchantId, {
          merchantId: charge.merchantId,
          merchantName: charge.merchantName,
          logo: charge.merchant.logo || undefined,
          chargeCount: 1,
          totalDrainedCents: charge.amountCents,
          billingInterval: charge.billingInterval,
          confidenceScore: charge.confidenceScore,
        });
      }
    }

    // Convert to array and calculate monthly equivalent
    const merchants = Array.from(merchantMap.values()).map((m) => {
      let monthlyEquivalentCents = m.totalDrainedCents;

      // Adjust for interval
      if (m.billingInterval === 'yearly' && m.chargeCount > 0) {
        monthlyEquivalentCents = Math.round(m.totalDrainedCents / 12);
      } else if (m.billingInterval === 'weekly' && m.chargeCount > 0) {
        monthlyEquivalentCents = Math.round((m.totalDrainedCents / m.chargeCount) * 4.33);
      }

      const confidenceBadge =
        m.confidenceScore >= 0.9 ? 'high' : m.confidenceScore >= 0.7 ? 'medium' : 'low';

      return {
        ...m,
        monthlyEquivalentCents,
        confidenceBadge,
      };
    });

    // Sort by total drained
    merchants.sort((a, b) => b.totalDrainedCents - a.totalDrainedCents);

    return {
      success: true,
      data: merchants,
    };
  });

  // PATCH /wallet/instruments/:id
  server.patch<{
    Params: { id: string };
    Body: { displayName?: string; issuerColorHint?: string; isDefault?: boolean };
  }>('/instruments/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const { id } = request.params;
    const { displayName, issuerColorHint, isDefault } = request.body;

    // Verify instrument belongs to user
    const instrument = await prisma.fundingInstrument.findFirst({
      where: { id, userId },
    });

    if (!instrument) {
      return reply.status(404).send({ success: false, error: 'Funding instrument not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault === true) {
      await prisma.fundingInstrument.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    // Update instrument
    const updated = await prisma.fundingInstrument.update({
      where: { id },
      data: {
        ...(displayName && { displayName }),
        ...(issuerColorHint && { issuerColorHint }),
        ...(isDefault !== undefined && { isDefault }),
      },
    });

    return {
      success: true,
      data: updated,
    };
  });

  // POST /wallet/charges/reassign
  server.post<{ Body: { chargeIds: string[]; newFundingInstrumentId: string } }>(
    '/charges/reassign',
    async (request, reply) => {
      const userId = (request as any).userId;
      const { chargeIds, newFundingInstrumentId } = request.body;

      if (!chargeIds || chargeIds.length === 0) {
        return reply.status(400).send({ success: false, error: 'Missing chargeIds' });
      }

      // Verify new instrument belongs to user
      const newInstrument = await prisma.fundingInstrument.findFirst({
        where: { id: newFundingInstrumentId, userId },
      });

      if (!newInstrument) {
        return reply.status(404).send({ success: false, error: 'Target funding instrument not found' });
      }

      // Update charges
      const result = await prisma.subscriptionCharge.updateMany({
        where: {
          id: { in: chargeIds },
          userId,
        },
        data: {
          fundingInstrumentId: newFundingInstrumentId,
        },
      });

      return {
        success: true,
        data: {
          updatedCount: result.count,
        },
      };
    }
  );
}

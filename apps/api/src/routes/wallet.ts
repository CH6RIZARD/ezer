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

    // A SubscriptionCharge only ever carries merchantId, not the Subscription
    // row's own id — nothing in this response ever gave the client a real
    // subscription id to navigate with. wallet.tsx sent merchantId to
    // SubscriptionDetail labeled as subscriptionId on the theory that "it
    // resolves on the detail screen" — it never did; GET /subscriptions/:id
    // looks up by the Subscription's own primary key, which a merchant id
    // can never match, so every tap 404'd as "Subscription not found."
    const subscriptionIdByMerchant = new Map<string, string>();

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

    // One batched lookup for every merchant's real Subscription id, rather
    // than a query per row. A merchant can have at most one active/trial
    // Subscription per user (see the findFirst in cards.ts), so this is a
    // clean id, not a guess.
    const merchantIds = Array.from(merchantMap.keys());
    if (merchantIds.length > 0) {
      const subs = await prisma.subscription.findMany({
        where: { userId, merchantId: { in: merchantIds }, status: { in: ['active', 'trial'] } },
        select: { id: true, merchantId: true },
      });
      for (const s of subs) subscriptionIdByMerchant.set(s.merchantId, s.id);
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
        subscriptionId: subscriptionIdByMerchant.get(m.merchantId) ?? null,
        ...m,
        monthlyEquivalentCents,
        confidenceBadge,
      };
    });

    // Sort by total drained
    merchants.sort((a, b) => b.totalDrainedCents - a.totalDrainedCents);

    // Predicted charges: for a merchant with no REAL charge inside [start,
    // end] — most often because the range is "this month" and it's still
    // early in the month — project its most recent charge forward by one
    // billing interval. If that projected date falls inside the range, it's
    // a charge that hasn't posted yet, not a merchant that stopped billing.
    // A card's real recurring charges don't vanish just because the request
    // landed on the 1st; the UI uses this to show "predicted" instead of a
    // bare $0 that reads as "no subscriptions."
    const merchantIdsWithRealCharge = new Set(merchantMap.keys());
    const priorCharges = await prisma.subscriptionCharge.findMany({
      where: { userId, fundingInstrumentId: id, chargeTimestamp: { lt: start } },
      include: { merchant: true },
      orderBy: { chargeTimestamp: 'desc' },
    });

    function addInterval(date: Date, interval: string): Date {
      const d = new Date(date);
      if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else if (interval === 'weekly') d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1); // monthly and unknown both default to monthly
      return d;
    }

    const predicted: {
      merchantId: string;
      merchantName: string;
      logo?: string;
      amountCents: number;
      predictedDate: string;
    }[] = [];
    const seenPredicted = new Set<string>();

    for (const charge of priorCharges) {
      if (merchantIdsWithRealCharge.has(charge.merchantId)) continue;
      if (seenPredicted.has(charge.merchantId)) continue;
      seenPredicted.add(charge.merchantId); // priorCharges is sorted desc, so this is its latest charge

      const nextDate = addInterval(charge.chargeTimestamp, charge.billingInterval);
      if (nextDate >= start && nextDate <= end) {
        predicted.push({
          merchantId: charge.merchantId,
          merchantName: charge.merchantName,
          logo: charge.merchant.logo || undefined,
          amountCents: charge.amountCents,
          predictedDate: nextDate.toISOString(),
        });
      }
    }

    return {
      success: true,
      data: merchants,
      predicted: {
        items: predicted,
        totalCents: predicted.reduce((sum, p) => sum + p.amountCents, 0),
      },
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

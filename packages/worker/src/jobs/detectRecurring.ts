import { Job } from 'bullmq';
import { prisma } from '@ezer/db';
import { detectRecurrence, normalizeMerchantName } from '@ezer/shared';

export async function detectRecurringSubscriptionsJob(job: Job) {
  const { userId } = job.data;

  // Get all transactions for this user
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
  });

  // Detect recurring patterns
  const candidates = detectRecurrence(
    transactions.map((t) => ({
      merchant: t.merchantNameRaw,
      date: t.date,
      amount: t.amountCents,
    }))
  );

  // Create subscriptions for recurring transactions
  for (const candidate of candidates) {
    const merchantName = normalizeMerchantName(candidate.merchant);

    // Find or create merchant
    let merchant = await prisma.merchant.findFirst({
      where: { canonicalName: { equals: merchantName, mode: 'insensitive' } },
    });

    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          canonicalName: merchantName,
          fingerprintKeys: {
            domains: [],
            descriptors: [candidate.merchant],
            patterns: [merchantName.toLowerCase()],
          },
        },
      });
    }

    // Create or update subscription
    await prisma.subscription.upsert({
      where: {
        userId_merchantId: {
          userId,
          merchantId: merchant.id,
        },
      },
      create: {
        userId,
        merchantId: merchant.id,
        status: 'active',
        cadence: candidate.averageIntervalDays >= 355 ? 'yearly' : 'monthly',
      },
      update: {
        status: 'active',
      },
    });
  }

  return { success: true, subscriptionsDetected: candidates.length };
}

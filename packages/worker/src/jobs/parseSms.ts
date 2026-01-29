import { Job } from 'bullmq';
import { prisma } from '@ezer/db';
import { normalizeMerchantName } from '@ezer/shared';

export async function parseSmsJob(job: Job) {
  const { userId, from, body, timestamp } = job.data;

  // Simple SMS parsing (in production, this would use more sophisticated NLP)
  const amountMatch = body.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

  // Extract merchant name (simplified)
  const merchantMatch = body.match(/(?:from|to|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  const merchantRaw = merchantMatch ? merchantMatch[1] : 'Unknown';
  const merchantName = normalizeMerchantName(merchantRaw);

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
          descriptors: [merchantRaw],
          patterns: [merchantName.toLowerCase()],
        },
      },
    });
  }

  if (amount > 0) {
    // Get unknown funding instrument
    let unknown = await prisma.fundingInstrument.findFirst({
      where: {
        userId,
        brand: 'Unknown',
      },
    });

    if (!unknown) {
      unknown = await prisma.fundingInstrument.create({
        data: {
          userId,
          type: 'card',
          displayName: 'Unknown Card',
          brand: 'Unknown',
          last4: '0000',
        },
      });
    }

    await prisma.subscriptionCharge.create({
      data: {
        userId,
        merchantId: merchant.id,
        merchantName: merchant.canonicalName,
        amountCents: Math.round(amount * 100),
        currency: 'USD',
        billingInterval: 'unknown',
        chargeTimestamp: new Date(timestamp),
        fundingInstrumentId: unknown.id,
        inferenceSource: 'sms',
        confidenceScore: 0.6,
        evidenceRef: `sms-${from}-${timestamp}`,
      },
    });
  }

  return { success: true, merchantName, amount };
}

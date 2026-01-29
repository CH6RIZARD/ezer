import { Job } from 'bullmq';
import { prisma } from '@ezer/db';
import { extractFundingHint, normalizeMerchantName } from '@ezer/shared';

export async function parseEmailJob(job: Job) {
  const { userId, emailBody, emailSubject, from } = job.data;

  // Simple parsing logic (in production, this would be more sophisticated)
  const amountMatch = emailBody.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;

  // Check if it's a trial notice
  const trialKeywords = ['free trial', 'trial ends', 'trial will end'];
  const isTrial = trialKeywords.some((kw) => emailBody.toLowerCase().includes(kw));

  // Extract merchant from email domain
  const merchantMatch = from.match(/@([^.]+)\./);
  const merchantRaw = merchantMatch ? merchantMatch[1] : 'Unknown';
  const merchantName = normalizeMerchantName(merchantRaw);

  // Extract funding hint
  const fundingHint = extractFundingHint(emailBody);

  // Find or create merchant
  let merchant = await prisma.merchant.findFirst({
    where: { canonicalName: { equals: merchantName, mode: 'insensitive' } },
  });

  if (!merchant) {
    merchant = await prisma.merchant.create({
      data: {
        canonicalName: merchantName,
        fingerprintKeys: {
          domains: [merchantMatch ? merchantMatch[1] + '.com' : ''],
          descriptors: [merchantRaw],
          patterns: [merchantName.toLowerCase()],
        },
      },
    });
  }

  if (isTrial) {
    // Create trial
    const trialEndMatch = emailBody.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
    const trialEndDate = trialEndMatch ? new Date(trialEndMatch[1]) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // Find or create subscription
    let subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        merchantId: merchant.id,
        status: 'trial',
      },
    });

    if (!subscription) {
      subscription = await prisma.subscription.create({
        data: {
          userId,
          merchantId: merchant.id,
          status: 'trial',
          cadence: 'monthly',
        },
      });
    }

    await prisma.trial.upsert({
      where: { subscriptionId: subscription.id },
      create: {
        subscriptionId: subscription.id,
        trialEndDate,
        detectedFrom: 'email',
      },
      update: {
        trialEndDate,
      },
    });
  } else if (amount > 0) {
    // Create subscription charge
    // Determine funding instrument
    let fundingInstrumentId: string;

    if (fundingHint) {
      const instrument = await prisma.fundingInstrument.findFirst({
        where: {
          userId,
          brand: fundingHint.brand as any,
          last4: fundingHint.last4,
        },
      });
      fundingInstrumentId = instrument?.id || '';
    }

    if (!fundingInstrumentId) {
      // Assign to unknown
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

      fundingInstrumentId = unknown.id;
    }

    await prisma.subscriptionCharge.create({
      data: {
        userId,
        merchantId: merchant.id,
        merchantName: merchant.canonicalName,
        amountCents: Math.round(amount * 100),
        currency: 'USD',
        billingInterval: 'monthly',
        chargeTimestamp: new Date(),
        fundingInstrumentId,
        inferenceSource: 'email',
        confidenceScore: fundingHint ? 0.9 : 0.7,
        evidenceRef: `email-${Date.now()}`,
      },
    });
  }

  return { success: true, merchantName, amount, isTrial };
}

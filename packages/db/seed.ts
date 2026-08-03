import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Clear existing data
  await prisma.subscriptionCharge.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.cancelAttempt.deleteMany();
  await prisma.proofArtifact.deleteMany();
  await prisma.allocationPlan.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.decisionRule.deleteMany();
  await prisma.trial.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.fundingInstrument.deleteMany();
  await prisma.dataSource.deleteMany();
  await prisma.oAuthToken.deleteMany();
  await prisma.authAccount.deleteMany();
  await prisma.userFeatureFlag.deleteMany();
  await prisma.user.deleteMany();

  // Seed sample subscription data under a non-login fixture user.
  // Real app login requires Google / Apple / Microsoft / email auth — not this account.
  const user = await prisma.user.create({
    data: {
      email: 'seed@ezer.app',
      name: 'Seed User',
    },
  });

  console.log('✅ Created user:', user.email);

  // Create auth account (Google)
  await prisma.authAccount.create({
    data: {
      userId: user.id,
      provider: 'google',
      providerUserId: 'google-demo-user-123',
      email: user.email,
    },
  });

  // Create data sources
  await prisma.dataSource.createMany({
    data: [
      {
        userId: user.id,
        type: 'gmail',
        status: 'active',
      },
      {
        userId: user.id,
        type: 'csv',
        status: 'active',
      },
    ],
  });

  console.log('✅ Created data sources');

  // Create funding instruments
  const visaCard = await prisma.fundingInstrument.create({
    data: {
      userId: user.id,
      type: 'card',
      displayName: 'Chase Sapphire',
      brand: 'Visa',
      last4: '1234',
      issuerColorHint: '#003D79',
      isDefault: true,
    },
  });

  const amexCard = await prisma.fundingInstrument.create({
    data: {
      userId: user.id,
      type: 'card',
      displayName: 'Amex Gold',
      brand: 'Amex',
      last4: '0005',
      issuerColorHint: '#D4AF37',
      isDefault: false,
    },
  });

  const mastercardCard = await prisma.fundingInstrument.create({
    data: {
      userId: user.id,
      type: 'card',
      displayName: 'Capital One Venture',
      brand: 'Mastercard',
      last4: '7890',
      issuerColorHint: '#EB001B',
      isDefault: false,
    },
  });

  const unknownInstrument = await prisma.fundingInstrument.create({
    data: {
      userId: user.id,
      type: 'card',
      displayName: 'Unknown Card',
      brand: 'Unknown',
      last4: '0000',
      isDefault: false,
    },
  });

  console.log('✅ Created funding instruments');

  // Create merchants with cancellation playbooks
  const netflix = await prisma.merchant.create({
    data: {
      canonicalName: 'Netflix',
      fingerprintKeys: {
        domains: ['netflix.com'],
        descriptors: ['NETFLIX', 'NETFLIX.COM'],
        patterns: ['netflix'],
      },
      cancellationDifficulty: 2,
      cancellationPlaybook: {
        url: 'https://www.netflix.com/cancelplan',
        steps: 'Log in → Account → Cancel Membership → Confirm',
        expectedEndState: 'confirmation_screen',
        retentionSteps: 1,
        requiresLogin: true,
      },
    },
  });

  const spotify = await prisma.merchant.create({
    data: {
      canonicalName: 'Spotify',
      fingerprintKeys: {
        domains: ['spotify.com'],
        descriptors: ['SPOTIFY', 'Spotify Premium'],
        patterns: ['spotify'],
      },
      cancellationDifficulty: 2,
      cancellationPlaybook: {
        url: 'https://www.spotify.com/account/subscription/',
        steps: 'Log in → Account → Subscription → Cancel Premium',
        expectedEndState: 'confirmation_email',
        retentionSteps: 2,
        requiresLogin: true,
      },
    },
  });

  const adobe = await prisma.merchant.create({
    data: {
      canonicalName: 'Adobe Creative Cloud',
      fingerprintKeys: {
        domains: ['adobe.com'],
        descriptors: ['ADOBE', 'Adobe Systems'],
        patterns: ['adobe'],
      },
      cancellationDifficulty: 4,
      cancellationPlaybook: {
        url: 'https://account.adobe.com/plans',
        steps: 'Log in → Manage Plan → Cancel Plan → Navigate retention → Pay early termination fee',
        expectedEndState: 'both',
        retentionSteps: 4,
        requiresLogin: true,
      },
    },
  });

  const nytimes = await prisma.merchant.create({
    data: {
      canonicalName: 'The New York Times',
      fingerprintKeys: {
        domains: ['nytimes.com'],
        descriptors: ['NYTimes', 'NY Times', 'New York Times'],
        patterns: ['nytimes', 'ny times'],
      },
      cancellationDifficulty: 3,
      cancellationPlaybook: {
        url: 'https://myaccount.nytimes.com/seg/settings',
        steps: 'Log in → Settings → Manage Subscription → Cancel',
        expectedEndState: 'confirmation_email',
        retentionSteps: 2,
        requiresLogin: true,
      },
    },
  });

  const gymMembership = await prisma.merchant.create({
    data: {
      canonicalName: 'FitLife Gym',
      fingerprintKeys: {
        domains: ['fitlifegym.com'],
        descriptors: ['FITLIFE', 'Fit Life Gym'],
        patterns: ['fitlife', 'gym'],
      },
      cancellationDifficulty: 5,
      // cancellationPlaybook omitted - Manual only, requires in-person visit
    },
  });

  const chatgpt = await prisma.merchant.create({
    data: {
      canonicalName: 'ChatGPT Plus',
      fingerprintKeys: {
        domains: ['openai.com'],
        descriptors: ['OpenAI', 'ChatGPT'],
        patterns: ['chatgpt', 'openai'],
      },
      cancellationDifficulty: 1,
      cancellationPlaybook: {
        url: 'https://platform.openai.com/account/billing',
        steps: 'Log in → Billing → Cancel Plan',
        expectedEndState: 'confirmation_screen',
        retentionSteps: 0,
        requiresLogin: true,
      },
    },
  });

  const hulu = await prisma.merchant.create({
    data: {
      canonicalName: 'Hulu',
      fingerprintKeys: {
        domains: ['hulu.com'],
        descriptors: ['HULU', 'Hulu LLC'],
        patterns: ['hulu'],
      },
      cancellationDifficulty: 2,
    },
  });

  const amazonPrime = await prisma.merchant.create({
    data: {
      canonicalName: 'Amazon Prime',
      fingerprintKeys: {
        domains: ['amazon.com'],
        descriptors: ['AMAZON', 'AMZN Prime', 'Amazon Prime'],
        patterns: ['amazon prime'],
      },
      cancellationDifficulty: 3,
      cancellationPlaybook: {
        url: 'https://www.amazon.com/mc',
        steps: 'Log in → Prime Membership → End Membership',
        expectedEndState: 'confirmation_screen',
        retentionSteps: 3,
        requiresLogin: true,
      },
    },
  });

  console.log('✅ Created merchants');

  // Create subscriptions
  const netflixSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: netflix.id,
      status: 'active',
      cadence: 'monthly',
      renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
    },
  });

  const spotifySub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: spotify.id,
      status: 'active',
      cadence: 'monthly',
      renewalDate: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000), // 22 days
    },
  });

  const adobeSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: adobe.id,
      status: 'active',
      cadence: 'monthly',
      renewalDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days
    },
  });

  const nytimesSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: nytimes.id,
      status: 'active',
      cadence: 'monthly',
      renewalDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    },
  });

  const gymSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: gymMembership.id,
      status: 'active',
      cadence: 'monthly',
      renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  const chatgptSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: chatgpt.id,
      status: 'trial',
      cadence: 'monthly',
    },
  });

  const huluSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: hulu.id,
      status: 'trial',
      cadence: 'monthly',
    },
  });

  const amazonSub = await prisma.subscription.create({
    data: {
      userId: user.id,
      merchantId: amazonPrime.id,
      status: 'trial',
      cadence: 'yearly',
    },
  });

  console.log('✅ Created subscriptions');

  // Create trials with different expiry dates
  await prisma.trial.create({
    data: {
      subscriptionId: chatgptSub.id,
      trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      detectedFrom: 'email',
    },
  });

  await prisma.trial.create({
    data: {
      subscriptionId: huluSub.id,
      trialEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days
      detectedFrom: 'email',
    },
  });

  await prisma.trial.create({
    data: {
      subscriptionId: amazonSub.id,
      trialEndDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      detectedFrom: 'sms',
    },
  });

  console.log('✅ Created trials');

  // Helper function to create monthly charges going back 6 months
  const createChargeHistory = async (
    subscriptionId: string,
    merchantId: string,
    merchantName: string,
    fundingInstrumentId: string,
    monthlyAmountCents: number,
    monthsBack: number = 6,
    priceIncrease?: { afterMonth: number; newAmount: number }
  ) => {
    const charges = [];
    const now = new Date();

    for (let i = 0; i < monthsBack; i++) {
      const chargeDate = new Date(now);
      chargeDate.setMonth(chargeDate.getMonth() - i);
      chargeDate.setDate(15); // Mid-month

      let amount = monthlyAmountCents;
      if (priceIncrease && i < priceIncrease.afterMonth) {
        amount = priceIncrease.newAmount;
      }

      charges.push({
        userId: user.id,
        merchantId,
        merchantName,
        amountCents: amount,
        currency: 'USD',
        billingInterval: 'monthly' as const,
        chargeTimestamp: chargeDate,
        fundingInstrumentId,
        inferenceSource: 'email' as const,
        confidenceScore: 0.95,
        evidenceRef: `email-${subscriptionId}-${i}`,
      });
    }

    await prisma.subscriptionCharge.createMany({ data: charges });

    // Create price history
    const priceHistoryEntries = [];
    for (let i = 0; i < monthsBack; i++) {
      const monthDate = new Date(now);
      monthDate.setMonth(monthDate.getMonth() - i);
      const monthStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

      let amount = monthlyAmountCents;
      if (priceIncrease && i < priceIncrease.afterMonth) {
        amount = priceIncrease.newAmount;
      }

      priceHistoryEntries.push({
        subscriptionId,
        month: monthStr,
        amountCents: amount,
      });
    }

    await prisma.priceHistory.createMany({ data: priceHistoryEntries });
  };

  // Netflix - $15.49/month, increased from $13.99 after month 3 (price creep example)
  await createChargeHistory(
    netflixSub.id,
    netflix.id,
    'Netflix',
    visaCard.id,
    1549,
    6,
    { afterMonth: 3, newAmount: 1549 }
  );

  // Spotify - $10.99/month (stable)
  await createChargeHistory(
    spotifySub.id,
    spotify.id,
    'Spotify Premium',
    amexCard.id,
    1099,
    6
  );

  // Adobe - $54.99/month, increased from $52.99 after month 2 (price creep example)
  await createChargeHistory(
    adobeSub.id,
    adobe.id,
    'Adobe Creative Cloud',
    visaCard.id,
    5499,
    6,
    { afterMonth: 2, newAmount: 5499 }
  );

  // NY Times - $17/month
  await createChargeHistory(
    nytimesSub.id,
    nytimes.id,
    'The New York Times',
    mastercardCard.id,
    1700,
    6
  );

  // Gym - $79/month
  await createChargeHistory(
    gymSub.id,
    gymMembership.id,
    'FitLife Gym',
    unknownInstrument.id,
    7900,
    6
  );

  console.log('✅ Created subscription charges and price history');

  // Create some allocation plans and ledger entries
  const currentMonth = new Date();
  const currentMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

  await prisma.ledgerEntry.create({
    data: {
      userId: user.id,
      month: currentMonthStr,
      reclaimedCents: 0,
      allocatedCents: 0,
    },
  });

  console.log('✅ Created ledger entries');

  // Create feature flags
  await prisma.userFeatureFlag.createMany({
    data: [
      { userId: user.id, flagKey: 'FEATURE_PLAID', enabled: false },
      { userId: user.id, flagKey: 'FEATURE_APPSTORE', enabled: false },
    ],
  });

  console.log('✅ Created feature flags');

  console.log('🎉 Seed completed successfully!');
  console.log('');
  console.log('Demo user:', user.email);
  console.log('User ID:', user.id);
  console.log('Subscriptions created:', 8);
  console.log('Active trials:', 3);
  console.log('Funding instruments:', 4);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

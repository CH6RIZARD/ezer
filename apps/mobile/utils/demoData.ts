// =============================================================================
// EZER Mobile App - Demo Data
// Realistic mock data for development and API fallback
// =============================================================================

import type {
  FundingInstrument,
  SubscriptionCharge,
  Merchant,
  Trial,
  Subscription,
  AllocationPlan,
  LedgerEntry,
  HomeSummary,
} from '../types';

// =============================================================================
// Funding Instruments (Credit/Debit Cards)
// =============================================================================

export const demoFundingInstruments: FundingInstrument[] = [
  {
    id: '1',
    type: 'card',
    displayName: 'Chase Sapphire',
    brand: 'Visa',
    last4: '4832',
    issuerColorHint: '#1E3A8A',
    isDefault: true,
  },
  {
    id: '2',
    type: 'card',
    displayName: 'Amex Gold',
    brand: 'Amex',
    last4: '0005',
    issuerColorHint: '#D4AF37',
    isDefault: false,
  },
  {
    id: '3',
    type: 'card',
    displayName: 'Unknown Card',
    brand: 'Unknown',
    last4: '****',
    issuerColorHint: '#9CA3AF',
    isDefault: false,
  },
];

// =============================================================================
// Merchants
// =============================================================================

export const demoMerchants: Record<string, Merchant> = {
  netflix: {
    id: 'netflix',
    canonicalName: 'Netflix',
    fingerprintKeys: ['netflix.com', 'NETFLIX'],
    cancellationDifficulty: 'Easy',
    difficultyLastUpdatedAt: new Date('2024-12-01'),
    cancellationUrl: 'https://www.netflix.com/cancelplan',
  },
  spotify: {
    id: 'spotify',
    canonicalName: 'Spotify',
    fingerprintKeys: ['spotify.com', 'SPOTIFY'],
    cancellationDifficulty: 'Medium',
    difficultyLastUpdatedAt: new Date('2024-11-15'),
    cancellationUrl: 'https://www.spotify.com/account/subscription/',
  },
  adobe: {
    id: 'adobe',
    canonicalName: 'Adobe Creative Cloud',
    fingerprintKeys: ['adobe.com', 'ADOBE'],
    cancellationDifficulty: 'Hard',
    difficultyLastUpdatedAt: new Date('2024-12-10'),
    cancellationUrl: 'https://account.adobe.com/plans',
  },
  youtube: {
    id: 'youtube',
    canonicalName: 'YouTube Premium',
    fingerprintKeys: ['youtube.com', 'GOOGLE *YOUTUBE'],
    cancellationDifficulty: 'Easy',
    difficultyLastUpdatedAt: new Date('2024-10-20'),
    cancellationUrl: 'https://www.youtube.com/paid_memberships',
  },
  disney: {
    id: 'disney',
    canonicalName: 'Disney+',
    fingerprintKeys: ['disneyplus.com', 'DISNEY PLUS'],
    cancellationDifficulty: 'Easy',
    difficultyLastUpdatedAt: new Date('2024-11-01'),
    cancellationUrl: 'https://www.disneyplus.com/account/subscription',
  },
  apple: {
    id: 'apple',
    canonicalName: 'Apple Music',
    fingerprintKeys: ['apple.com', 'APPLE.COM/BILL'],
    cancellationDifficulty: 'Medium',
    difficultyLastUpdatedAt: new Date('2024-12-05'),
    cancellationUrl: 'https://support.apple.com/en-us/HT202039',
  },
  hulu: {
    id: 'hulu',
    canonicalName: 'Hulu',
    fingerprintKeys: ['hulu.com', 'HULU'],
    cancellationDifficulty: 'Easy',
    difficultyLastUpdatedAt: new Date('2024-11-20'),
    cancellationUrl: 'https://secure.hulu.com/account',
  },
  hbomax: {
    id: 'hbomax',
    canonicalName: 'HBO Max',
    fingerprintKeys: ['max.com', 'HBO MAX'],
    cancellationDifficulty: 'Medium',
    difficultyLastUpdatedAt: new Date('2024-12-01'),
    cancellationUrl: 'https://www.max.com/account',
  },
};

// =============================================================================
// Subscription Charges (6 months of history)
// =============================================================================

function generateCharges(): SubscriptionCharge[] {
  const charges: SubscriptionCharge[] = [];
  const now = new Date();

  // Netflix - $15.49/mo on Chase
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(15);
    charges.push({
      id: `netflix-${i}`,
      merchantId: 'netflix',
      merchantName: 'Netflix',
      amountCents: 1549,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '1',
      inferenceSource: 'transaction',
      confidenceScore: 0.95,
    });
  }

  // Spotify - $10.99/mo on Amex
  // Deliberately on card 2 so the Wallet carousel shows a different merchant
  // mix per card (card 1: Netflix + Disney+ + Apple Music, card 2: Adobe +
  // Spotify, card 3: YouTube Premium).
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(1);
    charges.push({
      id: `spotify-${i}`,
      merchantId: 'spotify',
      merchantName: 'Spotify',
      amountCents: 1099,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '2',
      inferenceSource: 'transaction',
      confidenceScore: 0.92,
    });
  }

  // Adobe Creative Cloud - $54.99/mo on Amex
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(20);
    charges.push({
      id: `adobe-${i}`,
      merchantId: 'adobe',
      merchantName: 'Adobe Creative Cloud',
      amountCents: 5499,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '2',
      inferenceSource: 'transaction',
      confidenceScore: 0.98,
    });
  }

  // YouTube Premium - $11.99/mo on Unknown
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(5);
    charges.push({
      id: `youtube-${i}`,
      merchantId: 'youtube',
      merchantName: 'YouTube Premium',
      amountCents: 1199,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '3',
      inferenceSource: 'email',
      confidenceScore: 0.88,
    });
  }

  // Disney+ - $7.99/mo on Chase
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(10);
    charges.push({
      id: `disney-${i}`,
      merchantId: 'disney',
      merchantName: 'Disney+',
      amountCents: 799,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '1',
      inferenceSource: 'transaction',
      confidenceScore: 0.94,
    });
  }

  // Apple Music - $10.99/mo on Chase (was $9.99 3 months ago)
  for (let i = 0; i < 6; i++) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    date.setDate(25);
    const amount = i >= 3 ? 999 : 1099; // Price increased 3 months ago
    charges.push({
      id: `apple-${i}`,
      merchantId: 'apple',
      merchantName: 'Apple Music',
      amountCents: amount,
      currency: 'USD',
      billingInterval: 'monthly',
      chargeTimestamp: date,
      fundingInstrumentId: '1',
      inferenceSource: 'transaction',
      confidenceScore: 0.91,
    });
  }

  return charges;
}

export const demoCharges: SubscriptionCharge[] = generateCharges();

// =============================================================================
// Trials
// =============================================================================

export const demoTrials: Trial[] = [
  {
    id: 'trial-1',
    subscriptionId: 'sub-hulu',
    merchantId: 'hulu',
    merchantName: 'Hulu',
    trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    detectedFrom: 'email',
    amountCentsAfterTrial: 799,
  },
  {
    id: 'trial-2',
    subscriptionId: 'sub-hbomax',
    merchantId: 'hbomax',
    merchantName: 'HBO Max',
    trialEndDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // 12 days from now
    detectedFrom: 'email',
    amountCentsAfterTrial: 1599,
  },
];

// =============================================================================
// Subscriptions (for upcoming renewals)
// =============================================================================

export const demoSubscriptions: Subscription[] = [
  {
    id: 'sub-netflix',
    userId: 'user-1',
    merchantId: 'netflix',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days
    startedAt: new Date('2023-01-15'),
  },
  {
    id: 'sub-spotify',
    userId: 'user-1',
    merchantId: 'spotify',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
    startedAt: new Date('2022-06-01'),
  },
  {
    id: 'sub-adobe',
    userId: 'user-1',
    merchantId: 'adobe',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000), // 22 days
    startedAt: new Date('2023-08-20'),
  },
  // ---------------------------------------------------------------------------
  // The five below were MISSING, and their absence was a routing bug, not just
  // thin data.
  //
  // demoMerchants and demoCharges both cover all eight merchants, and
  // demoTrials points at 'sub-hulu' and 'sub-hbomax' — subscriptions that did
  // not exist. Every screen that navigated with one of those ids (Alerts
  // "Manage" on a trial, the calendar day popover, Wallet's breakdown rows)
  // reached SubscriptionDetail, failed to match, and silently fell back to
  // demoSubscriptions[0] — so tapping Hulu opened Netflix.
  //
  // Ids follow `sub-<merchantId>` so a merchantId can always be resolved to its
  // subscription and back.
  // ---------------------------------------------------------------------------
  {
    id: 'sub-youtube',
    userId: 'user-1',
    merchantId: 'youtube',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000), // 9 days
    startedAt: new Date('2023-03-11'),
  },
  {
    id: 'sub-apple',
    userId: 'user-1',
    merchantId: 'apple',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
    startedAt: new Date('2021-11-05'),
  },
  {
    id: 'sub-disney',
    userId: 'user-1',
    merchantId: 'disney',
    status: 'active',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), // 18 days
    startedAt: new Date('2024-02-14'),
  },
  // These two are the trial-backed ones demoTrials references by id.
  {
    id: 'sub-hulu',
    userId: 'user-1',
    merchantId: 'hulu',
    status: 'trial',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // matches trial-1
    startedAt: new Date(Date.now() - 23 * 24 * 60 * 60 * 1000),
  },
  {
    id: 'sub-hbomax',
    userId: 'user-1',
    merchantId: 'hbomax',
    status: 'trial',
    cadence: 'monthly',
    renewalDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // matches trial-2
    startedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
  },
];

// =============================================================================
// Ledger & Allocations (for Saved tab)
// =============================================================================

const currentMonth = new Date().toISOString().slice(0, 7); // "2025-01"

export const demoLedgerEntry: LedgerEntry = {
  id: 'ledger-1',
  userId: 'user-1',
  month: currentMonth,
  reclaimedCents: 7500, // $75.00 reclaimed this month
  allocatedCents: 7500,
};

export const demoAllocations: AllocationPlan[] = [
  {
    id: 'alloc-1',
    userId: 'user-1',
    month: currentMonth,
    amountCents: 4500,
    target: 'savings',
    note: 'From canceled Audible',
  },
  {
    id: 'alloc-2',
    userId: 'user-1',
    month: currentMonth,
    amountCents: 2000,
    target: 'debt',
    note: 'From canceled Peacock',
  },
  {
    id: 'alloc-3',
    userId: 'user-1',
    month: currentMonth,
    amountCents: 1000,
    target: 'investing',
    note: 'From canceled Paramount+',
  },
];

// =============================================================================
// Home Summary — computed from subscriptions + charges (single source of truth)
// Dashboard and detail screens (MonthlyBurn, RiskDetail, SilentSubscriptions) use this.
// =============================================================================

function daysUntil(date: Date): number {
  const now = new Date();
  const targetDate = new Date(date);
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getComputedHomeSummary(): HomeSummary {
  // Monthly Burn: same logic as MonthlyBurn screen — sum of latest charge per active subscription
  const monthlyBurnCents = demoSubscriptions.reduce((sum, sub) => {
    const charges = demoCharges.filter((c) => c.merchantId === sub.merchantId);
    const lastCharge = charges.sort(
      (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
    )[0];
    return sum + (lastCharge?.amountCents || 0);
  }, 0);

  // 30-Day Risk: renewals in 0–30 days + trials ending in 0–30 days (same logic as RiskDetail)
  //
  // Subscriptions still in trial are excluded from the renewal side: their
  // conversion is already counted by riskFromTrials below, on the same date.
  // Counting both would double the exposure for every trialling merchant, and
  // put it on the calendar twice. Must stay in step with demoApiRisks().
  const trialSubscriptionIds = new Set(demoTrials.map((t) => t.subscriptionId));

  const riskFromRenewals = demoSubscriptions
    .filter((sub) => {
      if (sub.status === 'trial' || trialSubscriptionIds.has(sub.id)) return false;
      const days = daysUntil(sub.renewalDate);
      return days >= 0 && days <= 30;
    })
    .reduce((sum, sub) => {
      const charges = demoCharges.filter((c) => c.merchantId === sub.merchantId);
      const lastCharge = charges.sort(
        (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
      )[0];
      return sum + (lastCharge?.amountCents || 0);
    }, 0);
  const riskFromTrials = demoTrials
    .filter((t) => {
      const days = daysUntil(t.trialEndDate);
      return days >= 0 && days <= 30;
    })
    .reduce((sum, t) => sum + t.amountCentsAfterTrial, 0);
  const next30DayRiskCents = riskFromRenewals + riskFromTrials;

  // Silent count: number of subscriptions we show on Silent Subscriptions screen (all active subs)
  const silentSubscriptionCount = demoSubscriptions.length;

  return {
    monthlyBurnCents,
    next30DayRiskCents,
    silentSubscriptionCount,
  };
}

/** @deprecated Use getComputedHomeSummary() so dashboard matches detail screens. */
export const demoHomeSummary: HomeSummary = getComputedHomeSummary();

// =============================================================================
// Helper function to get merchant by ID
// =============================================================================

export function getMerchantById(merchantId: string): Merchant | undefined {
  return demoMerchants[merchantId];
}

// =============================================================================
// Helper to get charges for a specific funding instrument
// =============================================================================

export function getChargesForCard(fundingInstrumentId: string): SubscriptionCharge[] {
  return demoCharges.filter((c) => c.fundingInstrumentId === fundingInstrumentId);
}

// =============================================================================
// Helper to group charges by merchant
// =============================================================================

export function groupChargesByMerchant(charges: SubscriptionCharge[]): Record<string, SubscriptionCharge[]> {
  return charges.reduce(
    (acc, charge) => {
      if (!acc[charge.merchantId]) {
        acc[charge.merchantId] = [];
      }
      acc[charge.merchantId].push(charge);
      return acc;
    },
    {} as Record<string, SubscriptionCharge[]>
  );
}

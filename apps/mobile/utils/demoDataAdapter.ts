// =============================================================================
// EZER Mobile App - Demo Data Adapter
//
// The detail screens (MonthlyBurn, RiskDetail, CardDetail, …) import demoData
// directly, but the dashboard and wallet tabs read from DataContext, which is
// wired to the API. With no API server running, those tabs rendered $0.00 and
// "0 subscriptions" while the detail screens showed real figures — the same
// numbers, two different sources.
//
// This module maps the demo domain objects onto the API response shapes that
// DataContext exposes, so both paths agree. Note the field names genuinely
// differ between the two worlds (types/index.ts uses `monthlyBurnCents`,
// DataContext uses `monthlyBurnRate`); that mapping is the point of this file.
// =============================================================================

import {
  demoFundingInstruments,
  demoSubscriptions,
  demoTrials,
  demoCharges,
  getComputedHomeSummary,
  getMerchantById,
  getChargesForCard,
  groupChargesByMerchant,
} from './demoData';
import { daysUntil, getMonthlyEquivalent, getConfidenceLevel } from './calculations';
import type {
  HomeSummary as ApiHomeSummary,
  RiskItem,
  FundingInstrument as ApiFundingInstrument,
  InstrumentSummary,
  MerchantCharge,
  Subscription as ApiSubscription,
} from '../contexts/DataContext';

/** Latest charge amount for a merchant — mirrors the MonthlyBurn screen's logic. */
function latestChargeCents(merchantId: string): number {
  const charges = demoCharges.filter(c => c.merchantId === merchantId);
  const latest = charges.sort(
    (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
  )[0];
  return latest?.amountCents || 0;
}

function merchantName(merchantId: string): string {
  return getMerchantById(merchantId)?.canonicalName ?? merchantId;
}

function merchantLogo(merchantId: string): string | undefined {
  return getMerchantById(merchantId)?.logo;
}

/**
 * Dashboard tiles. getComputedHomeSummary() is the same function the detail
 * screens agree with, so Home now matches MonthlyBurn instead of showing $0.00.
 */
export function demoApiHomeSummary(): ApiHomeSummary {
  const computed = getComputedHomeSummary();
  return {
    monthlyBurnRate: computed.monthlyBurnCents,
    next30DayRisk: computed.next30DayRiskCents,
    silentSubscriptionsCount: computed.silentSubscriptionCount,
    totalSubscriptions: demoSubscriptions.length,
    activeTrials: demoTrials.length,
  };
}

/**
 * Upcoming renewals and trial conversions inside 30 days — the same window
 * getComputedHomeSummary() uses for its risk total, so the calendar agrees
 * with the "30-Day Risk" tile.
 */
export function demoApiRisks(): RiskItem[] {
  // A subscription that is still in its trial must NOT also emit a renewal.
  //
  // Its conversion is already represented by the trial entry below, on the same
  // date, so emitting both put the merchant on the calendar twice — once as
  // "Renewal $0.00" (there is no charge history yet, because it has never been
  // billed) and once as "Trial ends — becomes $15.99/mo". Two rows, one event,
  // and the meaningless one listed first.
  const trialSubscriptionIds = new Set(demoTrials.map(t => t.subscriptionId));

  const renewals: RiskItem[] = demoSubscriptions
    .filter(sub => {
      if (sub.status === 'trial' || trialSubscriptionIds.has(sub.id)) return false;

      // No charge history means no known price, and a renewal we cannot price
      // is not something to warn anyone about.
      if (latestChargeCents(sub.merchantId) <= 0) return false;

      const days = daysUntil(sub.renewalDate);
      return days >= 0 && days <= 30;
    })
    .map(sub => ({
      id: `renewal-${sub.id}`,
      type: 'renewal' as const,
      merchantName: merchantName(sub.merchantId),
      logo: merchantLogo(sub.merchantId),
      amountCents: latestChargeCents(sub.merchantId),
      dueDate: new Date(sub.renewalDate).toISOString(),
      daysUntilDue: daysUntil(sub.renewalDate),
      subscriptionId: sub.id,
    }));

  const trials: RiskItem[] = demoTrials
    .filter(t => {
      const days = daysUntil(t.trialEndDate);
      return days >= 0 && days <= 30;
    })
    .map(t => ({
      id: `trial-${t.id}`,
      type: 'trial' as const,
      merchantName: t.merchantName,
      logo: merchantLogo(t.merchantId),
      amountCents: t.amountCentsAfterTrial,
      dueDate: new Date(t.trialEndDate).toISOString(),
      daysUntilDue: daysUntil(t.trialEndDate),
      subscriptionId: t.subscriptionId,
      trialId: t.id,
    }));

  return [...renewals, ...trials].sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

/** Wallet carousel cards. Shape already matches the API contract. */
export function demoApiInstruments(): ApiFundingInstrument[] {
  return demoFundingInstruments as ApiFundingInstrument[];
}

/** Demo subscriptions carry Date objects and no merchantName; the API sends strings. */
export function demoApiSubscriptions(): ApiSubscription[] {
  return demoSubscriptions.map(sub => ({
    id: sub.id,
    merchantId: sub.merchantId,
    merchantName: merchantName(sub.merchantId),
    logo: merchantLogo(sub.merchantId),
    status: sub.status,
    cadence: sub.cadence,
    renewalDate: sub.renewalDate ? new Date(sub.renewalDate).toISOString() : undefined,
    startedAt: new Date(sub.startedAt).toISOString(),
    // Carried so the calendar can project this subscription into any month,
    // not just the 30-day window where the risk feed happens to know its price.
    amountCents: latestChargeCents(sub.merchantId),
  }));
}

/** Per-card merchant breakdown, used by the Wallet "Review Card Drain" list. */
export function demoApiMerchants(instrumentId: string): MerchantCharge[] {
  const grouped = groupChargesByMerchant(getChargesForCard(instrumentId));

  return Object.entries(grouped)
    .map(([merchantId, charges]) => {
      const latest = charges
        .slice()
        .sort(
          (a, b) => new Date(b.chargeTimestamp).getTime() - new Date(a.chargeTimestamp).getTime()
        )[0];
      const totalDrainedCents = charges.reduce((sum, c) => sum + c.amountCents, 0);

      return {
        merchantId,
        merchantName: latest?.merchantName ?? merchantName(merchantId),
        logo: merchantLogo(merchantId),
        chargeCount: charges.length,
        totalDrainedCents,
        monthlyEquivalentCents: latest
          ? getMonthlyEquivalent(latest.amountCents, latest.billingInterval)
          : 0,
        billingInterval: latest?.billingInterval ?? 'monthly',
        confidenceBadge: (getConfidenceLevel(latest?.confidenceScore ?? 0).toLowerCase() ??
          'low') as 'high' | 'medium' | 'low',
      };
    })
    .sort((a, b) => b.totalDrainedCents - a.totalDrainedCents);
}

/** Per-card totals for the Wallet "Total Drained" header. */
export function demoApiInstrumentSummary(instrumentId: string): InstrumentSummary | null {
  const instrument = demoFundingInstruments.find(i => i.id === instrumentId);
  if (!instrument) return null;

  const merchants = demoApiMerchants(instrumentId);

  return {
    ...(instrument as ApiFundingInstrument),
    drainedAmountCents: merchants.reduce((sum, m) => sum + m.totalDrainedCents, 0),
    activeSubscriptionsCount: merchants.length,
    topMerchants: merchants.slice(0, 5).map(m => ({
      merchantId: m.merchantId,
      merchantName: m.merchantName,
      logo: m.logo,
      drainedAmountCents: m.totalDrainedCents,
    })),
  };
}

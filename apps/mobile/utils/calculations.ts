// =============================================================================
// EZER Mobile App - Calculation Utilities
// =============================================================================

import type { SubscriptionCharge, DateRange, DateRangeType, BillingInterval } from '../types';

function formatRangeLabel(start: Date, end: Date): string {
  const s = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const e = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${s} – ${e}`;
}

/**
 * Single canonical resolver: given type and optional custom dates, returns DateRange.
 * Used by DateRangeContext and anywhere we need start/end/label.
 */
export function getResolvedDateRange(
  type: DateRangeType,
  charges?: SubscriptionCharge[],
  customStart?: Date,
  customEnd?: Date
): DateRange {
  const now = new Date();
  const end = new Date(now);
  let start: Date;
  let label: string;

  switch (type) {
    case 'custom':
      if (customStart && customEnd) {
        start = new Date(customStart);
        const endDate = new Date(customEnd);
        label = formatRangeLabel(start, endDate);
        return { type: 'custom', start, end: endDate, label };
      }
      // Fallback to this month if custom not set
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = 'This Month';
      return { type: 'thisMonth', start, end, label };
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = 'This Month';
      break;
    case 'lastYear':
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      label = 'Last Year';
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      label = 'This Month';
  }

  return { type, start, end, label };
}

/**
 * Calculate total drain for a specific card within a date range
 */
export function calculateDrain(
  charges: SubscriptionCharge[],
  fundingInstrumentId: string,
  dateRange: DateRange
): number {
  return (
    charges
      .filter((c) => c.fundingInstrumentId === fundingInstrumentId)
      .filter((c) => {
        const timestamp = new Date(c.chargeTimestamp);
        return timestamp >= dateRange.start && timestamp <= dateRange.end;
      })
      .reduce((sum, c) => sum + c.amountCents, 0) / 100
  );
}

/**
 * Calculate investment opportunity cost at 7% annualized compound interest
 * This shows what the money would be worth today if invested instead of spent
 */
export function calculateOpportunityCost(monthlyAmount: number, months: number): number {
  const monthlyRate = 0.07 / 12; // 7% annual rate converted to monthly
  let futureValue = 0;

  for (let i = 0; i < months; i++) {
    // Each month's contribution grows for (months - i) months
    futureValue += monthlyAmount * Math.pow(1 + monthlyRate, months - i);
  }

  return Math.round(futureValue * 100) / 100;
}

/**
 * Get monthly equivalent for different billing intervals
 */
export function getMonthlyEquivalent(amountCents: number, billingInterval: BillingInterval): number {
  switch (billingInterval) {
    case 'yearly':
      return amountCents / 12 / 100;
    case 'weekly':
      return (amountCents * 52) / 12 / 100;
    case 'monthly':
    case 'unknown':
    default:
      return amountCents / 100;
  }
}

/**
 * Format cents to dollar string
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Format dollars to string
 */
export function formatDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

/**
 * @deprecated Use getResolvedDateRange from DateRangeContext / calculations instead.
 * Legacy getDateRange for callers that only have preset keys; returns range with type.
 */
export function getDateRange(
  type: 'thisMonth' | 'lastYear' | 'custom',
  charges?: SubscriptionCharge[],
  customStart?: Date,
  customEnd?: Date
): DateRange {
  return getResolvedDateRange(type, charges, customStart, customEnd);
}

/**
 * Calculate days until a date
 */
export function daysUntil(date: Date): number {
  const now = new Date();
  const targetDate = new Date(date);
  const diffTime = targetDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format date as "Jan 15, 2025"
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format billing interval for display
 */
export function formatBillingInterval(interval: BillingInterval): string {
  switch (interval) {
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'weekly':
      return 'Weekly';
    default:
      return 'Unknown';
  }
}

/**
 * Get confidence level label from score
 */
export function getConfidenceLevel(score: number): 'High' | 'Medium' | 'Low' {
  if (score >= 0.8) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
}

/**
 * Calculate lifetime total from charges
 */
export function calculateLifetimeTotal(charges: SubscriptionCharge[]): number {
  return charges.reduce((sum, c) => sum + c.amountCents, 0) / 100;
}

/**
 * Group charges by month for price timeline
 */
export function groupChargesByMonth(
  charges: SubscriptionCharge[]
): Array<{ month: string; amountCents: number }> {
  const grouped: Record<string, number> = {};

  charges.forEach((charge) => {
    const date = new Date(charge.chargeTimestamp);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    if (!grouped[monthLabel]) {
      grouped[monthLabel] = 0;
    }
    grouped[monthLabel] += charge.amountCents;
  });

  return Object.entries(grouped)
    .map(([month, amountCents]) => ({ month, amountCents }))
    .sort((a, b) => {
      // Sort by date descending (most recent first)
      return new Date(b.month).getTime() - new Date(a.month).getTime();
    });
}

/**
 * Calculate months of subscription history
 */
export function calculateMonthsOfHistory(charges: SubscriptionCharge[]): number {
  if (charges.length === 0) return 0;

  const dates = charges.map((c) => new Date(c.chargeTimestamp).getTime());
  const earliest = Math.min(...dates);
  const latest = Math.max(...dates);

  const monthsDiff = (latest - earliest) / (1000 * 60 * 60 * 24 * 30);
  return Math.max(1, Math.ceil(monthsDiff));
}

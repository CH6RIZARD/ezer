// =============================================================================
// EZER Mobile App - Calculation Utilities
// =============================================================================

import type { SubscriptionCharge, BillingInterval } from '../types';

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

// One formatter, reused — constructing Intl.NumberFormat per call is the
// expensive part.
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/**
 * Format cents to dollar string. Intl gets grouping right ("$1,549.00"), which
 * the old toFixed(2) template never did; non-finite input renders as $0.00
 * instead of "$NaN" on screen.
 */
export function formatCents(cents: number): string {
  return USD.format(Number.isFinite(cents) ? cents / 100 : 0);
}

/**
 * Format dollars to string
 */
export function formatDollars(dollars: number): string {
  return USD.format(Number.isFinite(dollars) ? dollars : 0);
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

// ============================================================================
// Merchant Normalization
// ============================================================================

export function normalizeMerchantName(rawName: string): string {
  // Remove common suffixes
  let normalized = rawName
    .replace(/\s+(inc|llc|ltd|corp|corporation|co)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toLowerCase();

  // Common mappings
  const mappings: Record<string, string> = {
    'nyt': 'new york times',
    'ny times': 'new york times',
    'amzn': 'amazon',
    'aapl': 'apple',
    'msft': 'microsoft',
    'googl': 'google',
  };

  for (const [key, value] of Object.entries(mappings)) {
    if (normalized.includes(key)) {
      normalized = value;
      break;
    }
  }

  return normalized;
}

// ============================================================================
// Recurrence Detection
// ============================================================================

export interface RecurrenceCandidate {
  merchant: string;
  dates: Date[];
  amounts: number[];
  averageAmount: number;
  averageIntervalDays: number;
  isRecurring: boolean;
}

export function detectRecurrence(
  transactions: Array<{ merchant: string; date: Date; amount: number }>
): RecurrenceCandidate[] {
  const byMerchant = new Map<string, Array<{ date: Date; amount: number }>>();

  for (const tx of transactions) {
    const normalized = normalizeMerchantName(tx.merchant);
    if (!byMerchant.has(normalized)) byMerchant.set(normalized, []);
    byMerchant.get(normalized)!.push({ date: tx.date, amount: tx.amount });
  }

  const candidates: RecurrenceCandidate[] = [];

  for (const [merchant, txs] of byMerchant.entries()) {
    // THREE transactions minimum, not two.
    //
    // Two charges give exactly ONE interval, and one interval is not a pattern
    // — it cannot be distinguished from coincidence. That is why sandbox data
    // produced "subscriptions" for KFC and United Airlines: two unrelated
    // purchases that happened to fall ~30 days apart. Three charges give two
    // intervals, which can agree or disagree, and that is the cheapest signal
    // that something actually repeats.
    if (txs.length < 3) continue;

    txs.sort((a, b) => a.date.getTime() - b.date.getTime());

    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      intervals.push(
        Math.floor((txs[i].date.getTime() - txs[i - 1].date.getTime()) / (1000 * 60 * 60 * 24))
      );
    }

    const amounts = txs.map((t) => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // AMOUNT CONSISTENCY — the check that was missing entirely.
    //
    // A subscription bills the same figure every cycle. Restaurants, airlines
    // and shops do not. Without this, the detector was really just asking
    // "did you buy from this merchant repeatedly?", which is true of a coffee
    // shop and says nothing about a recurring charge.
    //
    // Spread is measured against the MEDIAN rather than the mean so one
    // unusual charge cannot drag the centre and hide the variation.
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const maxDeviation = median === 0 ? 1 : Math.max(...amounts.map((a) => Math.abs(a - median) / median));
    // 5% absorbs tax/FX drift and a price rise mid-history; it does not absorb
    // a different meal costing a different amount.
    const amountsConsistent = maxDeviation <= 0.05;

    // INTERVAL CONSISTENCY. Every gap must fit the same cadence, and the gaps
    // must agree with each other — a merchant billed at 7, 30 and 90 days is
    // not on a cycle.
    const fits = (lo: number, hi: number) => intervals.every((d) => d >= lo && d <= hi);
    const isWeekly = fits(6, 8);
    const isBiweekly = fits(13, 16);
    const isMonthly = fits(26, 35);
    const isQuarterly = fits(85, 95);
    const isYearly = fits(355, 375);

    const intervalSpread = Math.max(...intervals) - Math.min(...intervals);
    // Monthly billing legitimately varies by a few days (month lengths, weekend
    // posting). Beyond a week apart, the gaps are not the same cadence.
    const intervalsAgree = intervalSpread <= 7 || isYearly || isQuarterly;

    const cadenceMatches = isWeekly || isBiweekly || isMonthly || isQuarterly || isYearly;
    const isRecurring = cadenceMatches && intervalsAgree && amountsConsistent;

    candidates.push({
      merchant,
      dates: txs.map((t) => t.date),
      amounts: txs.map((t) => t.amount),
      averageAmount: avgAmount,
      averageIntervalDays: avgInterval,
      isRecurring,
    });
  }

  return candidates.filter((c) => c.isRecurring);
}


// ============================================================================
// Price Creep Detection
// ============================================================================

export interface PriceCreep {
  subscriptionId: string;
  previousAmountCents: number;
  newAmountCents: number;
  increasePct: number;
  detectedAt: Date;
}

export function detectPriceCreep(
  priceHistory: Array<{ month: string; amountCents: number }>
): PriceCreep | null {
  if (priceHistory.length < 2) return null;

  // Sort by month
  const sorted = [...priceHistory].sort((a, b) => a.month.localeCompare(b.month));

  // Check last two months
  const current = sorted[sorted.length - 1];
  const previous = sorted[sorted.length - 2];

  if (current.amountCents <= previous.amountCents) return null;

  const increasePct =
    ((current.amountCents - previous.amountCents) / previous.amountCents) * 100;

  // Only flag if increase is > 3%
  if (increasePct <= 3) return null;

  return {
    subscriptionId: '', // To be filled by caller
    previousAmountCents: previous.amountCents,
    newAmountCents: current.amountCents,
    increasePct,
    detectedAt: new Date(),
  };
}

// ============================================================================
// Funding Instrument Attribution
// ============================================================================

export interface FundingHint {
  brand: 'Visa' | 'Mastercard' | 'Amex' | 'Discover' | 'Unknown';
  last4: string;
}

export function extractFundingHint(text: string): FundingHint | null {
  // Patterns: "Visa •••• 1234", "Visa ending in 1234", "Amex **** 0005"
  const patterns = [
    /\b(Visa|Mastercard|Amex|American Express|Discover)\s*[•*]+\s*(\d{4})\b/i,
    /\b(Visa|Mastercard|Amex|American Express|Discover)\s+ending\s+(?:in\s+)?(\d{4})\b/i,
    /\b(Visa|Mastercard|Amex|American Express|Discover)\s+\*+\s*(\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let brand = match[1].toLowerCase();
      if (brand === 'american express') brand = 'amex';

      return {
        brand: (brand.charAt(0).toUpperCase() + brand.slice(1)) as FundingHint['brand'],
        last4: match[2],
      };
    }
  }

  return null;
}

// ============================================================================
// Investment Opportunity Cost (7% annualized)
// ============================================================================

export function calculateInvestmentOpportunityCost(
  monthlyAmountCents: number,
  monthsElapsed: number
): number {
  const monthlyRate = 0.07 / 12;
  let total = 0;

  for (let i = 0; i < monthsElapsed; i++) {
    total += monthlyAmountCents * Math.pow(1 + monthlyRate, monthsElapsed - i);
  }

  return Math.round(total);
}

// ============================================================================
// Date Range Helpers
// ============================================================================

export function getDateRange(range: string, customStart?: string, customEnd?: string) {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  switch (range) {
    case 'last30':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
      break;
    case 'thisMonth':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last90':
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 90);
      break;
    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error('Custom range requires startDate and endDate');
      }
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
      break;
    default:
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 30);
  }

  return { startDate, endDate };
}

// ============================================================================
// Difficulty Label
// ============================================================================

export function getDifficultyLabel(
  score: number
): 'Easy' | 'Medium' | 'Hard' | 'Very Hard' | 'Extreme' {
  if (score <= 1) return 'Easy';
  if (score <= 2) return 'Medium';
  if (score <= 3) return 'Hard';
  if (score <= 4) return 'Very Hard';
  return 'Extreme';
}

// ============================================================================
// Month String
// ============================================================================

export function getCurrentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// ============================================================================
// Subscription eligibility + recurrence
//
// Lives here rather than in the Plaid route so it can be unit-tested without a
// Plaid client, and so any future ingest source (email receipts, card network
// feeds) applies exactly the same rules.
// ============================================================================

/**
 * Plaid personal_finance_category primaries that can never be a subscription.
 *
 *   TRANSFER_IN/OUT  moving your own money — CD deposits, payroll ACH pushes
 *   LOAN_PAYMENTS    credit-card and loan payments
 *   INCOME           wages and deposits
 *   BANK_FEES        recurring, but not a subscription
 *
 * Amount sign is NOT sufficient on its own: a payroll-related account transfer
 * can arrive with a positive (money-out) amount and sail past a `amount > 0`
 * check, which is how a real user's payroll was listed as a $5,850/mo
 * subscription.
 */
export const NON_SUBSCRIPTION_CATEGORIES = [
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'INCOME',
  'BANK_FEES',
] as const;

/**
 * DETAILED categories that are never a subscription, however regular they look.
 *
 * The primary-category filter is not enough on its own. Timing cannot separate
 * a coffee habit from a streaming plan: in Plaid's sandbox every merchant —
 * KFC, McDonald's, United Airlines — arrives with exactly three charges, 30-day
 * gaps and an identical amount, which is precisely the signature of a real
 * subscription. Recurrence analysis says "monthly" and is right to.
 *
 * What actually separates them is WHAT was bought. A flight, a burger and a
 * tank of fuel are not subscriptions no matter how rhythmic the spending, so
 * they are excluded on category rather than on shape.
 *
 * Deliberately NOT excluded: PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS and
 * RENT_AND_UTILITIES_INTERNET_AND_CABLE. A gym membership and a broadband bill
 * are exactly what this feature is for.
 */
const NON_SUBSCRIPTION_DETAILED = [
  'FOOD_AND_DRINK_FAST_FOOD',
  'FOOD_AND_DRINK_COFFEE',
  'FOOD_AND_DRINK_RESTAURANT',
  'FOOD_AND_DRINK_GROCERIES',
  'TRAVEL_FLIGHTS',
  'TRAVEL_LODGING',
  'TRAVEL_RENTAL_CARS',
  'TRANSPORTATION_GAS',
  'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
  'TRANSPORTATION_BIKES_AND_SCOOTERS',
  'TRANSPORTATION_PARKING',
  'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
];

/** Legacy `category` fallback for items predating personal_finance_category. */
const NON_SUBSCRIPTION_LEGACY = ['transfer', 'payroll', 'deposit', 'interest', 'payment'];

/** Structural shape — deliberately not Plaid's `Transaction`, so this stays portable. */
export interface SubscriptionCandidateInput {
  /** Plaid convention: POSITIVE means money out of the account. */
  amount: number;
  /** personal_finance_category.primary, when the item provides it. */
  personalFinanceCategory?: string | null;
  /** personal_finance_category.detailed — what was actually bought. */
  personalFinanceCategoryDetailed?: string | null;
  /** Legacy category array. */
  categories?: string[] | null;
}

export function isSubscriptionCandidate(tx: SubscriptionCandidateInput): boolean {
  if (tx.amount <= 0) return false;

  const primary = tx.personalFinanceCategory;
  if (primary && (NON_SUBSCRIPTION_CATEGORIES as readonly string[]).includes(primary)) {
    return false;
  }

  const detailed = tx.personalFinanceCategoryDetailed;
  if (detailed && NON_SUBSCRIPTION_DETAILED.includes(detailed)) {
    return false;
  }

  if (!primary) {
    const legacy = (tx.categories ?? []).map(c => c.toLowerCase());
    if (legacy.some(c => NON_SUBSCRIPTION_LEGACY.includes(c))) return false;
  }

  return true;
}

/**
 * Strip bank-statement noise before canonicalising a merchant name.
 *
 * `normalizeMerchantName` only lowercases and drops punctuation, so
 * "ACH Electronic CreditGUSTO PAY 123456" canonicalised with its reference
 * number still attached. Anything carrying a per-transaction reference can
 * never group with its own siblings, so every charge looks like a new merchant.
 */
export function stripReferenceNumbers(raw: string): string {
  return raw
    .replace(/\b(?:ach|pos|ppd|ccd|web|tel|chk|ref|conf|trace|id)\b[\s#:*-]*/gi, ' ')
    .replace(/[*#]+\s*\d+/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export type BillingInterval = 'weekly' | 'monthly' | 'yearly' | 'unknown';

/**
 * Detect a billing interval, strictly.
 *
 * Requires at least THREE charges (two intervals) and every interval inside the
 * window — not their average. Averaging over as few as two transactions is how
 * one-off retail spending lands in the monthly window by luck; on a single
 * Plaid sandbox account it promoted KFC, McDonald's, Starbucks, United Airlines
 * and a bicycle shop to "monthly subscriptions".
 */
export function inferBillingInterval(dates: Date[]): BillingInterval {
  if (dates.length < 3) return 'unknown';

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (1000 * 60 * 60 * 24));
  }

  const all = (lo: number, hi: number) => gaps.every(g => g >= lo && g <= hi);

  if (all(6, 8)) return 'weekly';
  if (all(25, 35)) return 'monthly';
  if (all(355, 375)) return 'yearly';
  return 'unknown';
}

/** Widest allowed max/min ratio across a merchant's charges. */
export const MAX_AMOUNT_SPREAD = 1.25;

/**
 * Subscriptions bill a stable amount. Price rises are real, so this is a
 * tolerance rather than equality — but a merchant you spend a different amount
 * at every visit is a shop, not a subscription.
 */
export function hasStableAmount(amountsCents: number[]): boolean {
  const positive = amountsCents.filter(a => a > 0);
  if (positive.length < 2) return false;
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  if (min <= 0) return false;
  return max / min <= MAX_AMOUNT_SPREAD;
}

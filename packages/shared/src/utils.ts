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

  // Group by normalized merchant
  for (const tx of transactions) {
    const normalized = normalizeMerchantName(tx.merchant);
    if (!byMerchant.has(normalized)) {
      byMerchant.set(normalized, []);
    }
    byMerchant.get(normalized)!.push({ date: tx.date, amount: tx.amount });
  }

  const candidates: RecurrenceCandidate[] = [];

  // Analyze each merchant
  for (const [merchant, txs] of byMerchant.entries()) {
    if (txs.length < 2) continue;

    // Sort by date
    txs.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < txs.length; i++) {
      const daysDiff = Math.floor(
        (txs[i].date.getTime() - txs[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
      );
      intervals.push(daysDiff);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const avgAmount = txs.reduce((sum, tx) => sum + tx.amount, 0) / txs.length;

    // Check if interval is within recurring range (25-35 days for monthly)
    const isMonthly = intervals.every((interval) => interval >= 25 && interval <= 35);
    const isYearly = intervals.every((interval) => interval >= 355 && interval <= 375);
    const isWeekly = intervals.every((interval) => interval >= 6 && interval <= 8);

    const isRecurring = isMonthly || isYearly || isWeekly;

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

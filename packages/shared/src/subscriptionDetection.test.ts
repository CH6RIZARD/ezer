// =============================================================================
// Subscription detection — regression tests
//
// Every "reject" case below is a real row observed in a Plaid sandbox sync that
// the previous detector promoted to a subscription. Twelve were created from a
// single test account, including the user's own payroll.
//
// The "accept" cases exist to prove the tightened rules did not simply switch
// detection off — which is the obvious way to make false positives disappear.
// =============================================================================

import {
  isSubscriptionCandidate,
  stripReferenceNumbers,
  inferBillingInterval,
  hasStableAmount,
} from './utils';

/** Dates n days apart, oldest first. */
function everyNDays(n: number, count: number, jitter: number[] = []): Date[] {
  const base = new Date('2026-01-05T00:00:00Z').getTime();
  return Array.from({ length: count }, (_, i) => {
    const drift = jitter[i] ?? 0;
    return new Date(base + (i * n + drift) * 24 * 60 * 60 * 1000);
  });
}

describe('isSubscriptionCandidate', () => {
  it('rejects a payroll ACH even though its amount is POSITIVE', () => {
    // The actual bug: "ACH Electronic CreditGUSTO PAY 123456" arrived as a
    // +$5,850 TRANSFER_OUT, so an `amount > 0` guard let it through and the
    // user was shown their salary as a $5,850/month subscription.
    expect(
      isSubscriptionCandidate({ amount: 5850, personalFinanceCategory: 'TRANSFER_OUT' })
    ).toBe(false);
  });

  it('rejects credit-card and loan payments', () => {
    expect(
      isSubscriptionCandidate({ amount: 2078.5, personalFinanceCategory: 'LOAN_PAYMENTS' })
    ).toBe(false);
  });

  it('rejects a CD deposit', () => {
    expect(
      isSubscriptionCandidate({ amount: 1000, personalFinanceCategory: 'TRANSFER_OUT' })
    ).toBe(false);
  });

  it('rejects income and bank fees', () => {
    expect(isSubscriptionCandidate({ amount: 4200, personalFinanceCategory: 'INCOME' })).toBe(false);
    expect(isSubscriptionCandidate({ amount: 35, personalFinanceCategory: 'BANK_FEES' })).toBe(false);
  });

  it('rejects refunds and credits by sign', () => {
    expect(isSubscriptionCandidate({ amount: -15.99, personalFinanceCategory: 'ENTERTAINMENT' })).toBe(
      false
    );
  });

  it('accepts ordinary merchant spend, which recurrence then judges', () => {
    expect(isSubscriptionCandidate({ amount: 15.99, personalFinanceCategory: 'ENTERTAINMENT' })).toBe(
      true
    );
    // Internet/cable is a genuine subscription category.
    expect(
      isSubscriptionCandidate({ amount: 80, personalFinanceCategory: 'RENT_AND_UTILITIES' })
    ).toBe(true);
    // Food stays eligible — meal kits are real. The interval test rejects
    // a coffee habit, not the category filter.
    expect(isSubscriptionCandidate({ amount: 4.33, personalFinanceCategory: 'FOOD_AND_DRINK' })).toBe(
      true
    );
  });

  it('rejects what was BOUGHT, when timing alone cannot tell', () => {
    // Plaid's sandbox gives KFC, McDonald's and United Airlines exactly three
    // charges, 30-day gaps and identical amounts — the same shape as Netflix.
    // Recurrence analysis correctly calls that "monthly", so the only thing
    // that separates them is the category.
    const notSubs = [
      ['KFC', 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_FAST_FOOD'],
      ["McDonald's", 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_FAST_FOOD'],
      ['Starbucks', 'FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'],
      ['United Airlines', 'TRAVEL', 'TRAVEL_FLIGHTS'],
      ['Madison Bicycle Shop', 'TRANSPORTATION', 'TRANSPORTATION_BIKES_AND_SCOOTERS'],
      ['Shell', 'TRANSPORTATION', 'TRANSPORTATION_GAS'],
      ['FUN', 'GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES'],
    ] as const;

    for (const [name, primary, detailed] of notSubs) {
      expect(
        isSubscriptionCandidate({
          amount: 12,
          personalFinanceCategory: primary,
          personalFinanceCategoryDetailed: detailed,
        })
      ).toBe(false);
    }
  });

  it('still accepts the subscription-shaped categories', () => {
    // A gym and a broadband bill are exactly what this feature exists for, and
    // both live under primaries that are otherwise unremarkable.
    expect(
      isSubscriptionCandidate({
        amount: 78.5,
        personalFinanceCategory: 'PERSONAL_CARE',
        personalFinanceCategoryDetailed: 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
      })
    ).toBe(true);
    expect(
      isSubscriptionCandidate({
        amount: 80,
        personalFinanceCategory: 'RENT_AND_UTILITIES',
        personalFinanceCategoryDetailed: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
      })
    ).toBe(true);
    // A meal-kit box is FOOD_AND_DRINK but not fast food or coffee.
    expect(
      isSubscriptionCandidate({
        amount: 59.99,
        personalFinanceCategory: 'FOOD_AND_DRINK',
        personalFinanceCategoryDetailed: 'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK',
      })
    ).toBe(true);
  });

  it('falls back to the legacy category array when PFC is absent', () => {
    expect(isSubscriptionCandidate({ amount: 5850, categories: ['Transfer', 'Debit'] })).toBe(false);
    expect(isSubscriptionCandidate({ amount: 15.99, categories: ['Service', 'Subscription'] })).toBe(
      true
    );
  });
});

describe('stripReferenceNumbers', () => {
  it('removes the per-transaction reference that split one merchant into many', () => {
    expect(stripReferenceNumbers('ACH Electronic CreditGUSTO PAY 123456')).not.toMatch(/123456/);
  });

  it('removes masked card references', () => {
    expect(stripReferenceNumbers('CREDIT CARD 3333 PAYMENT *//')).not.toMatch(/3333/);
  });

  it('leaves ordinary merchant names recognisable', () => {
    expect(stripReferenceNumbers('Netflix')).toBe('Netflix');
    expect(stripReferenceNumbers('Touchstone Climbing')).toBe('Touchstone Climbing');
  });

  it('keeps short digit runs that are part of a brand', () => {
    // 3+ digit runs only; "24" in a brand name must survive.
    expect(stripReferenceNumbers('24 Hour Fitness')).toContain('24');
  });
});

describe('inferBillingInterval', () => {
  it('needs at least three charges — two is one interval, not a pattern', () => {
    expect(inferBillingInterval(everyNDays(30, 2))).toBe('unknown');
    expect(inferBillingInterval(everyNDays(30, 3))).toBe('monthly');
  });

  it('detects weekly, monthly and yearly', () => {
    expect(inferBillingInterval(everyNDays(7, 4))).toBe('weekly');
    expect(inferBillingInterval(everyNDays(30, 5))).toBe('monthly');
    expect(inferBillingInterval(everyNDays(365, 3))).toBe('yearly');
  });

  it('tolerates real-world drift inside the window', () => {
    // Month lengths vary; 28–31 day gaps are still monthly.
    expect(inferBillingInterval(everyNDays(30, 4, [0, -2, 1, -1]))).toBe('monthly');
  });

  it('rejects irregular spending that only AVERAGES to monthly', () => {
    // This is the KFC/Starbucks case: gaps of 5 and 55 days average to 30.
    const base = new Date('2026-01-05T00:00:00Z').getTime();
    const day = 24 * 60 * 60 * 1000;
    const irregular = [new Date(base), new Date(base + 5 * day), new Date(base + 60 * day)];
    expect(inferBillingInterval(irregular)).toBe('unknown');
  });
});

describe('hasStableAmount', () => {
  it('accepts a constant price', () => {
    expect(hasStableAmount([1599, 1599, 1599])).toBe(true);
  });

  it('accepts a modest price rise', () => {
    expect(hasStableAmount([1099, 1299, 1299])).toBe(true);
  });

  it('rejects amounts that vary like ordinary shopping', () => {
    expect(hasStableAmount([433, 1200, 5000])).toBe(false);
  });
});

describe('end to end: the sandbox rows that used to become subscriptions', () => {
  // name, amount, PFC, dates — as actually observed.
  const rows: { name: string; amountCents: number; pfc: string; dates: Date[] }[] = [
    { name: 'ACH Electronic CreditGUSTO PAY 123456', amountCents: 585000, pfc: 'TRANSFER_OUT', dates: everyNDays(30, 3) },
    { name: 'CD DEPOSIT .INITIAL.', amountCents: 100000, pfc: 'TRANSFER_OUT', dates: everyNDays(30, 3) },
    { name: 'AUTOMATIC PAYMENT - THANK', amountCents: 207850, pfc: 'LOAN_PAYMENTS', dates: everyNDays(30, 3) },
    { name: 'CREDIT CARD 3333 PAYMENT *//', amountCents: 2500, pfc: 'LOAN_PAYMENTS', dates: everyNDays(30, 3) },
  ];

  it.each(rows)('rejects $name', ({ amountCents, pfc }) => {
    expect(isSubscriptionCandidate({ amount: amountCents / 100, personalFinanceCategory: pfc })).toBe(
      false
    );
  });

  it('still accepts a genuine streaming subscription', () => {
    const dates = everyNDays(30, 6);
    const amounts = [1599, 1599, 1599, 1599, 1799, 1799]; // one price rise
    expect(isSubscriptionCandidate({ amount: 15.99, personalFinanceCategory: 'ENTERTAINMENT' })).toBe(
      true
    );
    expect(inferBillingInterval(dates)).toBe('monthly');
    expect(hasStableAmount(amounts)).toBe(true);
  });

  it('still accepts a gym membership', () => {
    expect(isSubscriptionCandidate({ amount: 78.5, personalFinanceCategory: 'PERSONAL_CARE' })).toBe(
      true
    );
    expect(inferBillingInterval(everyNDays(30, 4))).toBe('monthly');
    expect(hasStableAmount([7850, 7850, 7850, 7850])).toBe(true);
  });
});

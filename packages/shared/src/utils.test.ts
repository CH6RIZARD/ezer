import {
  normalizeMerchantName,
  detectRecurrence,
  extractFundingHint,
  calculateInvestmentOpportunityCost,
  getDifficultyLabel,
} from './utils';

describe('normalizeMerchantName', () => {
  it('should remove common suffixes', () => {
    expect(normalizeMerchantName('Netflix Inc')).toBe('netflix');
    expect(normalizeMerchantName('Spotify LLC')).toBe('spotify');
  });

  it('should handle common mappings', () => {
    expect(normalizeMerchantName('NYT')).toBe('new york times');
    expect(normalizeMerchantName('AMZN Prime')).toBe('amazon');
  });

  it('should remove special characters', () => {
    expect(normalizeMerchantName('Net!flix*')).toBe('netflix');
  });
});

describe('detectRecurrence', () => {
  it('should detect monthly recurring transactions', () => {
    const transactions = [
      { merchant: 'Netflix', date: new Date('2024-01-15'), amount: 1549 },
      { merchant: 'Netflix', date: new Date('2024-02-15'), amount: 1549 },
      { merchant: 'Netflix', date: new Date('2024-03-15'), amount: 1549 },
    ];

    const candidates = detectRecurrence(transactions);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].merchant).toBe('netflix');
    expect(candidates[0].isRecurring).toBe(true);
  });

  it('should not detect non-recurring transactions', () => {
    const transactions = [
      { merchant: 'Amazon', date: new Date('2024-01-15'), amount: 2999 },
      { merchant: 'Amazon', date: new Date('2024-01-20'), amount: 1499 },
    ];

    const candidates = detectRecurrence(transactions);
    expect(candidates).toHaveLength(0);
  });
});

describe('extractFundingHint', () => {
  it('should extract Visa with bullet points', () => {
    const hint = extractFundingHint('Charged to Visa •••• 1234');
    expect(hint).toEqual({ brand: 'Visa', last4: '1234' });
  });

  it('should extract Amex ending in', () => {
    const hint = extractFundingHint('Payment method: Amex ending in 0005');
    expect(hint).toEqual({ brand: 'Amex', last4: '0005' });
  });

  it('should extract Mastercard with asterisks', () => {
    const hint = extractFundingHint('Using Mastercard **** 7890');
    expect(hint).toEqual({ brand: 'Mastercard', last4: '7890' });
  });

  it('should return null for no match', () => {
    const hint = extractFundingHint('No card information here');
    expect(hint).toBeNull();
  });
});

describe('calculateInvestmentOpportunityCost', () => {
  it('should calculate opportunity cost with 7% annual return', () => {
    // $10/month for 12 months
    const cost = calculateInvestmentOpportunityCost(1000, 12);
    expect(cost).toBeGreaterThan(12000); // Should be > 12000 due to compounding
    expect(cost).toBeLessThan(13000); // But not too much more
  });

  it('should return monthly amount for 1 month', () => {
    const cost = calculateInvestmentOpportunityCost(1000, 1);
    expect(cost).toBe(1000);
  });
});

describe('getDifficultyLabel', () => {
  it('should return correct labels for scores', () => {
    expect(getDifficultyLabel(1)).toBe('Easy');
    expect(getDifficultyLabel(2)).toBe('Medium');
    expect(getDifficultyLabel(3)).toBe('Hard');
    expect(getDifficultyLabel(4)).toBe('Very Hard');
    expect(getDifficultyLabel(5)).toBe('Extreme');
  });
});

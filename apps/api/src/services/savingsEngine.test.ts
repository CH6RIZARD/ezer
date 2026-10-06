import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedPerPeriod } from './savingsEngine';

const goal = (cadence: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY', fixedAmountCents: number, targetCents = 100_000) => ({
  id: 'g',
  targetCents,
  targetDate: null,
  priority: 100,
  fundedCents: 0,
  rule: { mode: 'FIXED' as const, cadence, fixedAmountCents, maxPeriodCents: null, aggressiveness: 0.5 },
});

test('fixed amounts are converted to the weekly sweep', () => {
  assert.equal(fixedPerPeriod(goal('WEEKLY', 700), 0), 700);
  assert.equal(fixedPerPeriod(goal('BIWEEKLY', 1400), 0), 700);
  // $30/month → $7/week (30-day month), not $30 every week.
  assert.equal(fixedPerPeriod(goal('MONTHLY', 3000), 0), 700);
});

test('never past the target', () => {
  assert.equal(fixedPerPeriod(goal('WEEKLY', 700, 1000), 800), 200);
  assert.equal(fixedPerPeriod(goal('WEEKLY', 700, 1000), 1000), 0);
});

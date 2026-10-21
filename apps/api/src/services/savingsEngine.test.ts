import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedPerPeriod, accrualCents, chargeAccrues, allocate, takeOldestAccruals } from './savingsEngine';

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

// --- Subscription savings pool -------------------------------------------------

test('accrual follows the actual charge: HALF rounds, MATCH is the charge', () => {
  assert.equal(accrualCents('HALF', 1299), 650); // round(649.5)
  assert.equal(accrualCents('HALF', 1549), 775); // price rise followed: $7.75, not $6.50
  assert.equal(accrualCents('MATCH', 1549), 1549);
  assert.equal(accrualCents('HALF', 0), 0);
  assert.equal(accrualCents('MATCH', -1299), 0); // refunds save nothing
});

test('only ACTIVE sources accrue, and only from the day they became active', () => {
  const since = new Date('2026-10-20T15:30:00Z');
  const day = (d: string) => new Date(`${d}T00:00:00Z`);
  assert.equal(chargeAccrues({ status: 'ACTIVE', activeSince: since }, day('2026-10-20')), true);
  assert.equal(chargeAccrues({ status: 'ACTIVE', activeSince: since }, day('2026-11-20')), true);
  // Plaid re-reads a year of history; none of it is backfilled.
  assert.equal(chargeAccrues({ status: 'ACTIVE', activeSince: since }, day('2026-09-20')), false);
  assert.equal(chargeAccrues({ status: 'PAUSED', activeSince: since }, day('2026-11-20')), false);
  assert.equal(chargeAccrues({ status: 'ENDED', activeSince: since }, day('2026-11-20')), false);
});

const poolGoal = (poolNeedCents: number) => ({
  ...goal('WEEKLY', 0, 0),
  id: 'pool',
  kind: 'SUBSCRIPTION_POOL' as const,
  poolNeedCents,
  fundedCents: 500_000, // way past any "target": the pool has none
});

test('pool is never capped by a target: its need is the unswept accruals', () => {
  assert.equal(fixedPerPeriod(poolGoal(2325), 500_000), 2325);
  assert.deepEqual([...allocate(10_000, [poolGoal(2325)])], [['pool', 2325]]);
  // Nothing accrued -> no leg.
  assert.equal(allocate(10_000, [poolGoal(0)]).size, 0);
});

test('pool takes exactly its accruals, never surplus', () => {
  const plan = allocate(10_000, [poolGoal(2325), { ...goal('WEEKLY', 700), id: 'trip' }]);
  assert.equal(plan.get('pool'), 2325);
  assert.equal(plan.get('trip'), 10_000 - 2325);
});

test('a trimmed week carries the oldest accruals and leaves the rest waiting', () => {
  const rows = [
    { id: 'a', amountCents: 775 },
    { id: 'b', amountCents: 775 },
    { id: 'c', amountCents: 775 },
  ];
  assert.deepEqual(takeOldestAccruals(rows, 2325), { ids: ['a', 'b', 'c'], cents: 2325 });
  assert.deepEqual(takeOldestAccruals(rows, 2000), { ids: ['a', 'b'], cents: 1550 });
  assert.deepEqual(takeOldestAccruals(rows, 500), { ids: [], cents: 0 });
});

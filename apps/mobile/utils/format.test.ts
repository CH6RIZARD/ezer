// Run: pnpm --filter @ezer/mobile exec npx tsx --test utils/format.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCompactCents } from './format';

test('formatCompactCents: each size band', () => {
  assert.equal(formatCompactCents(0), '$0.00');
  assert.equal(formatCompactCents(599), '$5.99');
  assert.equal(formatCompactCents(8544), '$85.44');
  assert.equal(formatCompactCents(9999), '$99.99');
  assert.equal(formatCompactCents(10000), '$100');
  assert.equal(formatCompactCents(32564), '$326');
  assert.equal(formatCompactCents(99949), '$999');
  assert.equal(formatCompactCents(132600), '$1.3k');
  assert.equal(formatCompactCents(1234500), '$12k');
  assert.equal(formatCompactCents(13000000), '$130k');
  assert.equal(formatCompactCents(130000000), '$1.3M');
  assert.equal(formatCompactCents(5000000000), '$50M');
});

test('formatCompactCents: rounding carries into the next unit', () => {
  assert.equal(formatCompactCents(99960), '$1k'); // $999.60
  assert.equal(formatCompactCents(99999900), '$1M'); // $999,999
  assert.equal(formatCompactCents(99950000), '$1M'); // $999,500
  assert.equal(formatCompactCents(999000), '$10k'); // $9,990 → 9.99k rounds to 10
});

test('formatCompactCents: at most 7 characters with the $', () => {
  for (let e = 0; e <= 12; e++) {
    for (const m of [1, 1.5, 4.99, 9.95, 9.999]) {
      const s = formatCompactCents(Math.round(m * 10 ** e));
      assert.ok(s.length <= 7, `${m}e${e} -> ${s}`); // "$" + 6
    }
  }
});

test('formatCompactCents: sign is the caller\'s; bad input is $0.00', () => {
  assert.equal(formatCompactCents(-32564), '$326');
  assert.equal(formatCompactCents(NaN), '$0.00');
});

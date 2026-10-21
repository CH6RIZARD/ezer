// node --test apps/mobile/utils/priceSteps.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceSteps, stepHeight } from './priceSteps.ts';

test('a long run and two short hikes are three steps', () => {
  const s = priceSteps([...Array(52).fill(1099), 1299, 1299, 1549, 1549]);
  assert.deepEqual(s.map(x => [x.cents, x.count, x.from, x.to]), [
    [1099, 52, 0, 51],
    [1299, 2, 52, 53],
    [1549, 2, 54, 55],
  ]);
});

test('a steady price is one step, empty is none', () => {
  assert.equal(priceSteps(Array(46).fill(1199)).length, 1);
  assert.equal(priceSteps([]).length, 0);
});

test('heights', () => {
  assert.equal(stepHeight(1199, 1199, 1199), 96);
  assert.equal(stepHeight(1099, 1099, 1549), 52);
  assert.equal(stepHeight(1549, 1099, 1549), 118);
});

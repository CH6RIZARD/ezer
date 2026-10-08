// Run: pnpm --filter @ezer/mobile exec npx tsx --test utils/merchantName.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { prettyMerchantName } from './merchantName';

test('prettyMerchantName: bank descriptors read as merchants', () => {
  assert.equal(prettyMerchantName('acct paymtascent funding recur ascent paymt'), 'Ascent Funding');
  assert.equal(prettyMerchantName('autopay chase credit crd epay'), 'Chase Crd Epay');
  assert.equal(prettyMerchantName('kikoff lending'), 'Kikoff Lending');
  assert.equal(prettyMerchantName('self'), 'Self');
  assert.equal(prettyMerchantName('netflix'), 'Netflix');
  assert.equal(prettyMerchantName('NETFLIX.COM 4532'), 'Netflix');
  // Nothing left after cleaning: show what we were given rather than blank.
  assert.equal(prettyMerchantName('ach 12345'), 'ach 12345');
});

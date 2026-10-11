// Run: node --test apps/mobile/utils/merchantDomain.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { trustedWebsiteDomain } from './merchantDomain.ts';

test('trustedWebsiteDomain keeps a website that matches the merchant', () => {
  assert.equal(trustedWebsiteDomain('https://www.ascentfunding.com/', 'Ascent Funding'), 'ascentfunding.com');
  assert.equal(trustedWebsiteDomain('self.inc', 'Self'), 'self.inc');
  assert.equal(trustedWebsiteDomain('https://www.netflix.com', 'Netflix'), 'netflix.com');
  assert.equal(trustedWebsiteDomain('app.netlify.com', 'Netlify'), 'app.netlify.com');
  assert.equal(trustedWebsiteDomain('cash.app', 'Cash App'), 'cash.app');
});

test('trustedWebsiteDomain drops a website that belongs to someone else', () => {
  assert.equal(trustedWebsiteDomain('https://www.tiktok.com/', 'Cleo'), undefined);
  assert.equal(trustedWebsiteDomain('tiktok.com', 'Kikoff Lending'), undefined);
  assert.equal(trustedWebsiteDomain(undefined, 'Netflix'), undefined);
  assert.equal(trustedWebsiteDomain('not a url', 'Netflix'), undefined);
});

// Run: node --test apps/mobile/utils/inboxScan/extract.test.ts
// (Node 22.18+/23.6+ strips TypeScript natively, so no tsx needed — hence the
// explicit .ts extension below. Excluded from tsc like resolver.test.ts.)

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractSubscription, htmlToText, mergeByMerchant } from './extract.ts';

const at = new Date('2026-09-15T10:00:00Z');
const day = (iso: string | null) => iso?.slice(0, 10) ?? null;

test('Netflix monthly receipt', () => {
  const r = extractSubscription({
    from: 'Netflix <info@account.netflix.com>',
    subject: 'Your Netflix membership has been renewed',
    text: 'Standard plan $15.49/month. Your next billing date is October 15, 2026.',
    links: ['https://www.netflix.com/cancelplan', 'https://www.netflix.com/email-preferences'],
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'Netflix');
  assert.equal(r?.amountCents, 1549);
  assert.equal(r?.currency, 'USD');
  assert.equal(r?.cadence, 'monthly');
  assert.equal(day(r!.nextChargeDate), '2026-10-15');
  assert.equal(r?.cancelUrl, 'https://www.netflix.com/cancelplan');
  assert.ok(r!.confidence >= 0.9);
});

test('Spotify Premium, date without a year rolls forward', () => {
  const r = extractSubscription({
    from: '"Spotify" <no-reply@spotify.com>',
    subject: 'Your Spotify Premium receipt',
    text: 'Premium Individual. Total charged: $11.99. Your subscription renews on Oct 15 every month.',
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'Spotify');
  assert.equal(r?.amountCents, 1199);
  assert.equal(r?.cadence, 'monthly');
  assert.equal(day(r!.nextChargeDate), '2026-10-15');
});

test('Apple subscription, yearly', () => {
  const r = extractSubscription({
    from: 'Apple <no_reply@email.apple.com>',
    subject: 'Your subscription confirmation',
    text: 'iCloud+ 200GB. $29.99 per year. Renews 9/20/2027.',
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'Apple');
  assert.equal(r?.cadence, 'yearly');
  assert.equal(r?.amountCents, 2999);
});

test('Adobe annual plan billed monthly, with a "total" amount among several', () => {
  const r = extractSubscription({
    from: 'Adobe <mail@mail.adobe.com>',
    subject: 'Your Adobe subscription',
    text: 'Creative Cloud All Apps. Subtotal $59.99 Tax $5.10 Total $65.09 per month. Next payment date: 2026-10-14.',
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'Adobe');
  assert.equal(r?.amountCents, 6509);
  assert.equal(day(r!.nextChargeDate), '2026-10-14');
});

test('ChatGPT Plus via openai.com', () => {
  const r = extractSubscription({
    from: 'OpenAI <noreply@tm.openai.com>',
    subject: 'Your ChatGPT Plus subscription receipt',
    text: 'ChatGPT Plus subscription. Amount paid $20.00. Billed monthly.',
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'ChatGPT');
  assert.equal(r?.amountCents, 2000);
  assert.equal(r?.cadence, 'monthly');
});

test('Gym membership from an unknown domain uses the display name', () => {
  const r = extractSubscription({
    from: 'Iron Works Gym <billing@ironworksgym.com>',
    subject: 'Membership dues receipt',
    text: 'Your monthly membership dues of $45.00 were charged. Next charge on 15 October 2026.',
    receivedAt: at,
  });
  assert.equal(r?.merchant, 'Iron Works Gym');
  assert.equal(r?.amountCents, 4500);
  assert.equal(day(r!.nextChargeDate), '2026-10-15');
});

test('Free trial email yields trialEndsAt', () => {
  const r = extractSubscription({
    from: 'Hulu <hulu@hulumail.com>',
    subject: 'Welcome to your free trial',
    text: 'Your free trial ends on September 22, 2026. After that you will be charged $9.99/month.',
    receivedAt: at,
  });
  assert.equal(day(r!.trialEndsAt), '2026-09-22');
  assert.equal(r?.amountCents, 999);
  assert.equal(r?.cadence, 'monthly');
});

test('One-off order is not a subscription', () => {
  const r = extractSubscription({
    from: 'Amazon.com <shipment-tracking@amazon.com>',
    subject: 'Your order has shipped',
    text: 'Order total $34.12. Arriving Thursday.',
    receivedAt: at,
  });
  assert.equal(r, null);
});

test('Newsletter footer alone is not a subscription', () => {
  const r = extractSubscription({
    from: 'Weekly Digest <news@digest.example.com>',
    subject: 'This week in tech',
    text: 'Great stories. Manage your subscription or unsubscribe at any time.',
    receivedAt: at,
  });
  assert.equal(r, null);
});

test('Personal mail host with no display name is dropped', () => {
  const r = extractSubscription({
    from: 'someone@gmail.com',
    subject: 'Re: subscription',
    text: 'Your plan renews on Oct 1, $5/month',
    receivedAt: at,
  });
  assert.equal(r, null);
});

test('htmlToText keeps links and decodes entities', () => {
  const { text, links } = htmlToText('<p>Total&nbsp;&#36;9.99</p><a href="https://x.com/cancel?a=1&amp;b=2">Cancel</a>');
  assert.match(text, /Total \$9\.99/);
  assert.deepEqual(links, ['https://x.com/cancel?a=1&b=2']);
});

test('mergeByMerchant keeps newest values and fills gaps', () => {
  const base = { currency: 'USD', cancelUrl: null, trialEndsAt: null, confidence: 0.7 };
  const out = mergeByMerchant([
    { ...base, merchant: 'Netflix', amountCents: 1549, cadence: 'monthly', nextChargeDate: null, receivedAt: 1 },
    { ...base, merchant: 'netflix', amountCents: null, cadence: 'unknown', nextChargeDate: '2026-10-15T12:00:00.000Z', receivedAt: 2 },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].amountCents, 1549);
  assert.equal(out[0].cadence, 'monthly');
  assert.equal(out[0].nextChargeDate, '2026-10-15T12:00:00.000Z');
});

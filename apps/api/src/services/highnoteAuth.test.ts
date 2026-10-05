import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import { decide, signatureValid } from './highnoteAuth';

const ok = { status: 'approved_pending_issuance', limitCents: 10000 };
const base = { amountCents: 2000, currencyCode: 'USD', access: ok, outstandingCents: 0, hasMissed: false };

test('approves inside spending power, declines past it', () => {
  assert.equal(decide(base), 'APPROVED');
  assert.equal(decide({ ...base, amountCents: 10000 }), 'APPROVED');
  assert.equal(decide({ ...base, amountCents: 10001 }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, outstandingCents: 8001 }), 'INSUFFICIENT_FUNDS');
});

test('declines anything ambiguous', () => {
  assert.equal(decide({ ...base, hasMissed: true }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, access: null }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, access: { status: 'waitlist', limitCents: 10000 } }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, access: { ...ok, limitCents: null } }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, currencyCode: 'EUR' }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, amountCents: 0 }), 'INSUFFICIENT_FUNDS');
  assert.equal(decide({ ...base, amountCents: 1.5 }), 'INSUFFICIENT_FUNDS');
});

test('signature: hex and base64 accepted, tampering rejected', () => {
  const raw = Buffer.from('{"data":{"x":1}}');
  const mac = createHmac('sha256', 's3cret').update(raw).digest();
  assert.ok(signatureValid('s3cret', raw, mac.toString('hex')));
  assert.ok(signatureValid('s3cret', raw, mac.toString('base64')));
  assert.ok(!signatureValid('s3cret', Buffer.from('{"data":{"x":2}}'), mac.toString('hex')));
  assert.ok(!signatureValid('other', raw, mac.toString('hex')));
  assert.ok(!signatureValid('', raw, mac.toString('hex')));
  assert.ok(!signatureValid('s3cret', raw, ''));
});

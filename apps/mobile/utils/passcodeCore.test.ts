// Run: pnpm --filter @ezer/mobile exec npx tsx --test utils/passcodeCore.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { sha256Hex, isValidPasscode, lockedUntilAfter, withinGrace, LOCK_GRACE_MS } from './passcodeCore';

test('sha256Hex: FIPS 180-2 vectors (empty, one block, two blocks)', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
  );
});

test('sha256Hex: matches node crypto at every padding boundary', () => {
  for (let n = 0; n <= 130; n++) {
    const s = 'x'.repeat(n);
    assert.equal(sha256Hex(s), createHash('sha256').update(s).digest('hex'), `length ${n}`);
  }
});

test('isValidPasscode: 4 to 6 digits only', () => {
  assert.ok(isValidPasscode('1234'));
  assert.ok(isValidPasscode('64226'));
  assert.ok(isValidPasscode('123456'));
  assert.ok(!isValidPasscode('123'));
  assert.ok(!isValidPasscode('1234567'));
  assert.ok(!isValidPasscode('12a4'));
});

test('lockedUntilAfter: five free guesses, then 30s doubling, capped at an hour', () => {
  assert.equal(lockedUntilAfter(4, 1000), 0);
  assert.equal(lockedUntilAfter(5, 1000), 1000 + 30_000);
  assert.equal(lockedUntilAfter(6, 1000), 1000 + 60_000);
  assert.equal(lockedUntilAfter(30, 1000), 1000 + 3_600_000);
});

test('withinGrace: under 60s skips the passcode; a clock moved back does not', () => {
  assert.ok(withinGrace(10_000, 10_000 + LOCK_GRACE_MS - 1));
  assert.ok(!withinGrace(10_000, 10_000 + LOCK_GRACE_MS));
  assert.ok(!withinGrace(10_000, 9_000));
  assert.ok(!withinGrace(null, 10_000));
});

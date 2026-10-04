// =============================================================================
// EZER — app passcode: the pure rules (no React Native imports, so the node
// test runner can load this file; see passcodeCore.test.ts).
// =============================================================================

export const PASSCODE_MIN = 4;
export const PASSCODE_MAX = 6;
/** Coming back to the app within this long of leaving it skips the passcode. */
export const LOCK_GRACE_MS = 60_000;
/** Wrong guesses allowed before the first lockout. */
export const FREE_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 30_000;
const MAX_LOCKOUT_MS = 60 * 60_000;

export const isValidPasscode = (code: string) =>
  code.length >= PASSCODE_MIN && code.length <= PASSCODE_MAX && /^\d+$/.test(code);

/**
 * When the keypad unlocks again after `failures` wrong guesses in a row: free
 * for the first FREE_ATTEMPTS, then 30s, doubling with every further wrong
 * guess, capped at an hour. 0 means not locked.
 */
export function lockedUntilAfter(failures: number, now: number): number {
  const over = failures - FREE_ATTEMPTS;
  if (over < 0) return 0;
  return now + Math.min(FIRST_LOCKOUT_MS * 2 ** over, MAX_LOCKOUT_MS);
}

/**
 * Whether reopening at `now` is close enough to leaving at `leftAt` to skip
 * the passcode. A clock that moved backwards (now < leftAt) does not count.
 */
export const withinGrace = (leftAt: number | null, now: number) =>
  leftAt != null && now >= leftAt && now - leftAt < LOCK_GRACE_MS;

// --- SHA-256 -----------------------------------------------------------------
// Plain JS, not expo-crypto's digestStringAsync: on web that is
// crypto.subtle, which browsers withhold from non-HTTPS pages — and the dev
// page is served to the phone over plain http on the LAN. Checked against the
// FIPS 180-2 test vectors in passcodeCore.test.ts.
//
// The hash keeps the digits out of storage in readable form; it is not what
// protects a 4–6 digit code (10^6 guesses is nothing offline). The keychain
// does that on the phone, and the attempt limit does it at the keypad.

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const ror = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of an ASCII string, as lowercase hex. */
export function sha256Hex(ascii: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) {
    const c = ascii.charCodeAt(i);
    if (c > 0x7f) throw new Error('sha256Hex takes ASCII only');
    bytes.push(c);
  }
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 64-bit big-endian length; the high word is 0 for anything under 512MB.
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Array<number>(64);
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) {
      const p = o + i * 4;
      w[i] = (bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export const hashPasscode = (salt: string, code: string) => sha256Hex(`${salt}:${code}`);

// =============================================================================
// EZER — Highnote collaborative authorization: pure decision + signature check.
// Kept free of prisma so it can be tested without a database.
// =============================================================================

import { createHmac, timingSafeEqual } from 'crypto';

export type AuthResponseCode = 'APPROVED' | 'INSUFFICIENT_FUNDS';

export interface AuthInputs {
  /** Requested amount in minor units (cents). */
  amountCents: number;
  currencyCode: string;
  /** Latest CardAccessList decision for the card's user, or null if none. */
  access: { status: string; limitCents: number | null } | null;
  /** Pay in 4 principal still owed on ACTIVE plans. */
  outstandingCents: number;
  /** Any installment currently MISSED (uncured). */
  hasMissed: boolean;
}

/**
 * Approve only what fits inside Spending Power. Everything ambiguous
 * declines: an approval is a loan, a decline is a retry.
 */
export function decide(i: AuthInputs): AuthResponseCode {
  if (i.currencyCode !== 'USD') return 'INSUFFICIENT_FUNDS';
  if (!Number.isInteger(i.amountCents) || i.amountCents <= 0) return 'INSUFFICIENT_FUNDS';
  if (i.hasMissed) return 'INSUFFICIENT_FUNDS';
  if (!i.access || i.access.status !== 'approved_pending_issuance' || !i.access.limitCents) {
    return 'INSUFFICIENT_FUNDS';
  }
  return i.amountCents <= i.access.limitCents - i.outstandingCents ? 'APPROVED' : 'INSUFFICIENT_FUNDS';
}

/**
 * `highnote-signature` is HMAC-SHA256 (hex) of the raw body with the
 * endpoint's signing secret; base64 is accepted too in case that changes.
 */
export function signatureValid(secret: string, raw: Buffer, provided: string): boolean {
  if (!secret || !provided) return false;
  const mac = createHmac('sha256', secret).update(raw).digest();
  // Comma-separated during key rotation: one signature per active key.
  for (const p of provided.split(',').map(x => x.trim()).filter(Boolean)) {
    for (const candidate of [Buffer.from(p, 'hex'), Buffer.from(p, 'base64')]) {
      if (candidate.length === mac.length && timingSafeEqual(candidate, mac)) return true;
    }
  }
  return false;
}

/** Highnote's own sample rejects anything signed more than 15 minutes ago. */
export const MAX_SIGNATURE_AGE_MS = 15 * 60 * 1000;
export function fresh(signatureTimestamp: unknown, now = Date.now()): boolean {
  const ts = Number(signatureTimestamp);
  return Number.isFinite(ts) && Math.abs(now - ts) <= MAX_SIGNATURE_AGE_MS;
}

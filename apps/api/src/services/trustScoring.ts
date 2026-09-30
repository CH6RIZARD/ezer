// =============================================================================
// EZER — Spending Power trust scoring
//
// Extracted out of routes/cards.ts so services/installmentEngine.ts can call
// the SAME scoring function a missed Pay in 4 payment must feed into.
// Importing back from routes/cards.ts into a service would risk the same
// CommonJS require cycle CLAUDE.md documents for CONSENT_VERSION — this file
// has no route-layer dependencies, only prisma and Plaid, so both cards.ts
// and installmentEngine.ts can import it without one importing the other.
// =============================================================================

import { prisma } from '@ezer/db';
import { decrypt } from '../utils/encryption';
import { getPlaidClient } from '../routes/plaid';

/**
 * Status vocabulary the client renders against. Kept as strings (not booleans)
 * so a future "declined" or "kyc_required" state is an additive change.
 *
 * There is deliberately no "manual_review" here — see limitForScore's comment
 * for why. 'suspended' is new: it is not "we don't know yet" (manual_review's
 * old meaning), it is "we know exactly why, and the answer is not right now" —
 * an uncured missed Pay in 4 payment. It clears the moment that installment is
 * cured, the same way Cash App Borrow's own suspension does.
 */
export type AccessStatus = 'approved_pending_issuance' | 'waitlist' | 'suspended';

/**
 * Plaid- and Pay-in-4-derived inputs to the trust score. The Plaid half is
 * read off /transactions/sync + /accounts/balance for the linked item; the
 * installment half is read off this app's own InstallmentPlan/Installment
 * rows. The shape is defined here so the scoring function is testable
 * without either Plaid or a live processor.
 */
export type TrustSignals = {
  /** Mean monthly deposits over the observed window, in cents. */
  avgMonthlyInflowCents: number;
  /** Current available balance across depository accounts, in cents. */
  currentBalanceCents: number;
  /** How long the oldest linked account has existed, in months. */
  accountAgeMonths: number;
  /** Overdraft / NSF events in the last 90 days. */
  overdraftsLast90d: number;
  /**
   * Pay in 4 installments currently MISSED and not yet cured. Any value > 0
   * forces a hard suspension in `limitForScore`, independent of score — see
   * that function's comment.
   */
  activeMissedInstallments: number;
  /**
   * Installments that went MISSED (whether or not later cured) in the last
   * 12 months. Scored as a heavy, lingering penalty — being cured stops the
   * suspension, it does not erase that the miss happened, the same way a real
   * BNPL provider's internal risk model keeps scoring a cured late payment
   * for a period after it's resolved.
   */
  missedInstallmentsLast12mo: number;
};

const ZERO_SIGNALS: TrustSignals = {
  avgMonthlyInflowCents: 0,
  currentBalanceCents: 0,
  accountAgeMonths: 0,
  overdraftsLast90d: 0,
  activeMissedInstallments: 0,
  missedInstallmentsLast12mo: 0,
};

/**
 * Turn Plaid-style + repayment signals into a 0–100 trust score.
 *
 * The weighting reflects what actually predicts repayment on a small-limit
 * consumer card, in order of predictive power:
 *
 *   1. INCOME (max 40) — recurring inflow is the strongest single predictor.
 *      1 point per $100 of average monthly inflow, so the band that matters
 *      ($0–$4,000/mo) is where the whole 40 points get spent; earning more than
 *      $4,000/mo doesn't make someone progressively safer on a $1,500 line.
 *
 *   2. BUFFER (max 25) — balance is what absorbs a bad month. 1 point per $50,
 *      capped at $1,250. Cheaper to earn than income points because a balance
 *      is a snapshot and trivially gamed by a one-off transfer before linking.
 *
 *   3. TENURE (max 20) — account age proxies for identity stability and makes
 *      synthetic-identity fraud expensive. 1 point per month, capped at 20;
 *      past ~2 years it stops carrying new information.
 *
 *   4. OVERDRAFTS (penalty) — a NEGATIVE cash-flow signal. -12 points each, so
 *      three NSF events in a quarter erase a full income score no matter how
 *      large the deposits are.
 *
 *   5. MISSED PAYMENTS (penalty) — the STRONGEST negative signal of all, and
 *      deliberately bigger than an overdraft: an overdraft says the user's
 *      cash flow is tight, a missed Pay in 4 installment says they did not
 *      repay EZER specifically when it was due. -35 points each, uncapped, so
 *      two misses in 12 months can alone erase everything else earns.
 *
 * The result is clamped to 0–100. This is a stub: production must additionally
 * run KYC/identity, sanctions screening and the issuer's own underwriting
 * before any of this becomes a real credit decision.
 */
export function scoreTrust(signals: TrustSignals): number {
  const incomePoints = Math.min(40, Math.floor(signals.avgMonthlyInflowCents / 10_000));
  const bufferPoints = Math.min(25, Math.floor(signals.currentBalanceCents / 5_000));
  const tenurePoints = Math.min(20, Math.max(0, Math.floor(signals.accountAgeMonths)));
  const overdraftPenalty = Math.max(0, signals.overdraftsLast90d) * 12;
  const missedPaymentPenalty = Math.max(0, signals.missedInstallmentsLast12mo) * 35;

  const raw = incomePoints + bufferPoints + tenurePoints - overdraftPenalty - missedPaymentPenalty;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Map a trust score (plus the hard "currently missed" gate) to a limit, in
 * CENTS.
 *
 * GENEROUS HALF: every score otherwise produces a real, usable limit — there
 * is no zero band from score alone. Cash App's own reported first-time Borrow
 * limits run $50–$400 with a ~$150 average for thin-file users, and neither
 * Klarna nor Affirm hard-decline a first transaction purely on a thin file —
 * they approve small and let it grow. $25 is EZER's equivalent floor.
 *
 * RESTRICTED HALF: `activeMissedInstallments > 0` overrides all of that and
 * returns 0. This is the piece that did not exist before the Pay in 4
 * installment engine did — Cash App explicitly cuts/suspends Borrow access
 * after a late/missed repayment, independent of income or balance, and this
 * is EZER's version of that hard stop. It clears automatically the moment the
 * installment is cured (installmentEngine.ts's onInstallmentTransferEvent),
 * at which point the score-only bands below apply again — already dragged
 * down by `missedInstallmentsLast12mo` in `scoreTrust`, which is the part of
 * the penalty that outlives the cure.
 *
 * Banded rather than continuous on purpose: a band is explainable to the user
 * ("you're in our $1,000 tier") and to a regulator, and it stops a $5 change in
 * balance from moving the number they were shown yesterday.
 */
export function limitForScore(score: number, activeMissedInstallments: number): number {
  if (activeMissedInstallments > 0) return 0;
  if (score >= 80) return 150_000; // $1,500
  if (score >= 65) return 100_000; // $1,000
  if (score >= 50) return 50_000; //    $500
  if (score >= 35) return 25_000; //    $250
  if (score >= 20) return 10_000; //    $100
  return 2_500; //                      $25 — the floor, not a decline
}

/**
 * Derive the Plaid-side trust signals from the user's OWN Plaid data. Client
 * input is never used here — every number is read server-side from data the
 * user cannot author, so a caller cannot state the income their credit line
 * is computed from.
 *
 * Returns null when the user has linked no bank, which is a different outcome
 * from scoring zero: no data is a reason to floor the limit, not a reason to
 * penalize it beyond the floor.
 */
async function derivePlaidSignals(
  userId: string
): Promise<Pick<TrustSignals, 'avgMonthlyInflowCents' | 'currentBalanceCents' | 'accountAgeMonths' | 'overdraftsLast90d'> | null> {
  const items = await prisma.plaidItem.findMany({ where: { userId } });
  if (items.length === 0) return null;

  // Live balance across depository accounts. A Plaid failure must not silently
  // become a zero balance, which would read as a poor signal rather than a
  // missing one — so a total that never resolved leaves the applicant unscored.
  let balanceCents: number | null = null;
  if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
    const plaid = getPlaidClient();
    for (const item of items) {
      try {
        const res = await plaid.accountsBalanceGet({ access_token: decrypt(item.accessTokenEnc) });
        for (const acct of res.data.accounts) {
          if (acct.type !== 'depository') continue;
          const available = acct.balances.available ?? acct.balances.current;
          if (typeof available === 'number') {
            balanceCents = (balanceCents ?? 0) + Math.round(available * 100);
          }
        }
      } catch {
        // One unreachable item does not invalidate the others.
      }
    }
  }
  if (balanceCents === null) return null;

  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const txns = await prisma.transaction.findMany({
    where: { userId, date: { gte: since } },
    select: { amountCents: true, date: true, merchantNameRaw: true },
  });

  // Deposits are the NEGATIVE side of the ledger in Plaid's own convention —
  // positive amountCents means money OUT of the account (see the identical
  // note on SubscriptionCandidateInput.amount in packages/shared).
  const inflow = txns.filter(t => t.amountCents < 0).reduce((sum, t) => sum + -t.amountCents, 0);
  const oldest = txns.reduce<Date | null>((acc, t) => (!acc || t.date < acc ? t.date : acc), null);
  const observedMonths = oldest
    ? Math.max(1, Math.round((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30)))
    : 1;

  // Plaid does not flag overdrafts, so they are matched by the fee description
  // the institution writes. \b-anchored so "traNSFer" does not match "nsf".
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const overdrafts = txns.filter(
    t =>
      t.date.getTime() >= ninetyDaysAgo &&
      /\boverdraft\b|\bnsf\b|\binsufficient\b|\breturned item\b/i.test(t.merchantNameRaw)
  ).length;

  const firstLink = items.reduce((acc, i) => (i.createdAt < acc ? i.createdAt : acc), items[0].createdAt);
  const accountAgeMonths = Math.max(
    observedMonths,
    Math.round((Date.now() - firstLink.getTime()) / (1000 * 60 * 60 * 24 * 30))
  );

  return {
    avgMonthlyInflowCents: Math.round(inflow / observedMonths),
    currentBalanceCents: balanceCents,
    accountAgeMonths,
    overdraftsLast90d: overdrafts,
  };
}

/** How far back a missed installment still weighs on the score. */
const MISS_LOOKBACK_MONTHS = 12;

async function deriveInstallmentSignals(
  userId: string
): Promise<Pick<TrustSignals, 'activeMissedInstallments' | 'missedInstallmentsLast12mo'>> {
  const lookback = new Date();
  lookback.setMonth(lookback.getMonth() - MISS_LOOKBACK_MONTHS);

  const [active, last12mo] = await Promise.all([
    prisma.installment.count({ where: { userId, status: 'MISSED' } }),
    prisma.installment.count({
      where: { userId, status: { in: ['MISSED', 'CURED'] }, missedAt: { gte: lookback } },
    }),
  ]);

  return { activeMissedInstallments: active, missedInstallmentsLast12mo: last12mo };
}

/**
 * Run the full underwriting decision for a user right now: Plaid signals
 * (floored to zero-signal defaults when no bank is linked — "no data" is not
 * a reason to look worse than the floor) plus Pay in 4 repayment history
 * (which applies even with no bank linked — a suspension must not lift just
 * because the user unlinked the bank that missed the payment).
 *
 * This is the single function both POST /cards/access-list (cards.ts) and a
 * missed-installment event (installmentEngine.ts) call, so "assessed after
 * checking Spending Power" and "re-assessed the instant a payment is missed"
 * can never disagree about what counts.
 */
export async function assessAccess(
  userId: string
): Promise<{ status: AccessStatus; limitCents: number; trustScore: number }> {
  const plaid = await derivePlaidSignals(userId);
  const installments = await deriveInstallmentSignals(userId);
  const signals: TrustSignals = { ...(plaid ?? ZERO_SIGNALS), ...installments };

  const trustScore = scoreTrust(signals);
  const limitCents = limitForScore(trustScore, installments.activeMissedInstallments);
  const status: AccessStatus = installments.activeMissedInstallments > 0 ? 'suspended' : 'approved_pending_issuance';

  return { status, limitCents, trustScore };
}

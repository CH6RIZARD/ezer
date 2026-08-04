// =============================================================================
// EZER API — Physical card: design persistence + two-tier access list
//
// Product flow this backs (design FIRST, qualify AFTER):
//   1. The user draws a card and saves it        → POST /cards/designs
//   2. The saved design can be re-read anywhere  → GET  /cards/designs/:id
//   3. Only then do they pick how to qualify     → POST /cards/access-list
//        · mode 'plaid'    → bank-connected trust assessment, reveals a limit
//        · mode 'waitlist' → plain early-access list, no limit yet
//
// PERSISTENCE: in-memory on purpose. There is no CardDesign / CardAccessList
// model in packages/db/prisma/schema.prisma, and adding one needs a schema
// change plus a migration that this module does not own.
// TODO(production): replace the two Maps below with Prisma models —
//   model CardDesign     { id, userId, finish, strokes Json, updatedAt }
//   model CardAccessList { id, userId, designId, mode, status, limitCents,
//                          trustScore, decidedAt }
// and index CardAccessList by userId so a user has at most one live entry.
// Everything else in this file (validation, scoring, response shapes) is
// storage-agnostic and survives that swap unchanged.
// =============================================================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyJwt, extractTokenFromHeader } from '../utils/jwt';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type CardStroke = { d: string; color: string; width: number };

type CardDesignRecord = {
  id: string;
  userId: string;
  finish: string;
  strokes: CardStroke[];
  updatedAt: string;
  createdAt: string;
};

type AccessMode = 'plaid' | 'waitlist';

/**
 * Status vocabulary the client renders against. Kept as strings (not booleans)
 * so a future "declined" or "kyc_required" state is an additive change.
 */
type AccessStatus = 'approved_pending_issuance' | 'manual_review' | 'waitlist';

type AccessRecord = {
  id: string;
  userId: string;
  designId: string | null;
  mode: AccessMode;
  status: AccessStatus;
  /** Money is always integer cents. Absent for waitlist entries. */
  limitCents?: number;
  trustScore?: number;
  createdAt: string;
};

/**
 * Plaid-derived inputs to the trust score. The real implementation reads these
 * off /transactions/sync + /accounts/balance for the linked item; the shape is
 * defined here so the scoring function is testable without Plaid at all.
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
};

// -----------------------------------------------------------------------------
// In-memory stores (see TODO at the top of the file)
// -----------------------------------------------------------------------------

const designs = new Map<string, CardDesignRecord>();
const accessList = new Map<string, AccessRecord>();

let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  // Not a UUID: ids only have to be unique within a process while this is
  // in-memory. Prisma's cuid() takes over with the model swap.
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

/**
 * Auth is OPTIONAL on these routes, unlike /wallet or /plaid.
 *
 * Designing a card is a pre-account, top-of-funnel action — the demo build and
 * the first-run experience both hit this before anyone has signed in, and a 401
 * there would silently push every save onto the client's offline queue and make
 * the feature look broken. Signed-in callers still get their real userId, so
 * records are correctly attributed the moment a token exists.
 */
function resolveUserId(request: FastifyRequest): string {
  const token = extractTokenFromHeader(request.headers.authorization);
  if (!token) return 'anonymous';
  const payload = verifyJwt(token);
  return payload?.userId || 'anonymous';
}

// -----------------------------------------------------------------------------
// Trust scoring stub
// -----------------------------------------------------------------------------

/**
 * Demo signal set used when no real Plaid signals are supplied.
 *
 * Deliberately a constant, not a random draw: the demo build must reveal the
 * SAME limit every time it is shown, or a screenshot taken in a review meeting
 * won't match the one taken five minutes later.
 *
 * Scores to 77 → $1,000.00 limit (see scoreTrust / limitForScore below).
 */
const DEMO_SIGNALS: TrustSignals = {
  avgMonthlyInflowCents: 320_000, // $3,200/mo
  currentBalanceCents: 145_000, //   $1,450 on hand
  accountAgeMonths: 26, //           just over 2 years of history
  overdraftsLast90d: 0,
};

/**
 * Turn Plaid-style signals into a 0–100 trust score.
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
 *   4. OVERDRAFTS (penalty) — the strongest NEGATIVE signal, and the only one
 *      that can undo the other three. -12 points each, so three NSF events in a
 *      quarter erase a full income score no matter how large the deposits are.
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

  const raw = incomePoints + bufferPoints + tenurePoints - overdraftPenalty;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Map a trust score to a starting limit, in CENTS.
 *
 * Banded rather than continuous on purpose: a band is explainable to the user
 * ("you're in our $1,000 tier") and to a regulator, and it stops a $5 change in
 * balance from moving the number they were shown yesterday. Bands are also
 * where a real issuer's approved limit grid gets dropped in verbatim.
 *
 * A score under 20 returns 0 — that is NOT a decline, it routes to manual
 * review, because thin-file users legitimately score low here.
 */
export function limitForScore(score: number): number {
  if (score >= 80) return 150_000; // $1,500
  if (score >= 65) return 100_000; // $1,000
  if (score >= 50) return 50_000; //    $500
  if (score >= 35) return 25_000; //    $250
  if (score >= 20) return 10_000; //    $100
  return 0; //                          → manual review
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

function isStroke(v: unknown): v is CardStroke {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return typeof s.d === 'string' && typeof s.color === 'string' && typeof s.width === 'number';
}

/** Hard ceiling so a runaway canvas can't push a multi-megabyte body. */
const MAX_STROKES = 500;

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

export async function cardRoutes(server: FastifyInstance) {
  // POST /cards/designs
  server.post<{
    Body: { finish?: string; strokes?: unknown; updatedAt?: string };
  }>('/designs', async (request, reply) => {
    const userId = resolveUserId(request);
    const { finish, strokes, updatedAt } = request.body || {};

    if (typeof finish !== 'string' || !finish) {
      return reply.status(400).send({ success: false, error: 'finish is required' });
    }
    if (!Array.isArray(strokes) || !strokes.every(isStroke)) {
      return reply
        .status(400)
        .send({ success: false, error: 'strokes must be an array of {d,color,width}' });
    }
    if (strokes.length > MAX_STROKES) {
      return reply.status(413).send({ success: false, error: `too many strokes (max ${MAX_STROKES})` });
    }

    const now = new Date().toISOString();
    const record: CardDesignRecord = {
      id: newId('cdsn'),
      userId,
      finish,
      strokes: strokes as CardStroke[],
      // Client clock is untrusted for ordering, but it IS the user's own "last
      // edited" and the client echoes it back, so it is stored as given and
      // only defaulted when absent.
      updatedAt: typeof updatedAt === 'string' && updatedAt ? updatedAt : now,
      createdAt: now,
    };

    designs.set(record.id, record);

    return { success: true, data: { id: record.id } };
  });

  // GET /cards/designs/:id
  server.get<{ Params: { id: string } }>('/designs/:id', async (request, reply) => {
    const userId = resolveUserId(request);
    const record = designs.get(request.params.id);

    if (!record) {
      return reply.status(404).send({ success: false, error: 'Card design not found' });
    }
    // Anonymous designs stay readable by anyone holding the id (the id IS the
    // capability, pre-signup). Once a design is attributed to a real user, only
    // that user can read it back.
    if (record.userId !== 'anonymous' && record.userId !== userId) {
      return reply.status(404).send({ success: false, error: 'Card design not found' });
    }

    return {
      success: true,
      data: {
        id: record.id,
        finish: record.finish,
        strokes: record.strokes,
        updatedAt: record.updatedAt,
      },
    };
  });

  // POST /cards/access-list
  server.post<{
    Body: { mode?: string; designId?: string | null; signals?: Partial<TrustSignals> };
  }>('/access-list', async (request, reply) => {
    const userId = resolveUserId(request);
    const { mode, designId, signals } = request.body || {};

    if (mode !== 'plaid' && mode !== 'waitlist') {
      return reply
        .status(400)
        .send({ success: false, error: "mode must be 'plaid' or 'waitlist'" });
    }

    // A designId is optional (someone can join the waitlist without designing)
    // but if one is given it must exist, otherwise we'd print nothing later.
    if (designId && !designs.has(designId)) {
      return reply.status(404).send({ success: false, error: 'Card design not found' });
    }

    const base = {
      id: newId('cacc'),
      userId,
      designId: designId || null,
      mode,
      createdAt: new Date().toISOString(),
    };

    if (mode === 'waitlist') {
      const record: AccessRecord = { ...base, mode: 'waitlist', status: 'waitlist' };
      accessList.set(record.id, record);
      return { success: true, data: { status: record.status } };
    }

    // mode === 'plaid'. Real signals are accepted if the caller has them;
    // otherwise the deterministic demo set is scored so the flow is complete
    // end-to-end without Plaid credentials on the server.
    const resolved: TrustSignals = { ...DEMO_SIGNALS, ...(signals || {}) };
    const score = scoreTrust(resolved);
    const limitCents = limitForScore(score);
    const status: AccessStatus = limitCents > 0 ? 'approved_pending_issuance' : 'manual_review';

    const record: AccessRecord = {
      ...base,
      mode: 'plaid',
      status,
      limitCents,
      trustScore: score,
    };
    accessList.set(record.id, record);

    return {
      success: true,
      data: {
        status,
        // Omitted entirely rather than sent as 0, so the client never renders
        // "$0.00" as if it were an approved line.
        ...(limitCents > 0 ? { limitCents } : {}),
        trustScore: score,
      },
    };
  });
}

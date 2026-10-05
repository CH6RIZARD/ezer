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
// PERSISTENCE: Prisma. This used to hold both records in process-local Maps,
// which meant every deploy erased every saved design and every access-list
// decision — and Railway deploys on each push to main. Validation, scoring and
// the response shapes were written storage-agnostic and are unchanged by the
// swap; only the four reads and writes below moved.
// =============================================================================

import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '@ezer/db';
import { verifyJwt, extractTokenFromHeader } from '../utils/jwt';
import { assessAccess, type AccessStatus } from '../services/trustScoring';
import { highnoteEnabled, issueTestCard, readTestCard } from '../services/highnote';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type CardStroke = { d: string; color: string; width: number };


type AccessMode = 'plaid' | 'waitlist';


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

    // Client clock is untrusted for ordering, but it IS the user's own "last
    // edited" and the client echoes it back, so it is stored as given and only
    // defaulted when absent. createdAt is ours and is what ordering uses.
    const edited = typeof updatedAt === 'string' && updatedAt ? new Date(updatedAt) : new Date();
    const record = await prisma.cardDesign.create({
      data: {
        userId,
        finish,
        strokes: strokes as unknown as object,
        updatedAt: isNaN(edited.getTime()) ? new Date() : edited,
      },
    });

    return { success: true, data: { id: record.id } };
  });

  // GET /cards/designs/:id
  server.get<{ Params: { id: string } }>('/designs/:id', async (request, reply) => {
    const userId = resolveUserId(request);
    const record = await prisma.cardDesign.findUnique({ where: { id: request.params.id } });

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
        updatedAt: record.updatedAt.toISOString(),
      },
    };
  });

  // POST /cards/access-list
  server.post<{
    Body: { mode?: string; designId?: string | null };
  }>('/access-list', async (request, reply) => {
    const userId = resolveUserId(request);
    const { mode, designId } = request.body || {};

    if (mode !== 'plaid' && mode !== 'waitlist') {
      return reply
        .status(400)
        .send({ success: false, error: "mode must be 'plaid' or 'waitlist'" });
    }

    // A designId is optional (someone can join the waitlist without designing)
    // but if one is given it must exist, otherwise we'd print nothing later.
    if (designId) {
      const exists = await prisma.cardDesign.findUnique({ where: { id: designId }, select: { id: true } });
      if (!exists) {
        return reply.status(404).send({ success: false, error: 'Card design not found' });
      }
    }

    if (mode === 'waitlist') {
      const record = await prisma.cardAccessList.create({
        data: { userId, designId: designId || null, mode: 'waitlist', status: 'waitlist' },
      });
      return { success: true, data: { status: record.status } };
    }

    // mode === 'plaid'. Signals are derived server-side from the applicant's own
    // linked accounts; anything the client sent is ignored. A user must not be
    // able to state the income their credit line is computed from.
    //
    // No manual review branch: whether or not real signals came back — a
    // brand new account with no transaction history yet reads the same as
    // "no signals" — `scoreTrust` on empty/zeroed signals lands under 20,
    // and `limitForScore` gives that its real $25 floor. Fully automated,
    // every time, the same way Klarna re-underwrites per transaction rather
    // than sending a thin file to a queue. The one thing that CAN override the
    // floor is an uncured Pay in 4 miss — assessAccess folds that in from
    // InstallmentPlan/Installment, so re-checking here after a missed payment
    // returns 'suspended' the same way a fresh miss already did automatically.
    const { status, limitCents, trustScore } = await assessAccess(userId);

    await prisma.cardAccessList.create({
      data: { userId, designId: designId || null, mode: 'plaid', status, limitCents, trustScore },
    });

    // Approved → issue the Highnote TEST card in the background: onboarding
    // takes seconds and the join must not wait on it. GET /cards/highnote
    // reports 'pending' meanwhile.
    if (userId !== 'anonymous' && status === 'approved_pending_issuance' && limitCents > 0 && highnoteEnabled()) {
      void issueTestCard(userId, limitCents).catch(err => request.log.error({ err: err.message, userId }, 'highnote issuance failed'));
    }

    return {
      success: true,
      data: { status, limitCents, trustScore },
    };
  });

  // GET /cards/access-list — read back the decision POST /cards/access-list
  // already made. The client mirrors that decision into on-device storage
  // (utils/cardDesignStore.ts's CardAccessOutcome) so Home's Spending Power
  // tile doesn't need a network call on every render, but that mirror is the
  // ONLY copy — there was no way to read it back from here at all. A
  // reinstall, a cleared app, or a second device wipes the local copy while
  // this exact row still sits in Postgres, and the person is right back to
  // "not yet assessed" for a decision the server already made. This is what
  // useCardFlowStatus.ts reconciles against when local storage comes back
  // empty.
  server.get('/access-list', async (request, reply) => {
    const userId = resolveUserId(request);

    // 'anonymous' is one SHARED bucket, not a person — reading its latest row
    // would hand one signed-out visitor another visitor's assessment. No
    // token, no stored decision to reconcile; the client's local mirror is
    // all a pre-signup user has.
    if (userId === 'anonymous') {
      return { success: true, data: null };
    }

    const latest = await prisma.cardAccessList.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        status: latest.status,
        ...(latest.limitCents && latest.limitCents > 0 ? { limitCents: latest.limitCents } : {}),
        joinedAt: latest.createdAt.toISOString(),
      },
    };
  });

  /**
   * POST /cards/pay-in4-account — Settings' account picker
   * (PayIn4AccountPicker.tsx). Sets User.payIn4InstrumentId to a SPECIFIC
   * linked account and immediately re-runs the real assessment against it
   * (assessAccess resolves the same id right back out — see trustScoring.ts),
   * writing a fresh CardAccessList row exactly like a normal
   * POST /cards/access-list would. Anonymous callers are rejected outright:
   * unlike card design, there is no pre-signup reason to be choosing which
   * bank funds Pay in 4.
   */
  server.post<{ Body: { instrumentId?: string } }>('/pay-in4-account', async (request, reply) => {
    const userId = resolveUserId(request);
    if (userId === 'anonymous') {
      return reply.status(401).send({ success: false, error: 'Sign in required' });
    }

    const { instrumentId } = request.body || {};
    if (!instrumentId || typeof instrumentId !== 'string') {
      return reply.status(400).send({ success: false, error: 'instrumentId is required' });
    }

    const instrument = await prisma.fundingInstrument.findFirst({ where: { id: instrumentId, userId } });
    if (!instrument) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }
    if (instrument.type !== 'bank') {
      // Mirrors the mock's own rule verbatim: "Credit cards can't fund Pay
      // in 4, so they're not listed" — enforced here too, not just hidden
      // from the picker's list, in case a stale client sends one anyway.
      return reply.status(400).send({ success: false, error: 'Only checking or savings accounts can fund Pay in 4' });
    }

    await prisma.user.update({ where: { id: userId }, data: { payIn4InstrumentId: instrument.id } });

    const { status, limitCents, trustScore } = await assessAccess(userId);
    await prisma.cardAccessList.create({
      data: { userId, designId: null, mode: 'plaid', status, limitCents, trustScore },
    });

    return { success: true, data: { status, limitCents, trustScore } };
  });

  /**
   * GET /cards/highnote — the user's Highnote TEST card and its live Pay in 4
   * schedules. `status: 'pending'` while issueTestCard is still onboarding.
   */
  server.get('/highnote', async (request, reply) => {
    const userId = resolveUserId(request);
    if (userId === 'anonymous') return reply.status(401).send({ success: false, error: 'Sign in required' });
    if (!highnoteEnabled()) return { success: true, data: { status: 'none' } };
    const view = await readTestCard(userId);
    if (view.status === 'none') {
      // Approved before card issuing existed: issue now rather than making
      // them re-check Spending Power.
      const latest = await prisma.cardAccessList.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (latest?.status === 'approved_pending_issuance' && latest.limitCents && latest.limitCents > 0) {
        void issueTestCard(userId, latest.limitCents).catch(err => request.log.error({ err: err.message, userId }, 'highnote issuance failed'));
        return { success: true, data: { status: 'pending' } };
      }
    }
    return { success: true, data: view };
  });
}

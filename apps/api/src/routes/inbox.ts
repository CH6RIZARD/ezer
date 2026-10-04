import { FastifyInstance } from 'fastify';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import {
  detectedSubscriptionsSchema,
  normalizeMerchantName,
  stripReferenceNumbers,
} from '@ezer/shared';

// Inbox-based subscription detection. The mailbox is read ON THE PHONE
// (apps/mobile/utils/inboxScan/); this module only ever receives the derived
// fields in detectedSubscriptionSchema — no message text, sender address or
// OAuth token reaches this server. That is the basis of the "restricted-scope
// data is not stored or transmitted server-side" claim in SCOPES.md and the
// privacy policy, so do not add a field here that carries raw email content.
//
// Gated until Google approves gmail.readonly: INBOX_SCAN_ENABLED=1 turns it on
// for everyone; until then only emails in INBOX_SCAN_ALLOWLIST (comma-separated,
// the same test users added on Google's consent screen) see it.
function inboxScanEnabledFor(email: string | undefined): boolean {
  if (process.env.INBOX_SCAN_ENABLED === '1') return true;
  const allow = (process.env.INBOX_SCAN_ALLOWLIST || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allow.includes(email.trim().toLowerCase());
}

const MIN_CONFIDENCE = 0.5;

export async function inboxRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  server.get('/inbox-scan/enabled', async request => {
    return { success: true, data: { enabled: inboxScanEnabledFor((request as any).userEmail) } };
  });

  // POST /subscriptions/detected — merge on-device findings into the same
  // Merchant/Subscription/PriceHistory/Trial rows Plaid sync writes
  // (routes/plaid.ts syncTransactionsForItem). Matching on the normalised
  // merchant name is what merges the two sources: an email receipt for a
  // subscription Plaid already found updates that row instead of duplicating
  // it. Email never overwrites what Plaid derived from real charges — it only
  // fills gaps (cadence, renewal date, price) and adds trials, which Plaid
  // cannot see at all. Trials land in the Trial table, so /risks and the
  // Alerts tab surface "converts on <date>" with no extra wiring.
  server.post('/subscriptions/detected', async (request, reply) => {
    const userId = (request as any).userId;
    if (!inboxScanEnabledFor((request as any).userEmail)) {
      return reply.status(403).send({ success: false, error: 'Inbox scanning is not enabled for this account' });
    }

    const parsed = detectedSubscriptionsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.issues.map((i: { message: string }) => i.message).join(', ') });
    }

    const now = new Date();
    let created = 0;
    let updated = 0;

    for (const item of parsed.data.items) {
      if (item.confidence < MIN_CONFIDENCE) continue;
      const canonicalName = normalizeMerchantName(stripReferenceNumbers(item.merchant));
      if (!canonicalName) continue;

      // item.cancelUrl is deliberately NOT written anywhere: Merchant rows are
      // GLOBAL (unique by canonicalName, served to every user), so a
      // client-supplied URL landing in cancellationPlaybook is a stored
      // phishing link the mobile app would open first. Curated playbooks stay
      // read-only from this route.
      // ponytail: per-user cancelUrl on the Subscription row is the upgrade
      // path if the product wants user-sourced links back.
      let merchant = await prisma.merchant.findUnique({ where: { canonicalName } });
      if (!merchant) {
        merchant = await prisma.merchant.create({
          data: {
            canonicalName,
            fingerprintKeys: { patterns: [canonicalName] },
            cancellationDifficulty: 3,
          },
        });
      }

      const trialEnd = item.trialEndsAt ? new Date(item.trialEndsAt) : null;
      const inTrial = !!trialEnd && trialEnd > now;
      const nextCharge = item.nextChargeDate ? new Date(item.nextChargeDate) : null;

      let subscription = await prisma.subscription.findFirst({
        where: { userId, merchantId: merchant.id, status: { in: ['active', 'trial'] } },
      });

      if (!subscription) {
        subscription = await prisma.subscription.create({
          data: {
            userId,
            merchantId: merchant.id,
            status: inTrial ? 'trial' : 'active',
            cadence: item.cadence,
            renewalDate: inTrial ? trialEnd : nextCharge,
          },
        });
        created++;
      } else {
        const fill: { cadence?: typeof item.cadence; renewalDate?: Date } = {};
        if (subscription.cadence === 'unknown' && item.cadence !== 'unknown') fill.cadence = item.cadence;
        if (!subscription.renewalDate && nextCharge) fill.renewalDate = nextCharge;
        if (Object.keys(fill).length) {
          subscription = await prisma.subscription.update({ where: { id: subscription.id }, data: fill });
        }
        updated++;
      }

      if (item.amountCents) {
        const month = now.toISOString().slice(0, 7);
        // update: {} — a Plaid-observed charge for this month wins over an email.
        await prisma.priceHistory.upsert({
          where: { subscriptionId_month: { subscriptionId: subscription.id, month } },
          create: { subscriptionId: subscription.id, month, amountCents: item.amountCents },
          update: {},
        });
      }

      if (inTrial && trialEnd) {
        await prisma.trial.upsert({
          where: { subscriptionId: subscription.id },
          create: { subscriptionId: subscription.id, trialEndDate: trialEnd, detectedFrom: 'email' },
          update: { trialEndDate: trialEnd },
        });
      }
    }

    return { success: true, data: { created, updated } };
  });
}

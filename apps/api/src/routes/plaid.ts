import { FastifyInstance } from 'fastify';
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode, Transaction } from 'plaid';
import { prisma } from '@ezer/db';
import { authMiddleware } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/encryption';
import {
  normalizeMerchantName,
  isSubscriptionCandidate,
  stripReferenceNumbers,
  inferBillingInterval,
  hasStableAmount,
} from '@ezer/shared';

export function getPlaidClient() {
  const config = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID || '',
        'PLAID-SECRET': process.env.PLAID_SECRET || '',
      },
    },
  });
  return new PlaidApi(config);
}

// Map Plaid account type → our FundingInstrumentType
function mapAccountType(type: string): 'card' | 'bank' {
  return type === 'credit' ? 'card' : 'bank';
}

// ---------------------------------------------------------------------------
// Subscription eligibility and recurrence live in @ezer/shared.
//
// They were briefly duplicated here, which is precisely how the two copies
// would drift: this file already imported `detectRecurrence` from shared and
// then ignored it in favour of a looser local `inferInterval`. One tested
// implementation, imported — see packages/shared/src/subscriptionDetection.test.ts,
// which pins every false positive this sync produced against a real Plaid item.
// ---------------------------------------------------------------------------

/** Adapt Plaid's Transaction to the portable shape @ezer/shared expects. */
function toCandidate(tx: Transaction) {
  return {
    amount: tx.amount,
    personalFinanceCategory: (tx as any).personal_finance_category?.primary ?? null,
    // The detailed category is what separates a coffee from a streaming plan
    // when both arrive on a perfect monthly cadence.
    personalFinanceCategoryDetailed:
      (tx as any).personal_finance_category?.detailed ?? null,
    categories: tx.category ?? null,
  };
}

export async function plaidRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // POST /plaid/create-link-token
  server.post('/create-link-token', async (request, reply) => {
    const userId = (request as any).userId;

    if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
      return reply.status(503).send({ success: false, error: 'Plaid not configured on this server' });
    }

    const plaid = getPlaidClient();
    const res = await plaid.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'EZER',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    return { success: true, data: { linkToken: res.data.link_token } };
  });

  // POST /plaid/exchange-public-token
  server.post<{ Body: { publicToken: string; institutionId: string; institutionName: string; accounts: any[] } }>(
    '/exchange-public-token',
    async (request, reply) => {
      const userId = (request as any).userId;
      const { publicToken, institutionId, institutionName, accounts } = request.body;

      if (!publicToken) return reply.status(400).send({ success: false, error: 'publicToken required' });

      const plaid = getPlaidClient();

      // Exchange public token for access token
      const exchangeRes = await plaid.itemPublicTokenExchange({ public_token: publicToken });
      const { access_token, item_id } = exchangeRes.data;

      // Accounts come from PLAID, not from the client.
      //
      // This used to persist whatever `accounts` the app sent in the body. Link
      // metadata is a client-controlled convenience field: it is empty whenever
      // the caller omits it, and it is trivially forgeable. Storing it meant a
      // successful bank link could produce an item with zero accounts, which is
      // exactly what happened — Wallet stayed empty, no FundingInstrument rows
      // were written, and the savings engine had no balance to read.
      //
      // accountsGet is authoritative and costs one call we are already
      // authenticated for. The client's list is kept only as a fallback for the
      // case where that call fails, so linking still records something.
      let resolvedAccounts: any[] = Array.isArray(accounts) ? accounts : [];
      try {
        const acctRes = await plaid.accountsGet({ access_token });
        resolvedAccounts = acctRes.data.accounts.map(a => ({
          id: a.account_id,
          name: a.name,
          mask: a.mask,
          type: a.type,
          subtype: a.subtype,
          institutionId,
          institutionName,
        }));
      } catch (err) {
        request.log.warn({ err }, 'accountsGet failed; falling back to client-supplied accounts');
      }

      // Save encrypted access token
      const accessTokenEnc = encrypt(access_token);
      await prisma.plaidItem.upsert({
        where: { plaidItemId: item_id },
        create: {
          userId,
          plaidItemId: item_id,
          accessTokenEnc,
          institutionId,
          institutionName,
          accounts: (resolvedAccounts ?? []) as object,
        },
        update: {
          accessTokenEnc,
          institutionId,
          institutionName,
          accounts: (resolvedAccounts ?? []) as object,
        },
      });

      // Create FundingInstrument records for each Plaid account
      for (const account of resolvedAccounts) {
        const existing = await prisma.fundingInstrument.findFirst({
          where: { userId, last4: account.mask, displayName: account.name },
        });
        if (!existing) {
          await prisma.fundingInstrument.create({
            data: {
              userId,
              type: mapAccountType(account.type),
              displayName: account.name,
              brand: account.type === 'credit' ? 'Unknown' : 'Bank',
              last4: account.mask || '****',
              isDefault: false,
            },
          });
        }
      }

      // Kick off transaction sync
      await syncTransactionsForItem(userId, item_id, access_token);

      return { success: true, data: { itemId: item_id, institutionName } };
    }
  );

  // POST /plaid/sync — re-sync all items for user
  server.post('/sync', async (request, reply) => {
    const userId = (request as any).userId;

    const items = await prisma.plaidItem.findMany({ where: { userId } });
    if (items.length === 0) {
      return reply.status(404).send({ success: false, error: 'No linked bank accounts found' });
    }

    let totalNew = 0;
    for (const item of items) {
      const accessToken = decrypt(item.accessTokenEnc);
      const count = await syncTransactionsForItem(userId, item.plaidItemId, accessToken);
      totalNew += count;
      await prisma.plaidItem.update({ where: { id: item.id }, data: { lastSyncAt: new Date() } });
    }

    return { success: true, data: { newSubscriptionsDetected: totalNew } };
  });

  /**
   * GET /plaid/balance — live balances for every linked account.
   *
   * The savings engine's whole premise is "only move what you can spare", which
   * is unanswerable without a real balance. Everything downstream of this — the
   * sweep decision, the Autopilot card's "next save", the buffer comparison —
   * was reading a placeholder until this existed.
   *
   * `available` is preferred over `current` where Plaid supplies it: `current`
   * includes pending debits that have not cleared, so sweeping against it is
   * how an automatic saver causes an overdraft.
   */
  server.get('/balance', async (request, reply) => {
    const userId = (request as any).userId;

    const items = await prisma.plaidItem.findMany({ where: { userId } });
    if (items.length === 0) {
      return reply.status(404).send({ success: false, error: 'No linked bank accounts found' });
    }

    const plaid = getPlaidClient();
    const accounts: any[] = [];

    for (const item of items) {
      try {
        const res = await plaid.accountsBalanceGet({ access_token: decrypt(item.accessTokenEnc) });
        for (const a of res.data.accounts) {
          const available = a.balances.available ?? a.balances.current ?? 0;
          accounts.push({
            accountId: a.account_id,
            name: a.name,
            mask: a.mask,
            type: a.type,
            subtype: a.subtype,
            institutionName: item.institutionName,
            // Cents on the wire, like every other amount in this API.
            availableCents: Math.round(available * 100),
            currentCents: Math.round((a.balances.current ?? 0) * 100),
            isoCurrencyCode: a.balances.iso_currency_code ?? 'USD',
          });
        }
      } catch (err) {
        // One dead item must not blank out every other linked account.
        request.log.warn({ err, itemId: item.plaidItemId }, 'balance fetch failed for item');
      }
    }

    // The account the sweep draws from: the first depository/checking account.
    const checking =
      accounts.find(a => a.type === 'depository' && a.subtype === 'checking') ??
      accounts.find(a => a.type === 'depository') ??
      null;

    return {
      success: true,
      data: {
        accounts,
        checkingAccountId: checking?.accountId ?? null,
        checkingAvailableCents: checking?.availableCents ?? null,
      },
    };
  });

  // GET /plaid/accounts — list all linked accounts
  server.get('/accounts', async (request, reply) => {
    const userId = (request as any).userId;
    const items = await prisma.plaidItem.findMany({ where: { userId } });
    return {
      success: true,
      data: items.map(item => ({
        itemId: item.plaidItemId,
        institutionName: item.institutionName,
        institutionId: item.institutionId,
        accounts: item.accounts,
        lastSyncAt: item.lastSyncAt,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Core sync logic: fetch transactions → detect recurring → upsert subscriptions
// ---------------------------------------------------------------------------
async function syncTransactionsForItem(userId: string, itemId: string, accessToken: string): Promise<number> {
  const plaid = getPlaidClient();

  // Fetch up to 12 months of transactions
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const endDate = new Date();

  let allTransactions: Transaction[] = [];
  let cursor: string | undefined;

  // Use transactions/sync for incremental fetches
  let hasMore = true;
  while (hasMore) {
    const res = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
    });
    allTransactions = allTransactions.concat(res.data.added);
    cursor = res.data.next_cursor;
    hasMore = res.data.has_more;
  }

  if (allTransactions.length === 0) return 0;

  // Get user's funding instruments for matching
  const instruments = await prisma.fundingInstrument.findMany({ where: { userId } });

  // Group transactions by normalized merchant name
  const byMerchant = new Map<string, { txs: Transaction[]; amounts: number[] }>();

  for (const tx of allTransactions) {
    // Category filter first: transfers, loan payments and income can never be
    // a subscription no matter how regular they look.
    if (!isSubscriptionCandidate(toCandidate(tx))) continue;

    const raw = tx.merchant_name || tx.name;
    const canonical = normalizeMerchantName(stripReferenceNumbers(raw));
    if (!canonical) continue;

    const existing = byMerchant.get(canonical);
    if (existing) {
      existing.txs.push(tx);
      existing.amounts.push(Math.round(tx.amount * 100));
    } else {
      byMerchant.set(canonical, { txs: [tx], amounts: [Math.round(tx.amount * 100)] });
    }
  }

  let newSubscriptions = 0;

  for (const [canonicalName, { txs, amounts }] of byMerchant) {
    // Three charges minimum — see inferInterval. Two is one interval, which
    // cannot distinguish a subscription from a coincidence.
    if (txs.length < 3) continue;

    const dates = txs.map(t => new Date(t.date));
    const interval = inferBillingInterval(dates);
    if (interval === 'unknown') continue; // gaps are not regular enough

    // Regular timing AND a stable price. Either alone produces false positives.
    if (!hasStableAmount(amounts)) continue;

    // Store raw transactions
    for (const tx of txs) {
      await prisma.transaction.upsert({
        where: { id: tx.transaction_id },
        create: {
          id: tx.transaction_id,
          userId,
          merchantNameRaw: tx.merchant_name || tx.name,
          amountCents: Math.round(tx.amount * 100),
          date: new Date(tx.date),
          source: 'plaid',
          rawData: tx as any,
        },
        update: {},
      });
    }

    // Find or create merchant
    let merchant = await prisma.merchant.findUnique({ where: { canonicalName } });
    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          canonicalName,
          fingerprintKeys: { patterns: [canonicalName.toLowerCase()] },
          cancellationDifficulty: 3,
        },
      });
    }

    // Find or create subscription
    let subscription = await prisma.subscription.findFirst({
      where: { userId, merchantId: merchant.id, status: { in: ['active', 'trial'] } },
    });

    if (!subscription) {
      subscription = await prisma.subscription.create({
        data: {
          userId,
          merchantId: merchant.id,
          status: 'active',
          cadence: interval,
          startedAt: dates.reduce((a, b) => (a < b ? a : b)),
        },
      });
      newSubscriptions++;
    }

    // Upsert subscription charges
    for (const tx of txs) {
      const amountCents = Math.round(tx.amount * 100);
      const chargeDate = new Date(tx.date);

      // Find best matching funding instrument by account_id mask
      const accountMask = (tx as any).account_id ? tx.account_id.slice(-4) : null;
      const instrument = instruments.find(i => accountMask && i.last4 === accountMask)
        || instruments[0];

      if (!instrument) continue;

      const existing = await prisma.subscriptionCharge.findFirst({
        where: { userId, merchantId: merchant.id, chargeTimestamp: chargeDate, amountCents },
      });

      if (!existing) {
        await prisma.subscriptionCharge.create({
          data: {
            userId,
            merchantId: merchant.id,
            merchantName: canonicalName,
            amountCents,
            billingInterval: interval,
            chargeTimestamp: chargeDate,
            fundingInstrumentId: instrument.id,
            inferenceSource: 'transaction',
            confidenceScore: 0.9,
            evidenceRef: tx.transaction_id,
          },
        });
      }

      // Track price history by month
      const monthKey = chargeDate.toISOString().slice(0, 7);
      await prisma.priceHistory.upsert({
        where: { subscriptionId_month: { subscriptionId: subscription.id, month: monthKey } },
        create: { subscriptionId: subscription.id, month: monthKey, amountCents },
        update: { amountCents },
      });
    }

    // Set renewal date from most recent charge + one interval
    const latestDate = dates.reduce((a, b) => (a > b ? a : b));
    const renewalDate = new Date(latestDate);
    if (interval === 'monthly') renewalDate.setMonth(renewalDate.getMonth() + 1);
    else if (interval === 'yearly') renewalDate.setFullYear(renewalDate.getFullYear() + 1);
    else if (interval === 'weekly') renewalDate.setDate(renewalDate.getDate() + 7);

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { renewalDate, cadence: interval },
    });
  }

  return newSubscriptions;
}

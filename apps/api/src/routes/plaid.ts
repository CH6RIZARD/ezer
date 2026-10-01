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

/**
 * Plaid's SDK throws a plain Axios error on any non-2xx response. Left
 * unhandled, that error's `.message` is just "Request failed with status
 * code 400" — Axios's own generic wording, not anything Plaid said — and an
 * uncaught throw in an async route handler falls through to Fastify's
 * default error response, which serializes exactly that useless string. The
 * real reason (an `error_code` like PRODUCTS_NOT_SUPPORTED, PLAID_ENV
 * misconfigured against these keys, the production application not yet
 * approved for a requested product, ...) lives in `err.response.data` and
 * was being discarded. Call this from a catch block so it reaches the
 * client instead.
 */
function plaidErrorReply(err: any): { status: number; error: string } {
  const data = err?.response?.data;
  const status = typeof err?.response?.status === 'number' ? err.response.status : 502;
  if (data?.error_code) {
    return {
      status,
      error: `Plaid ${data.error_code}${data.error_message ? `: ${data.error_message}` : ''}`,
    };
  }
  // No structured Plaid response at all — network failure or Plaid itself
  // down, not a request Plaid rejected.
  return { status: 502, error: err?.message || 'Plaid request failed' };
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
    try {
      const res = await plaid.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'EZER',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });

      return { success: true, data: { linkToken: res.data.link_token } };
    } catch (err: any) {
      const { status, error } = plaidErrorReply(err);
      request.log.error({ err: err?.response?.data || err?.message }, 'linkTokenCreate failed');
      return reply.status(status).send({ success: false, error });
    }
  });

  // POST /plaid/exchange-public-token
  server.post<{
    Body: {
      publicToken: string;
      institutionId: string;
      institutionName: string;
      accounts: any[];
      /** UI grouping label only — see the schema comment on
       *  FundingInstrument.purpose. Optional; general-purpose links omit it. */
      purpose?: string;
    };
  }>(
    '/exchange-public-token',
    async (request, reply) => {
      const userId = (request as any).userId;
      const { publicToken, institutionId, institutionName, accounts, purpose } = request.body;

      if (!publicToken) return reply.status(400).send({ success: false, error: 'publicToken required' });

      const plaid = getPlaidClient();

      // Exchange public token for access token
      let access_token: string, item_id: string;
      try {
        const exchangeRes = await plaid.itemPublicTokenExchange({ public_token: publicToken });
        ({ access_token, item_id } = exchangeRes.data);
      } catch (err: any) {
        const { status, error } = plaidErrorReply(err);
        request.log.error({ err: err?.response?.data || err?.message }, 'itemPublicTokenExchange failed');
        return reply.status(status).send({ success: false, error });
      }

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

      // Real institution branding, not an invented skin.
      //
      // Plaid has no product that returns what a specific physical card
      // looks like — no photo, no card-product artwork, and no other bank
      // data aggregator exposes that either. What Plaid DOES have for known
      // institutions is /institutions/get with include_optional_metadata:
      // the bank's actual logo and brand color. FundingInstrument already
      // had issuerColorHint and networkArt columns sitting unused — this is
      // what they were for. A card tinted in the real bank's own color with
      // the real bank's own logo is the closest honest approximation to
      // "looks like the card you have" that any of this data can support;
      // genuinely reproducing the card's own artwork is not something any
      // of it can do.
      let issuerColorHint: string | null = null;
      let networkArt: string | null = null;
      if (institutionId) {
        try {
          const instRes = await plaid.institutionsGetById({
            institution_id: institutionId,
            country_codes: [CountryCode.Us],
            options: { include_optional_metadata: true },
          });
          const inst = instRes.data.institution;
          if (inst.primary_color) issuerColorHint = inst.primary_color;
          if (inst.logo) networkArt = `data:image/png;base64,${inst.logo}`;
        } catch (err) {
          // Plaid does not have branding for every institution — a smaller
          // credit union may simply have none. Falling back to the generic
          // skin is correct there, not a failure worth surfacing.
          request.log.warn({ err, institutionId }, 'institutionsGetById failed; using generic card skin');
        }
      }
      // Plaid has no logo for this institution specifically (confirmed for
      // PNC — real brand color, no logo in their institution data). Guess
      // one from the bank's own name via the same public favicon CDN
      // MerchantMark falls back to for merchants: most banks really are at
      // their own name dot com ("PNC" -> pnc.com, "Bank of America" ->
      // bankofamerica.com), and a wrong or dead guess just renders the
      // CDN's generic globe icon on-device rather than failing loudly.
      if (!networkArt && institutionName) {
        const guess = institutionName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (guess.length >= 2) {
          // 256, not an arbitrary value — this favicon service only actually
          // serves a handful of fixed sizes and silently returns a tiny
          // 16x16 image for anything that doesn't land on one exactly
          // (verified directly; see the identical note in MerchantMark.tsx).
          networkArt = `https://www.google.com/s2/favicons?domain=${guess}.com&sz=256`;
        }
      }

      // Save encrypted access token
      const accessTokenEnc = encrypt(access_token);
      const plaidItemRow = await prisma.plaidItem.upsert({
        where: { plaidItemId: item_id },
        create: {
          userId,
          plaidItemId: item_id,
          accessTokenEnc,
          institutionId,
          institutionName,
          accounts: (resolvedAccounts ?? []) as object,
          // A bank linked specifically for Pay in 4 defaults to NOT reading
          // for subscriptions — SpendingPowerSheet's "Connect a new bank" is
          // for someone who wants a bank separate from the one subscriptions
          // already read from; reading it too would quietly undo that
          // separation. General-purpose links (no purpose tag) keep the
          // column's own true default.
          ...(purpose === 'pay_in_4' ? { readForSubscriptions: false } : {}),
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
              issuerColorHint,
              networkArt,
              institutionName,
              // Plaid's own stable account id — the real key
              // syncTransactionsForItem needs to attribute a charge to THIS
              // instrument rather than the mask-derived guess that used to
              // sit there. See the schema comment for why that guess never
              // actually worked.
              plaidAccountId: account.id,
              subtype: account.subtype || null,
              itemId: plaidItemRow.id,
              purpose: purpose || null,
            },
          });
        } else if (issuerColorHint || networkArt || institutionName || account.id || purpose) {
          // Re-linking an account that predates this feature: backfill the
          // branding onto the existing row instead of leaving it stuck with
          // the generic skin forever. `purpose` backfills the same way — if
          // someone re-links an already-known account specifically from the
          // Spending Power screen, it's reasonable to tag it now even though
          // it was general-purpose before; never clears an existing tag.
          await prisma.fundingInstrument.update({
            where: { id: existing.id },
            data: {
              issuerColorHint: existing.issuerColorHint ?? issuerColorHint,
              networkArt: existing.networkArt ?? networkArt,
              institutionName: existing.institutionName ?? institutionName,
              plaidAccountId: existing.plaidAccountId ?? account.id,
              subtype: existing.subtype ?? (account.subtype || null),
              itemId: existing.itemId ?? plaidItemRow.id,
              purpose: existing.purpose ?? (purpose || null),
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

    const allItems = await prisma.plaidItem.findMany({ where: { userId } });
    if (allItems.length === 0) {
      return reply.status(404).send({ success: false, error: 'No linked bank accounts found' });
    }
    // A bank connected for Pay in 4 only (Settings' "Read this bank for
    // subscriptions" switch off) must not have its charges scanned for
    // recurring payments — that is the entire point of the switch. Its
    // balance is still readable via GET /plaid/balance / the trust-score
    // assessment, which is a different read than this one.
    const items = allItems.filter(i => i.readForSubscriptions);

    // One bad item must not take every other linked account down with it.
    // Before this, a single revoked/expired OAuth connection (Plaid's
    // ITEM_LOGIN_REQUIRED — the user changed their bank password, re-auth
    // expired, etc.) threw out of transactionsSync with nothing here to
    // catch it, aborting the loop entirely: every OTHER linked item — even
    // ones syncing fine — silently stopped getting new data the moment any
    // one item broke, with no error surfaced anywhere except a generic 400
    // on every subsequent sync call.
    let totalNew = 0;
    const failed: { plaidItemId: string; institutionName: string | null; reason: string }[] = [];
    for (const item of items) {
      try {
        const accessToken = decrypt(item.accessTokenEnc);
        const count = await syncTransactionsForItem(userId, item.plaidItemId, accessToken);
        totalNew += count;
        await prisma.plaidItem.update({ where: { id: item.id }, data: { lastSyncAt: new Date() } });
      } catch (err: any) {
        const reason = err?.response?.data?.error_code || err?.message || 'unknown';
        request.log.warn({ err, plaidItemId: item.plaidItemId }, 'sync failed for one item; continuing with the rest');
        failed.push({ plaidItemId: item.plaidItemId, institutionName: item.institutionName, reason });
      }
    }

    return {
      success: true,
      data: {
        newSubscriptionsDetected: totalNew,
        ...(failed.length > 0 ? { itemsNeedingReauth: failed } : {}),
      },
    };
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

  /**
   * GET /plaid/linked-banks — Settings' "Linked banks" screen, grouped by
   * bank rather than the flat FundingInstrument list /wallet/instruments
   * returns. Also the only place `payIn4InstrumentId` is exposed to the
   * client, and the only place `eligibleForPayIn4` is computed (non-credit —
   * `type === 'bank'` is the whole eligibility rule; see the schema comment
   * on FundingInstrument.subtype for why subtype itself is display-only).
   */
  server.get('/linked-banks', async (request, reply) => {
    const userId = (request as any).userId;

    const [user, items] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { payIn4InstrumentId: true } }),
      prisma.plaidItem.findMany({
        where: { userId },
        include: { fundingInstruments: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    let payIn4InstrumentId = user?.payIn4InstrumentId ?? null;

    // Auto-pick the oldest eligible (non-credit) account the moment someone
    // VIEWS this screen, not only once an assessment has actually run
    // (trustScoring.ts's own resolvePayIn4Instrument — duplicated here in
    // miniature rather than imported, to avoid a circular import: that file
    // already imports getPlaidClient from this one). Before this, a user
    // with real linked banks but no assessment yet saw "No account chosen"
    // and a "Connect a new bank" prompt as if nothing were linked at all —
    // technically accurate (nothing WAS chosen) but a confusing thing to
    // show someone who very visibly already has banks connected.
    if (!payIn4InstrumentId) {
      const fallback = items
        .flatMap(item => item.fundingInstruments)
        .filter(inst => inst.type === 'bank')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (fallback) {
        payIn4InstrumentId = fallback.id;
        await prisma.user.update({ where: { id: userId }, data: { payIn4InstrumentId } }).catch(() => {
          // Best-effort — worst case this screen re-picks the same account
          // next time it's opened, which is a no-op in every way that matters.
        });
      }
    }

    return {
      success: true,
      data: {
        payIn4InstrumentId,
        // Items with zero accounts are leftover rows from a bank being
        // RE-linked through Plaid Link rather than reconnected via the
        // existing item — the exchange handler always upserts the item by
        // its Plaid item id, but a fresh Link session can mint a brand new
        // item id for what is, to the user, "the same bank," leaving the
        // earlier item behind with no FundingInstrument rows pointing at it
        // (see FundingInstrument.itemId's own schema comment). They showed
        // up as empty duplicate "PNC" rows with no accounts, no last-4,
        // nothing to tap into — filtered here rather than deleted, since
        // deleting still means revoking a real Plaid access token, which
        // should be a deliberate disconnect action, not a side effect of
        // loading a list.
        items: items
          .filter(item => item.fundingInstruments.length > 0)
          .map(item => ({
          itemId: item.id,
          institutionName: item.institutionName,
          connectedAt: item.createdAt.toISOString(),
          readForSubscriptions: item.readForSubscriptions,
          // The bank's real logo (Plaid's own institution branding, or the
          // favicon-guess fallback — see exchange-public-token's comment)
          // and brand color, from whichever account on this item has them.
          // Same source Wallet's own card art already uses
          // (utils/cardArt → BankCardFace's art.logoUri); Settings never
          // rendered it at all before, just a flat colored initial letter.
          networkArt: item.fundingInstruments.find(i => i.networkArt)?.networkArt ?? null,
          issuerColorHint: item.fundingInstruments.find(i => i.issuerColorHint)?.issuerColorHint ?? null,
          accounts: item.fundingInstruments.map(inst => ({
            instrumentId: inst.id,
            displayName: inst.displayName,
            last4: inst.last4,
            subtype: inst.subtype,
            type: inst.type,
            isPayIn4: inst.id === payIn4InstrumentId,
            eligibleForPayIn4: inst.type === 'bank',
          })),
        })),
      },
    };
  });

  /**
   * POST /plaid/items/:id/read-for-subscriptions — Settings' bank-detail
   * switch. Turning ON triggers a real sync for just this item so newly-
   * readable history shows up immediately rather than waiting for the next
   * app-open's background sync; turning off is instant (nothing to fetch —
   * the item's existing Subscription rows are left as-is, same as any other
   * bank that stops billing: they age out through the normal renewal-date
   * flow, not a bulk delete here).
   */
  server.post<{ Params: { id: string }; Body: { enabled?: boolean } }>(
    '/items/:id/read-for-subscriptions',
    async (request, reply) => {
      const userId = (request as any).userId;
      const { enabled } = request.body || {};
      if (typeof enabled !== 'boolean') {
        return reply.status(400).send({ success: false, error: 'enabled must be a boolean' });
      }

      const item = await prisma.plaidItem.findFirst({ where: { id: request.params.id, userId } });
      if (!item) return reply.status(404).send({ success: false, error: 'Bank not found' });

      await prisma.plaidItem.update({ where: { id: item.id }, data: { readForSubscriptions: enabled } });

      if (enabled) {
        try {
          const count = await syncTransactionsForItem(userId, item.plaidItemId, decrypt(item.accessTokenEnc));
          await prisma.plaidItem.update({ where: { id: item.id }, data: { lastSyncAt: new Date() } });
          return { success: true, data: { readForSubscriptions: true, newSubscriptionsDetected: count } };
        } catch (err) {
          // The flag is already flipped and saved — a sync failure here just
          // means the next regular /plaid/sync call picks it up, the same as
          // any other item whose sync happens to fail once.
          request.log.warn({ err, itemId: item.id }, 'sync failed right after enabling subscription reading');
          return { success: true, data: { readForSubscriptions: true, newSubscriptionsDetected: 0 } };
        }
      }

      return { success: true, data: { readForSubscriptions: false } };
    }
  );

  /**
   * DELETE /plaid/items/:id — disconnect ONE bank, unlike DELETE /account
   * (account.ts) which revokes every item as part of deleting the whole
   * account. Same ordering rule applies for the same reason: Plaid FIRST.
   * Deleting the row first would destroy the access token, leaving an item
   * still connected at the bank and still billed, with no way left to
   * revoke it.
   */
  server.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const userId = (request as any).userId;
    const item = await prisma.plaidItem.findFirst({ where: { id: request.params.id, userId } });
    if (!item) return reply.status(404).send({ success: false, error: 'Bank not found' });

    if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
      try {
        const plaid = getPlaidClient();
        await plaid.itemRemove({ access_token: decrypt(item.accessTokenEnc) });
      } catch (err) {
        // An item Plaid has already forgotten (expired, user revoked it from
        // their bank's own side) must not strand the user's own disconnect
        // request — log it and still remove our copy.
        request.log.warn({ err, itemId: item.id }, 'itemRemove failed during single-bank disconnect');
      }
    }

    // FundingInstrument rows cascade via the itemId FK. Only clear
    // payIn4InstrumentId if THIS bank actually held it — an unrelated
    // instrument's id must not be wiped by disconnecting a different bank.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { payIn4InstrumentId: true } });
    const heldPayIn4 =
      !!user?.payIn4InstrumentId &&
      (await prisma.fundingInstrument.findFirst({
        where: { id: user.payIn4InstrumentId, itemId: item.id },
        select: { id: true },
      })) !== null;

    await prisma.$transaction([
      prisma.plaidItem.delete({ where: { id: item.id } }),
      ...(heldPayIn4
        ? [prisma.user.update({ where: { id: userId }, data: { payIn4InstrumentId: null } })]
        : []),
    ]);

    return { success: true, data: { disconnected: true, payIn4Cleared: heldPayIn4 } };
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

  // Persist EVERY synced transaction, not just the subscription-qualifying
  // subset below. The merchant grouping a few lines down filters through
  // isSubscriptionCandidate() first, which explicitly excludes INCOME (along
  // with transfers, loan payments and bank fees) — deposits and paychecks
  // were therefore never written here at all. deriveTrustSignals() in
  // routes/cards.ts computes its income/inflow figure by reading this exact
  // table, so a trust score — and the Spending Power figure downstream of
  // it — could never see a cent of real income, regardless of how healthy
  // the account actually was. createMany + skipDuplicates rather than the
  // per-row upsert below: transaction_id is Plaid's own stable id, so a
  // re-sync naturally no-ops on rows already stored instead of needing an
  // update path for data that does not change once settled.
  await prisma.transaction.createMany({
    data: allTransactions.map(tx => ({
      id: tx.transaction_id,
      userId,
      merchantNameRaw: tx.merchant_name || tx.name,
      amountCents: Math.round(tx.amount * 100),
      date: new Date(tx.date),
      source: 'plaid',
      rawData: tx as any,
    })),
    skipDuplicates: true,
  });

  // Get user's funding instruments for matching
  let instruments = await prisma.fundingInstrument.findMany({ where: { userId } });

  // Backfill plaidAccountId for any instrument that predates it, or that was
  // linked before this fix — not just at initial link time. This used to
  // live ONLY in the public-token-exchange handler, which a routine
  // POST /plaid/sync never runs, so an instrument created before this fix
  // (or a second account added to the same institution, which never
  // re-triggers exchange) could go on missing its real matching key forever.
  // Cheap to check every sync: this only calls Plaid when something is
  // actually still missing.
  if (instruments.some(i => !i.plaidAccountId)) {
    try {
      const acctRes = await plaid.accountsGet({ access_token: accessToken });
      for (const inst of instruments) {
        if (inst.plaidAccountId) continue;
        const match = acctRes.data.accounts.find(a => a.mask === inst.last4);
        if (match) {
          await prisma.fundingInstrument.update({
            where: { id: inst.id },
            data: { plaidAccountId: match.account_id },
          });
          inst.plaidAccountId = match.account_id;
        }
      }
    } catch (err) {
      // Best-effort — matching falls back to instruments[0] below exactly as
      // it did before this fix, for whichever instruments stay unmatched.
    }
  }

  // Group transactions by normalized merchant name.
  //
  // Deduped by (merchant, calendar day, amount): this account has been
  // relinked multiple times over development, and Plaid's sandbox re-issues
  // the SAME canned test charge under a brand-new transaction_id on every
  // relink — so the same logical "Brigit, Aug 1, $14.99" charge can arrive
  // here two or three times with different ids. Without this, those
  // same-day duplicates inject 0-day gaps into inferBillingInterval's input
  // (`all(25, 35)` requires EVERY gap to be in range, so one 0 anywhere
  // fails the whole merchant to 'unknown'), silently blocking a genuinely
  // regular subscription from ever being promoted no matter how clean the
  // real monthly pattern is. A real, never-relinked bank would never
  // produce this duplication in the first place, but there is no reason to
  // trust that it couldn't (a pending-then-posted pair, a retried charge),
  // so this is correct defensively, not just a workaround for this account.
  const byMerchant = new Map<string, { txs: Transaction[]; amounts: number[]; seenDayKeys: Set<string> }>();

  for (const tx of allTransactions) {
    // Category filter first: transfers, loan payments and income can never be
    // a subscription no matter how regular they look.
    if (!isSubscriptionCandidate(toCandidate(tx))) continue;

    const raw = tx.merchant_name || tx.name;
    const canonical = normalizeMerchantName(stripReferenceNumbers(raw));
    if (!canonical) continue;

    const amountCents = Math.round(tx.amount * 100);
    const dayKey = `${tx.date}|${amountCents}`;

    const existing = byMerchant.get(canonical);
    if (existing) {
      if (existing.seenDayKeys.has(dayKey)) continue;
      existing.seenDayKeys.add(dayKey);
      existing.txs.push(tx);
      existing.amounts.push(amountCents);
    } else {
      byMerchant.set(canonical, { txs: [tx], amounts: [amountCents], seenDayKeys: new Set([dayKey]) });
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

    // Raw transactions are already persisted for every synced transaction,
    // subscription-qualifying or not — see the createMany above.

    // Plaid supplies `website` per transaction for many, not all, merchants —
    // this is the domain apps/mobile/utils/cancellation.ts's auto-discovery
    // step probes for a real cancel page, so it's the thing that makes
    // cancellation work for the long tail of merchants nobody hand-curated
    // a URL for. Take the first transaction in this group that has one.
    const website = txs.find(t => (t as any).website)?.website as string | undefined;

    // Find or create merchant
    let merchant = await prisma.merchant.findUnique({ where: { canonicalName } });
    if (!merchant) {
      merchant = await prisma.merchant.create({
        data: {
          canonicalName,
          fingerprintKeys: { patterns: [canonicalName.toLowerCase()] },
          cancellationDifficulty: 3,
          website,
        },
      });
    } else if (website && !merchant.website) {
      // Re-syncing an existing merchant that predates this column, or that
      // was first created from a transaction without a website — backfill
      // rather than leave it stuck with no discoverable domain forever.
      merchant = await prisma.merchant.update({
        where: { id: merchant.id },
        data: { website },
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

      // Match by Plaid's own account id — the one stable key that actually
      // identifies which linked account this transaction came from.
      //
      // This used to take the last 4 CHARACTERS of `tx.account_id` and
      // compare that against `instrument.last4` — but `account_id` is an
      // opaque Plaid identifier (e.g. "vozxg8Pgn1TWv...Wq9GxXNVYVsGO"), not
      // a digit string, so its last 4 characters are essentially random and
      // almost never equal a real 4-digit mask. Every charge silently fell
      // through to `instruments[0]` instead — for a user with more than one
      // account at the same bank (exactly this user's two "Spend" accounts),
      // that meant charges were attributed to whichever instrument happened
      // to be first in an unordered query result, not the account that
      // actually paid. That's why a per-card breakdown (Wallet's "Total
      // drained", the per-card subs count, any date-range filter scoped to
      // one card) could silently omit real charges or show the wrong count.
      //
      // plaidAccountId is only populated going forward from the link/re-link
      // path above; an instrument from before that still falls back to the
      // first instrument, same as before, rather than silently dropping the
      // charge.
      const instrument =
        instruments.find(i => i.plaidAccountId && i.plaidAccountId === tx.account_id) ||
        instruments[0];

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

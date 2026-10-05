// =============================================================================
// EZER — Highnote (TEST environment) card issuing for Pay in 4.
//
// TEST ONLY: the URL is hard-wired to Highnote's test API and the cardholder
// identity below is sandbox placeholder data (Highnote's documented test SSN,
// address, DOB). Going live needs real KYC fields collected in the app and a
// bank partner — none of which exists yet.
// =============================================================================

import { prisma } from '@ezer/db';

const URL = 'https://api.us.test.highnote.com/graphql';
const PRODUCT_ID = 'pd_1fe2a6440d6d4a10b33a2af190e28448'; // "ezer bnpl" (revolving credit)
/** BIWEEKLY billing cycle set on every application below. */
const CYCLE_DAYS = 14;

export const highnoteEnabled = () => !!process.env.HIGHNOTE_API_KEY;

async function hn<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${process.env.HIGHNOTE_API_KEY}:`).toString('base64'),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  if (json.errors) throw new Error(`highnote: ${json.errors[0]?.message}`);
  return json.data;
}

const ERR = `... on UserError { errors { code description } } ... on AccessDeniedError { message }`;
function pick(data: any, field: string): any {
  const v = data[field];
  if (!v?.id) throw new Error(`highnote ${field}: ${JSON.stringify(v).slice(0, 300)}`);
  return v;
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Onboard the user as a Highnote cardholder and issue an active virtual card
 * with a credit limit equal to their Spending Power. Idempotent per user via a
 * `pending:` claim on User.highnoteCardId, so two joins can't issue two cards.
 */
export async function issueTestCard(userId: string, limitCents: number): Promise<void> {
  const claim = `pending:${userId}`;
  const won = await prisma.user.updateMany({ where: { id: userId, highnoteCardId: null }, data: { highnoteCardId: claim } });
  if (won.count === 0) return; // already issued or in flight

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    const [givenName, ...rest] = (user.name || 'Ezer Member').trim().split(/\s+/);

    const holder = pick(
      await hn(
        `mutation($input: CreateUSPersonAccountHolderInput!) { createUSPersonAccountHolder(input: $input) { __typename ... on USPersonAccountHolder { id } ${ERR} } }`,
        {
          input: {
            personAccountHolder: {
              name: { givenName, familyName: rest.join(' ') || 'Member' },
              email: `${userId}@test.ezer.app`,
              dateOfBirth: '1990-01-15',
              phoneNumber: { countryCode: '1', number: '5555555555', label: 'MOBILE' },
              billingAddress: { streetAddress: '123 Main Street', postalCode: '60654', locality: 'Chicago', region: 'IL', countryCodeAlpha3: 'USA' },
              identificationDocument: { socialSecurityNumber: { number: '111-11-1111', countryCodeAlpha3: 'USA' } },
              personCreditRiskAttributes: {
                totalAnnualIncome: [{ value: 100000000, currencyCode: 'USD' }],
                currentDebtObligations: [{ value: 1000, currencyCode: 'USD' }],
                employmentStatus: 'EMPLOYED',
              },
            },
          },
        }
      ),
      'createUSPersonAccountHolder'
    );

    const consent = { primaryAuthorizedPersonId: holder.id, consentTimestamp: new Date().toISOString() };
    const app = pick(
      await hn(
        `mutation($input: CreateAccountHolderCardProductApplicationInput!) { createAccountHolderCardProductApplication(input: $input) { __typename ... on AccountHolderCardProductApplication { id } ${ERR} } }`,
        {
          input: {
            cardProductId: PRODUCT_ID,
            accountHolderId: holder.id,
            cardHolderAgreementConsent: consent,
            accountHolderCreditReportPullConsent: consent,
            applicationConfiguration: { applicantBillingCycleOverride: { billingCycleType: 'BIWEEKLY' } },
          },
        }
      ),
      'createAccountHolderCardProductApplication'
    );

    // Underwriting is asynchronous in Test.
    let status = '';
    for (let i = 0; i < 15 && status !== 'APPROVED'; i++) {
      await sleep(2000);
      const r = await hn(`query($id: ID!) { node(id: $id) { ... on AccountHolderCardProductApplication { applicationState { status } } } }`, { id: app.id });
      status = r.node?.applicationState?.status ?? '';
      if (status && !['PENDING', 'IN_REVIEW', 'APPROVED'].includes(status)) break;
    }
    if (status !== 'APPROVED') throw new Error(`highnote application ${status || 'timed out'}`);

    const account = pick(
      await hn(
        `mutation($input: IssueFinancialAccountForApplicationInput!) { issueFinancialAccountForApplication(input: $input) { __typename ... on FinancialAccount { id } ${ERR} } }`,
        { input: { applicationId: app.id, name: 'EZER Pay in 4' } }
      ),
      'issueFinancialAccountForApplication'
    );

    await hn(
      `mutation($input: InitiateFinancialAccountCreditLimitUpdateFromProductFundingInput!) { initiateFinancialAccountCreditLimitUpdateFromProductFunding(input: $input) { __typename ${ERR} } }`,
      { input: { financialAccountId: account.id, amount: { value: limitCents, currencyCode: 'USD' }, memo: 'EZER Spending Power' } }
    );

    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 3);
    const card = pick(
      await hn(
        `mutation($input: IssuePaymentCardForFinancialAccountInput!) { issuePaymentCardForFinancialAccount(input: $input) { __typename ... on PaymentCard { id } ${ERR} } }`,
        { input: { financialAccountId: account.id, options: { activateOnCreate: true, expirationDate: exp.toISOString() } } }
      ),
      'issuePaymentCardForFinancialAccount'
    );

    await prisma.user.update({ where: { id: userId }, data: { highnoteCardId: card.id } });
  } catch (err) {
    // ponytail: a failure after the account holder exists leaves an orphan in
    // Highnote's TEST tenant; the retry onboards a fresh one. Store the
    // intermediate ids if this ever runs against live.
    await prisma.user.updateMany({ where: { id: userId, highnoteCardId: claim }, data: { highnoteCardId: null } });
    throw err;
  }
}

export interface TestCardView {
  status: 'none' | 'pending' | 'ready';
  card?: { last4: string; expiry: string; network: string; state: string };
  limitCents?: number;
  plans?: Array<{
    totalCents: number;
    perPaymentCents: number;
    paid: number;
    count: number;
    /** ISO dates, one per payment: first at purchase, then every billing cycle. */
    dueDates: string[];
  }>;
}

/** Card + live pay-in-4 schedules for the app. */
export async function readTestCard(userId: string): Promise<TestCardView> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { highnoteCardId: true } });
  const id = user?.highnoteCardId;
  if (!id) return { status: 'none' };
  if (id.startsWith('pending:')) return { status: 'pending' };

  const r = await hn(
    `query($id: ID!) { node(id: $id) { ... on PaymentCard { last4 expirationMonth expirationYear network status
      financialAccounts { features { __typename ... on CreditCardAccountFeature { creditLimit { value } } }
        installmentAgreements(first: 10) { edges { node { status installmentAgreementPeriodStart
          agreement { creditPlan { installmentPolicy { numberOfPeriods } } details { totalPrincipal { value } principalDuePerPeriod { value } } }
          snapshot { installmentPaymentsCompleted { numberOfInstallmentsCompleted } } } } } } } } }`,
    { id }
  );
  const c = r.node;
  if (!c) return { status: 'none' };
  const acct = Array.isArray(c.financialAccounts) ? c.financialAccounts[0] : c.financialAccounts;
  const features = acct?.features ?? [];
  const limit = features.find((f: any) => f.__typename === 'CreditCardAccountFeature')?.creditLimit?.value;

  return {
    status: 'ready',
    card: { last4: c.last4, expiry: `${c.expirationMonth}/${String(c.expirationYear).slice(-2)}`, network: c.network, state: c.status },
    limitCents: limit,
    plans: (acct?.installmentAgreements?.edges ?? [])
      .map((e: any) => e.node)
      .filter((a: any) => a.status === 'OPEN')
      .map((a: any) => {
        const count = a.agreement.creditPlan.installmentPolicy?.numberOfPeriods ?? 4;
        const start = new Date(a.installmentAgreementPeriodStart).getTime();
        return {
          totalCents: a.agreement.details.totalPrincipal.value,
          perPaymentCents: a.agreement.details.principalDuePerPeriod.value,
          paid: a.snapshot?.installmentPaymentsCompleted?.numberOfInstallmentsCompleted ?? 0,
          count,
          // ponytail: derived from the BIWEEKLY cycle — Highnote exposes no
          // per-installment due date; read billingSummary if cycles ever vary.
          dueDates: Array.from({ length: count }, (_, i) => new Date(start + i * CYCLE_DAYS * 86_400_000).toISOString()),
        };
      }),
  };
}

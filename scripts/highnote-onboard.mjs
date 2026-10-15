#!/usr/bin/env node
// =============================================================================
// Highnote TEST: onboard one individual (KYC) and issue them a virtual card.
//
// Usage (bash; PowerShell: set $env:HIGHNOTE_API_KEY etc. first):
//
//   HIGHNOTE_API_KEY=sk_test_... CARD_PRODUCT_ID=pd_... \
//     node scripts/highnote-onboard.mjs --person person.json --agreement-version 2026-10-01 [options]
//
//   cat person.json | node scripts/highnote-onboard.mjs --agreement-version 2026-10-01 --json
//
//   # Highnote's sandbox identity (no input file). Test outcomes:
//   node scripts/highnote-onboard.mjs --sandbox --agreement-version test-1                           # APPROVED
//   HN_GIVEN_NAME=FORCE-DECLINE node scripts/highnote-onboard.mjs --sandbox --agreement-version test-1 # DENIED
//   HN_STREET="123 Manual Review St." node scripts/highnote-onboard.mjs --sandbox --agreement-version test-1 # IN_REVIEW
//
// Options:
//   --person <file|->          identity JSON (see PERSON_EXAMPLE below); "-" or no flag = stdin
//   --sandbox                  use the Highnote sandbox identity (+ HN_GIVEN_NAME / HN_STREET overrides)
//   --agreement-version <v>    REQUIRED: version of the cardholder agreement the person accepted
//   --consent-timestamp <iso>  when they accepted it (default: now). Pass the time your app recorded.
//   --consent-ip <ip>          IP address the acceptance came from (optional, v4 or v6)
//   --start-doc-upload         if IN_REVIEW with documents required, start the upload session(s)
//                              and mint a Document Upload SDK client token for each
//   --json                     print ONE result object on stdout (everything else goes to stderr)
//   --print-requests           print each GraphQL body (PII redacted) to stderr
//
// Exit codes: 0 card issued, 2 denied (or closed), 3 in review, 1 any other error.
//
// Flow (Highnote does not issue a card straight onto an account holder; the
// card hangs off a financial account opened by an approved application):
//   1. createUSPersonAccountHolder           -> accountHolder id (ps_...)
//   2. createAccountHolderCardProductApplication (consent)  -> application id
//   3. poll the application until KYC decides: APPROVED / DENIED / IN_REVIEW
//      DENIED / IN_REVIEW -> fetch the reasons (adverse action + verification
//      results + required documents) from the application's snapshot
//   4. issueFinancialAccountForApplication   -> financial account id (ac_...)
//   5. issuePaymentCardForFinancialAccount   -> virtual card id (cd_...)
//
// TEST ONLY. The endpoint is hardcoded to the test API and any key that is not
// sk_test_ is refused: there is no live access yet, and real customer data must
// never go through a test tenant. CARD_PRODUCT_ID must be a DEBIT / prepaid
// product (user-funded); EZER's "ezer bnpl" product is revolving CREDIT.
//
// PII: nothing this script prints (requests, errors, summary, --json) carries a
// full SSN/ITIN, date of birth, street, phone, email local part or name. Every
// print path goes through redact()/redactText(). Keep it that way.
//
// Node 18+ (global fetch, util.parseArgs). No dependencies. Every step is an
// exported function; importing this module does not run anything.
// =============================================================================

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const ENDPOINT = 'https://api.us.test.highnote.com/graphql'; // TEST only

export const EXIT = { ISSUED: 0, ERROR: 1, DENIED: 2, IN_REVIEW: 3 };

export class HighnoteError extends Error {
  constructor(step, kind, detail) {
    const safe = detail ? redactText(String(detail)) : '';
    super(`${step}: ${kind}${safe ? ` - ${safe}` : ''}`);
    Object.assign(this, { step, kind, detail: safe });
  }
}

export class ValidationError extends Error {
  constructor(problems) {
    super(`invalid input:\n  - ${problems.join('\n  - ')}`);
    this.problems = problems;
  }
}

// =============================================================================
// Redaction. Used by every print path: request bodies, errors, the summary.
// =============================================================================

const last = (s, n) => String(s).replace(/\D/g, '').slice(-n);

/** Mask one value by what kind of PII it is. */
export const mask = {
  taxId: v => `***-**-${last(v, 4)}`,
  dob: v => `${String(v).slice(0, 4)}-**-**`, // year only
  street: () => '[street redacted]',
  phone: v => `***-***-${last(v, 4)}`,
  email: v => {
    const [local, domain] = String(v).split('@');
    return domain ? `${local.slice(0, 1)}***@${domain}` : '[email redacted]';
  },
  name: v => (v ? `${String(v).slice(0, 1)}***` : v),
  zip: v => `${String(v).slice(0, 3)}**`,
  ip: v => String(v).replace(/[\da-f]+$/i, 'x'),
};

// Keys whose values are PII, wherever they appear in an object.
const KEY_MASKS = {
  socialSecurityNumber: o => (o && typeof o === 'object' ? { ...o, number: mask.taxId(o.number) } : mask.taxId(o)),
  ssn: mask.taxId,
  itin: mask.taxId,
  dateOfBirth: mask.dob,
  streetAddress: mask.street,
  extendedAddress: mask.street,
  street: mask.street,
  postalCode: mask.zip,
  zip: mask.zip,
  phone: mask.phone,
  phoneNumber: o => (o && typeof o === 'object' ? { ...o, number: mask.phone(o.number) } : mask.phone(o)),
  email: mask.email,
  givenName: mask.name,
  middleName: mask.name,
  familyName: mask.name,
  v4: mask.ip,
  v6: mask.ip,
};

/** Deep-copy `value` with every PII field masked. Safe to print. */
export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return typeof value === 'string' ? scrubKnown(value) : value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = KEY_MASKS[k] && v != null ? redact(KEY_MASKS[k](v)) : redact(v);
  }
  return out;
}

// Known PII values from the current run, so free text (Highnote error
// descriptions sometimes echo input back) can be scrubbed by value too.
const knownPII = new Map();
export function rememberPII(person) {
  const add = (raw, masked) => raw && knownPII.set(String(raw), masked);
  const tax = person.identificationDocument?.socialSecurityNumber?.number;
  add(tax, mask.taxId(tax));
  add(tax?.replace(/\D/g, ''), mask.taxId(tax));
  add(person.dateOfBirth, mask.dob(person.dateOfBirth));
  add(person.billingAddress?.streetAddress, mask.street());
  add(person.billingAddress?.extendedAddress, mask.street());
  add(person.phoneNumber?.number, mask.phone(person.phoneNumber?.number));
  add(person.email, mask.email(person.email));
  add(person.name?.givenName?.length > 2 && person.name.givenName, mask.name(person.name.givenName));
  add(person.name?.familyName?.length > 2 && person.name.familyName, mask.name(person.name.familyName));
}

/** Replace this run's known PII values (exact match) and any API key. Safe on structured output. */
export function scrubKnown(s) {
  let t = String(s);
  for (const [raw, masked] of [...knownPII].sort((a, b) => b[0].length - a[0].length)) t = t.split(raw).join(masked);
  return t.replace(/\bsk_(test|live)_[A-Za-z0-9]+/g, 'sk_$1_[redacted]');
}

/**
 * scrubKnown plus pattern heuristics (SSN-, email- and date-shaped text), for
 * free text we did not build ourselves: error messages and stack traces.
 * Too blunt for result objects (it would mask "2026-10-01" agreement versions).
 */
export function redactText(s) {
  return scrubKnown(s)
    .replace(/\b\d{3}-?\d{2}-?(\d{4})\b/g, '***-**-$1')
    .replace(/\b([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b/g, '$1***@$2')
    .replace(/\b(19|20)(\d{2})-\d{2}-\d{2}\b/g, '$1$2-**-**');
}

// =============================================================================
// Input validation. Runs before any API call; collects every problem at once.
// =============================================================================

/** Same rule as packages/shared ageFromDateOfBirth: whole years, UTC calendar. */
export function ageFromDateOfBirth(dob, now = new Date()) {
  const d = new Date(dob + 'T00:00:00Z');
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const US_STATES = new Set(
  ('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK ' +
    'OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI AS MP AA AE AP').split(' '),
);

export const PERSON_EXAMPLE = {
  givenName: 'Jane',
  middleName: 'Q', // optional
  familyName: 'Doe',
  dateOfBirth: '1990-01-15', // YYYY-MM-DD, must be 18+
  email: 'jane@example.com',
  phone: '4065550123', // US, 10 digits; +1 and punctuation are stripped
  address: { street: '123 Main Street', extended: 'Apt 4', city: 'Helena', state: 'MT', zip: '59601' },
  ssn: '123-45-6789', // or "itin": "9XX-7X-XXXX" (exactly one of the two)
  externalId: 'ezer-user-id', // optional: your User.id, for reconciliation
};

/**
 * Validate the app-shaped person (PERSON_EXAMPLE) and convert it to Highnote's
 * USPersonAccountHolderInput. Throws ValidationError listing every problem.
 */
export function validatePerson(p, { now = new Date() } = {}) {
  const errs = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new ValidationError(['input must be a JSON object']);
  const str = k => (typeof p[k] === 'string' ? p[k].trim() : '');
  const NAME = /^[\p{L}][\p{L}' .-]{0,59}$/u;

  const givenName = str('givenName');
  const familyName = str('familyName');
  const middleName = str('middleName');
  if (!NAME.test(givenName)) errs.push('givenName: required, letters/space/apostrophe/hyphen/period, max 60');
  if (!NAME.test(familyName)) errs.push('familyName: required, letters/space/apostrophe/hyphen/period, max 60');
  if (middleName && !NAME.test(middleName)) errs.push('middleName: letters/space/apostrophe/hyphen/period, max 60');

  const dob = str('dateOfBirth');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) errs.push('dateOfBirth: required, YYYY-MM-DD');
  else {
    const d = new Date(dob + 'T00:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dob) errs.push('dateOfBirth: not a real date');
    else if (ageFromDateOfBirth(dob, now) < 18) errs.push('dateOfBirth: must be 18 or older');
    else if (ageFromDateOfBirth(dob, now) > 120) errs.push('dateOfBirth: not a real date');
  }

  const email = str('email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) errs.push('email: required, a valid address');

  let phone = String(p.phone ?? '').replace(/[\s().-]/g, '').replace(/^\+?1(?=\d{10}$)/, '');
  if (!/^\d{10}$/.test(phone)) errs.push('phone: required, a 10-digit US number');

  const a = p.address && typeof p.address === 'object' ? p.address : {};
  const street = typeof a.street === 'string' ? a.street.trim() : '';
  const extended = typeof a.extended === 'string' ? a.extended.trim() : '';
  const city = typeof a.city === 'string' ? a.city.trim() : '';
  const state = typeof a.state === 'string' ? a.state.trim().toUpperCase() : '';
  const zip = typeof a.zip === 'string' ? a.zip.trim() : String(a.zip ?? '');
  if (!p.address || typeof p.address !== 'object') errs.push('address: required object {street, city, state, zip}');
  else {
    if (!street || street.length > 100) errs.push('address.street: required, max 100 chars');
    if (/\bP\.?\s*O\.?\s*BOX\b/i.test(street)) errs.push('address.street: a PO box is not a residential address');
    if (!city || city.length > 60) errs.push('address.city: required, max 60 chars');
    if (!/^[A-Z]{2}$/.test(state) || !US_STATES.has(state)) errs.push('address.state: required, 2-letter US state code');
    if (!/^\d{5}$/.test(zip)) errs.push('address.zip: required, 5 digits');
    if (a.country && !/^(US|USA)$/i.test(a.country)) errs.push('address.country: US addresses only');
  }

  // SSN and ITIN are both 9 digits; ITINs start with 9 (and SSNs never do).
  const hasSsn = p.ssn != null && p.ssn !== '';
  const hasItin = p.itin != null && p.itin !== '';
  const digits = String((hasSsn ? p.ssn : p.itin) ?? '').replace(/[\s-]/g, '');
  let taxType = null;
  if (hasSsn === hasItin) errs.push('ssn / itin: provide exactly one');
  else if (!/^\d{9}$/.test(digits)) errs.push(`${hasSsn ? 'ssn' : 'itin'}: must be 9 digits`);
  else if (hasSsn) {
    if (/^(000|666|9)/.test(digits) || digits.slice(3, 5) === '00' || digits.slice(5) === '0000') errs.push('ssn: not a valid SSN');
    taxType = 'SOCIAL_SECURITY_NUMBER';
  } else {
    const g = Number(digits.slice(3, 5));
    if (digits[0] !== '9' || !((g >= 50 && g <= 65) || (g >= 70 && g <= 88) || (g >= 90 && g <= 92) || g >= 94)) errs.push('itin: not a valid ITIN');
    taxType = 'INDIVIDUAL_TAXPAYER_IDENTIFICATION_NUMBER';
  }

  if (p.externalId != null && (typeof p.externalId !== 'string' || p.externalId.length > 100)) errs.push('externalId: string, max 100 chars');

  if (errs.length) throw new ValidationError(errs);

  return {
    name: { givenName, ...(middleName && { middleName }), familyName },
    email,
    dateOfBirth: dob,
    phoneNumber: { countryCode: '1', number: phone, label: 'MOBILE' },
    billingAddress: {
      streetAddress: street,
      ...(extended && { extendedAddress: extended }),
      locality: city,
      region: state,
      postalCode: zip,
      countryCodeAlpha3: 'USA',
    },
    identificationDocument: {
      socialSecurityNumber: {
        number: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`,
        countryCodeAlpha3: 'USA',
        taxIdentificationNumberType: taxType,
      },
    },
    ...(p.externalId && { externalId: p.externalId }),
  };
}

/** Highnote's documented sandbox identity, in the app shape. Never real data. */
export function sandboxPerson(env = process.env) {
  return {
    // HN_GIVEN_NAME=FORCE-DECLINE forces DENIED; HN_STREET="123 Manual Review St." forces IN_REVIEW.
    givenName: env.HN_GIVEN_NAME || 'Test',
    familyName: 'Member',
    email: `test+${Date.now()}@example.com`,
    dateOfBirth: '1990-01-15',
    phone: '5555555555',
    address: { street: env.HN_STREET || '123 Main Street', city: 'Helena', state: 'MT', zip: '59601' },
    ssn: '111-11-1111',
  };
}

/**
 * Cardholder-agreement consent. The APP must show the cardholder agreement
 * (and the privacy notice) BEFORE this runs, record the moment the person
 * accepted and which version they saw, and store that acceptance itself
 * (like User.consentedAt / consentVersion). This script only forwards that
 * record to Highnote; it does not and cannot obtain consent. If no timestamp
 * is supplied it uses "now", which is only honest when acceptance happens
 * in the same request.
 */
export function buildConsent({ agreementVersion, consentTimestamp, consentIp, now = new Date() }) {
  const errs = [];
  if (!agreementVersion || !String(agreementVersion).trim()) errs.push('--agreement-version: required (the cardholder agreement version the person accepted)');
  const ts = consentTimestamp ? new Date(consentTimestamp) : now;
  if (Number.isNaN(ts.getTime())) errs.push('--consent-timestamp: not a valid ISO 8601 time');
  else if (ts.getTime() > now.getTime() + 5 * 60_000) errs.push('--consent-timestamp: is in the future');
  let ip;
  if (consentIp) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(consentIp) && consentIp.split('.').every(o => Number(o) <= 255)) ip = { v4: consentIp };
    else if (/^[0-9a-f:]+$/i.test(consentIp) && consentIp.includes(':')) ip = { v6: consentIp };
    else errs.push('--consent-ip: not an IPv4/IPv6 address');
  }
  if (errs.length) throw new ValidationError(errs);
  return { agreementVersion: String(agreementVersion).trim(), consentTimestamp: ts.toISOString(), ...(ip && { consentIpAddress: ip }) };
}

// =============================================================================
// Highnote client
// =============================================================================

/**
 * TEST-only GraphQL client. Refuses anything that is not an sk_test_ key.
 * `onRequest(step, body)` (optional) receives every operation, already redacted.
 */
export function highnoteClient({ apiKey, onRequest } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.startsWith('sk_test_')) {
    throw new HighnoteError('config', 'AUTH', 'HIGHNOTE_API_KEY must be a TEST key (sk_test_...). Live keys are refused.');
  }
  // Highnote auth: HTTP Basic with the API key as the username, empty password.
  const auth = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64');
  return {
    /** POST one GraphQL operation; throws on transport or GraphQL-level errors. */
    async gql(step, query, variables) {
      onRequest?.(step, { query, variables: redact(variables) });
      let res;
      try {
        res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ query, variables }),
        });
      } catch (e) {
        throw new HighnoteError(step, 'NETWORK', e.message);
      }
      if (res.status === 401 || res.status === 403) throw new HighnoteError(step, 'AUTH', `HTTP ${res.status}: check the API key`);
      const json = await res.json().catch(() => null);
      if (!json) throw new HighnoteError(step, 'BAD_RESPONSE', `HTTP ${res.status}`);
      if (json.errors?.length) throw new HighnoteError(step, 'GRAPHQL', json.errors.map(e => e.message).join('; '));
      return json.data;
    },
  };
}

// Highnote mutations return a union: the object, or UserError / AccessDeniedError.
const ERRORS = `... on UserError { errors { code description path } } ... on AccessDeniedError { message }`;

function unwrap(step, payload) {
  if (!payload) throw new HighnoteError(step, 'EMPTY');
  if (payload.__typename === 'UserError') {
    const msgs = payload.errors.map(e => `${e.code}: ${e.description}${e.path ? ` (${e.path.join('.')})` : ''}`).join('; ');
    throw new HighnoteError(step, 'VALIDATION', msgs);
  }
  if (payload.__typename === 'AccessDeniedError') throw new HighnoteError(step, 'ACCESS_DENIED', payload.message);
  if (!payload.id) throw new HighnoteError(step, 'NO_ID', JSON.stringify(redact(payload)));
  return payload;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- 1. account holder --------------------------------------------------------
export async function createAccountHolder(hn, personInput) {
  const q = `mutation CreateAccountHolder($input: CreateUSPersonAccountHolderInput!) {
  createUSPersonAccountHolder(input: $input) {
    __typename
    ... on USPersonAccountHolder { id }
    ${ERRORS}
  }
}`;
  const data = await hn.gql('createUSPersonAccountHolder', q, { input: { personAccountHolder: personInput } });
  return unwrap('createUSPersonAccountHolder', data.createUSPersonAccountHolder);
}

// --- 2. application (this is where KYC runs) ---------------------------------
export async function applyForProduct(hn, { productId, accountHolderId, consent }) {
  const q = `mutation Apply($input: CreateAccountHolderCardProductApplicationInput!) {
  createAccountHolderCardProductApplication(input: $input) {
    __typename
    ... on AccountHolderCardProductApplication { id applicationState { status } }
    ${ERRORS}
  }
}`;
  const cardHolderAgreementConsent = {
    primaryAuthorizedPersonId: accountHolderId,
    consentTimestamp: consent.consentTimestamp,
    ...(consent.consentIpAddress && { consentIpAddress: consent.consentIpAddress }),
  };
  const data = await hn.gql('createAccountHolderCardProductApplication', q, {
    input: {
      cardProductId: productId,
      accountHolderId,
      cardHolderAgreementConsent,
      ...(consent.consentIpAddress && { ipAddress: consent.consentIpAddress }),
    },
  });
  return unwrap('createAccountHolderCardProductApplication', data.createAccountHolderCardProductApplication);
}

// --- 3. wait for the KYC decision ---------------------------------------------
/** Poll until the application leaves PENDING. Returns the status; never throws on DENIED/IN_REVIEW. */
export async function awaitDecision(hn, applicationId, { tries = 20, everyMs = 2000 } = {}) {
  const q = `query ApplicationStatus($id: ID!) {
  node(id: $id) { ... on AccountHolderCardProductApplication { applicationState { status } } }
}`;
  for (let i = 0; i < tries; i++) {
    const data = await hn.gql(i === 0 ? 'application status' : `application status (poll ${i + 1})`, q, { id: applicationId });
    const status = data.node?.applicationState?.status;
    if (status && status !== 'PENDING') return status;
    await sleep(everyMs);
  }
  throw new HighnoteError('KYC', 'TIMEOUT', `no decision after ${(tries * everyMs) / 1000}s`);
}

// --- 3b. why: denial / review reasons -----------------------------------------
// Where Highnote keeps them (introspected from the TEST schema):
//   application.adverseActionReasons                         [{code: AdverseActionCode, description}]
//   application.applicationDenialReason                      ApplicationDenialReason (inactivity / other)
//   application.accountHolderSnapshot (USPersonAccountHolderSnapshot)
//     .currentVerification.status / .reason                  AccountHolderVerificationStatusReasonCode
//     .currentVerification.results                           [{code: AccountHolderVerificationResultCode, description}]
//     .currentVerification.adverseActionReasons              [{code, description}]
//     .currentVerification.requiredDocuments[].documentUploadSession   (doc review)
//     .currentVerification.requestedUpdates[].changesRequested         (fix-the-input review)
// The snapshot also holds name/DOB/SSN; this query deliberately does not select them.
const SESSION_FIELDS = `
  ... on USAccountHolderApplicationDocumentUploadSession {
    id status primaryDocumentTypes secondaryDocumentTypes supportingDocumentTypes recommendedDocumentTypes
    uploadRequirements { constraints { ... on DocumentUploadRequirementConstraint { documentType numberOfDocuments } } }
    documentContext { ... on AccountHolderApplicationDocumentUploadSessionContext {
      verificationResultCodeDocumentContext { entries { verificationResultCode documents } } } }
  }`;

export async function fetchDecisionDetails(hn, applicationId) {
  const q = `query ApplicationDecision($id: ID!) {
  node(id: $id) {
    ... on AccountHolderCardProductApplication {
      applicationState { status }
      applicationDenialReason
      decisionedAt
      adverseActionReasons { code description }
      accountHolderSnapshot {
        ... on USPersonAccountHolderSnapshot {
          currentVerification {
            status
            reason
            results { code description }
            adverseActionReasons { code description }
            requiredDocuments { referenceIdentifier status createdAt documentUploadSession { ${SESSION_FIELDS} } }
            requestedUpdates { id status changesRequested }
          }
        }
      }
    }
  }
}`;
  const data = await hn.gql('application decision details', q, { id: applicationId });
  if (!data.node) throw new HighnoteError('application decision details', 'NOT_FOUND', applicationId);
  return data.node;
}

const humanize = code => String(code).toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

// Highnote's TEST tenant returns description === code for verification
// results; these are the schema's own enum descriptions, reworded for people.
const RESULT_TEXT = {
  NAME_MISMATCH: 'The name provided does not match records for this identity.',
  DOB_MISMATCH: 'The date of birth provided does not match records for this identity.',
  SSN_MISMATCH: 'The Social Security number provided could not be verified.',
  ADDRESS_MISMATCH: 'The address provided could not be verified.',
  PHONE_MISMATCH: 'The phone number provided does not match records for this identity.',
  SSN_MISKEY: 'The Social Security number may have been mistyped.',
  DOB_MISKEY: 'The date of birth may have been mistyped.',
  DENIED_KYC: 'Identity could not be verified with the information provided.',
  KYC_WARNING: 'Identity could not be fully verified.',
};
const describe = (code, description) =>
  description && description !== code ? description : RESULT_TEXT[code] ?? humanize(code);

// Result codes that are fine to show the applicant. Fraud/watchlist/risk-score
// codes (SSN_WARNING, FRAUD_RISK, WATCHLIST_HIT, HIGH_THEFT_SCORE, ...) are
// internal: they belong in your ops/audit log, never in a consumer notice.
const CONSUMER_SAFE_RESULTS = new Set(['NAME_MISMATCH', 'DOB_MISMATCH', 'SSN_MISMATCH', 'ADDRESS_MISMATCH', 'PHONE_MISMATCH', 'SSN_MISKEY', 'DOB_MISKEY', 'DENIED_KYC', 'KYC_WARNING']);
const POSITIVE_RESULT = /(_MATCH|_PASS|^LOW_.*_SCORE)$/;

/**
 * Turn Highnote's decision into an adverse-action-ready object:
 *   adverseAction.reasonCodes / .reasons  -> what the notice to the applicant states
 *     (from Highnote's adverseActionReasons; falls back to UNABLE_TO_VERIFY_IDENTITY
 *     for a KYC denial with none, since that is the reason a KYC denial means)
 *   verification                          -> internal diagnostics (all result codes)
 *   documents / requestedUpdates          -> what an IN_REVIEW applicant must do next
 * Whether a written adverse action notice is legally required (ECOA/Reg B for
 * credit, FCRA if a consumer report was used) is a compliance call for the
 * product; this object just makes sure the reasons exist when it is.
 */
export function summarizeDecision(details) {
  const v = details.accountHolderSnapshot?.currentVerification ?? {};
  const status = details.applicationState?.status;
  const aar = new Map();
  for (const r of [...(details.adverseActionReasons ?? []), ...(v.adverseActionReasons ?? [])]) {
    if (r?.code && !aar.has(r.code)) aar.set(r.code, describe(r.code, r.description));
  }
  if ((status === 'DENIED' || status === 'CLOSED') && aar.size === 0 && v.status === 'DENIED') {
    aar.set('UNABLE_TO_VERIFY_IDENTITY', "Unable to verify the Account Holder's identity.");
  }
  const results = (v.results ?? []).map(r => ({ code: r.code, description: describe(r.code, r.description) }));
  const sessions = (v.requiredDocuments ?? []).map(d => {
    const s = d.documentUploadSession ?? {};
    return {
      referenceIdentifier: d.referenceIdentifier,
      requirementStatus: d.status,
      sessionId: s.id ?? null,
      sessionStatus: s.status ?? null,
      primaryDocumentTypes: s.primaryDocumentTypes ?? [],
      secondaryDocumentTypes: s.secondaryDocumentTypes ?? [],
      supportingDocumentTypes: s.supportingDocumentTypes ?? [],
      recommendedDocumentTypes: s.recommendedDocumentTypes ?? [],
      requirements: (s.uploadRequirements ?? []).flatMap(u => u.constraints ?? []).filter(c => c?.documentType),
      byResultCode: s.documentContext?.verificationResultCodeDocumentContext?.entries ?? [],
    };
  });
  return {
    applicationStatus: status,
    decisionedAt: details.decisionedAt ?? null,
    applicationDenialReason: details.applicationDenialReason ?? null,
    adverseAction: {
      reasonCodes: [...aar.keys()],
      reasons: [...aar.values()],
    },
    verification: {
      status: v.status ?? null,
      reason: v.reason ?? null,
      issues: results.filter(r => !POSITIVE_RESULT.test(r.code)),
      consumerSafeIssues: results.filter(r => CONSUMER_SAFE_RESULTS.has(r.code)),
      allResults: results,
    },
    documents: { required: sessions.length > 0, sessions },
    requestedUpdates: (v.requestedUpdates ?? []).filter(u => u.status === 'OPEN' || u.status === 'INITIATED'),
  };
}

// --- 3c. document upload (IN_REVIEW) ------------------------------------------
// Highnote CREATES the upload session itself when review needs documents (it
// appears under currentVerification.requiredDocuments). Our side:
//   startDocumentUploadSession      CREATED -> INITIATED (files can be attached)
//   generateDocumentUploadClientToken  short-lived token for Highnote's
//                                   Document Upload SDK in the app, which
//                                   uploads the files and ends the session.
// The token is a credential: hand it to the signed-in cardholder's app only.
export async function startDocumentUpload(hn, documentUploadSessionId) {
  const qStart = `mutation StartDocUpload($input: StartDocumentUploadSessionInput!) {
  startDocumentUploadSession(input: $input) {
    __typename
    ... on USAccountHolderApplicationDocumentUploadSession { id status }
    ... on IdentityVerificationDocumentUploadSession { id status }
    ${ERRORS}
  }
}`;
  const started = unwrap('startDocumentUploadSession',
    (await hn.gql('startDocumentUploadSession', qStart, { input: { documentUploadSessionId } })).startDocumentUploadSession);
  const qToken = `mutation DocUploadToken($input: GenerateDocumentUploadClientTokenInput!) {
  generateDocumentUploadClientToken(input: $input) {
    __typename
    ... on ClientToken { value expirationDate }
    ${ERRORS}
  }
}`;
  const tok = (await hn.gql('generateDocumentUploadClientToken', qToken, {
    input: { documentUploadSessionId, permissions: ['MANAGE_DOCUMENT_UPLOAD_SESSION'] },
  })).generateDocumentUploadClientToken;
  if (tok?.__typename !== 'ClientToken') unwrap('generateDocumentUploadClientToken', { ...tok, id: undefined });
  return { sessionId: started.id, status: started.status, clientToken: tok.value, clientTokenExpiresAt: tok.expirationDate };
}

// --- 4. financial account -----------------------------------------------------
export async function openAccount(hn, applicationId) {
  const q = `mutation OpenAccount($input: IssueFinancialAccountForApplicationInput!) {
  issueFinancialAccountForApplication(input: $input) {
    __typename
    ... on FinancialAccount { id }
    ${ERRORS}
  }
}`;
  const data = await hn.gql('issueFinancialAccountForApplication', q, { input: { applicationId, name: 'Debit account' } });
  return unwrap('issueFinancialAccountForApplication', data.issueFinancialAccountForApplication);
}

// --- 5. virtual card ----------------------------------------------------------
export async function issueVirtualCard(hn, financialAccountId) {
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 3);
  const q = `mutation IssueCard($input: IssuePaymentCardForFinancialAccountInput!) {
  issuePaymentCardForFinancialAccount(input: $input) {
    __typename
    ... on PaymentCard { id last4 expirationDate status formFactor }
    ${ERRORS}
  }
}`;
  const data = await hn.gql('issuePaymentCardForFinancialAccount', q, {
    input: { financialAccountId, options: { activateOnCreate: true, expirationDate: exp.toISOString() } },
  });
  return unwrap('issuePaymentCardForFinancialAccount', data.issuePaymentCardForFinancialAccount);
}

// =============================================================================
// Orchestration
// =============================================================================

/**
 * Run the whole flow. Never throws for a KYC outcome: returns a result object
 * whose `status` is ISSUED / DENIED / IN_REVIEW. Throws HighnoteError for
 * transport/validation failures (with whatever ids were created attached as
 * err.partial, so the caller can still record them).
 */
export async function onboard(hn, { personInput, productId, consent, startDocUpload = false, log = () => {} }) {
  const r = {
    status: null,
    accountHolderId: null,
    applicationId: null,
    applicationStatus: null,
    agreement: { version: consent.agreementVersion, consentTimestamp: consent.consentTimestamp },
    reasons: null,
    financialAccountId: null,
    card: null,
    nextStep: null,
  };
  try {
    r.accountHolderId = (await createAccountHolder(hn, personInput)).id;
    log(`account holder: ${r.accountHolderId}`);
    const app = await applyForProduct(hn, { productId, accountHolderId: r.accountHolderId, consent });
    r.applicationId = app.id;
    log(`application: ${app.id} (${app.applicationState?.status})`);
    r.applicationStatus = await awaitDecision(hn, app.id);
    log(`KYC: ${r.applicationStatus}`);

    if (r.applicationStatus !== 'APPROVED') {
      r.status = r.applicationStatus === 'IN_REVIEW' ? 'IN_REVIEW' : 'DENIED';
      let decision = summarizeDecision(await fetchDecisionDetails(hn, app.id));
      // Document requirements can land a moment after the status flips.
      for (let i = 0; r.status === 'IN_REVIEW' && !decision.documents.required && i < 3; i++) {
        await sleep(2000);
        decision = summarizeDecision(await fetchDecisionDetails(hn, app.id));
      }
      r.reasons = decision;
      if (r.status === 'DENIED') {
        r.nextStep = 'Send the adverse action reasons to the applicant. Do not retry with the same identity.';
      } else if (decision.documents.required) {
        const open = decision.documents.sessions.filter(s => s.sessionId && ['CREATED', 'INITIATED', 'IN_PROGRESS'].includes(s.sessionStatus));
        if (startDocUpload && open.length) {
          r.documentUpload = [];
          for (const s of open) r.documentUpload.push(await startDocumentUpload(hn, s.sessionId));
          r.nextStep = 'Open Highnote\'s Document Upload SDK in the app with documentUpload[].clientToken; Highnote reviews and the application moves to APPROVED or DENIED (webhook).';
        } else {
          r.nextStep = `Documents required. Call startDocumentUpload(hn, sessionId) for ${open.map(s => s.sessionId).join(', ') || 'the session'} (or run with --start-doc-upload) to start it and mint a Document Upload SDK client token for the app.`;
        }
      } else if (decision.requestedUpdates.length) {
        r.nextStep = `Highnote asked for corrected identity data: ${decision.requestedUpdates.flatMap(u => u.changesRequested).join(', ')}.`;
      } else {
        r.nextStep = 'Highnote manual review, no documents requested yet. Wait for the application status webhook; issue no card until APPROVED.';
      }
      return r;
    }

    r.financialAccountId = (await openAccount(hn, app.id)).id;
    log(`financial account: ${r.financialAccountId}`);
    const card = await issueVirtualCard(hn, r.financialAccountId);
    r.card = { id: card.id, last4: card.last4, expiry: card.expirationDate?.slice(0, 7) ?? null, status: card.status };
    r.status = 'ISSUED';
    return r;
  } catch (e) {
    if (e instanceof HighnoteError) e.partial = r;
    throw e;
  }
}

// =============================================================================
// CLI
// =============================================================================

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function loadPerson(values) {
  if (values.sandbox) {
    if (values.person) throw new ValidationError(['use either --sandbox or --person, not both']);
    return sandboxPerson();
  }
  let text;
  if (values.person && values.person !== '-') {
    try {
      text = readFileSync(values.person, 'utf8');
    } catch (e) {
      throw new ValidationError([`--person: cannot read file (${e.code || e.message})`]);
    }
  } else {
    if (process.stdin.isTTY) throw new ValidationError(['no identity: pass --person <file>, pipe JSON on stdin, or use --sandbox']);
    text = await readStdin();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError(['identity input is not valid JSON']); // no parser message: it can quote the input
  }
}

function humanSummary(r) {
  const lines = [`\nresult: ${r.status}`];
  if (r.accountHolderId) lines.push(`  account holder:    ${r.accountHolderId}`);
  if (r.applicationId) lines.push(`  application:       ${r.applicationId} (${r.applicationStatus})`);
  lines.push(`  agreement:         v${r.agreement.version}, accepted ${r.agreement.consentTimestamp}`);
  if (r.financialAccountId) lines.push(`  financial account: ${r.financialAccountId}`);
  if (r.card) lines.push(`  virtual card:      ${r.card.id} ..${r.card.last4} exp ${r.card.expiry} ${r.card.status}`);
  const d = r.reasons;
  if (d) {
    if (d.adverseAction.reasonCodes.length) {
      lines.push('  adverse action reasons:');
      d.adverseAction.reasonCodes.forEach((c, i) => lines.push(`    ${c}: ${d.adverseAction.reasons[i]}`));
    }
    if (d.applicationDenialReason) lines.push(`  denial reason:     ${d.applicationDenialReason}`);
    lines.push(`  verification:      ${d.verification.status ?? '-'} / ${d.verification.reason ?? '-'}`);
    if (d.verification.issues.length) {
      lines.push('  verification issues (internal, not for the applicant unless consumer-safe):');
      for (const x of d.verification.issues) lines.push(`    ${x.code}: ${x.description}`);
    }
    for (const s of d.documents.sessions) {
      const types = [...new Set([...s.primaryDocumentTypes, ...s.secondaryDocumentTypes, ...s.supportingDocumentTypes])];
      lines.push(`  documents required: session ${s.sessionId} (${s.sessionStatus}); accepted: ${types.join(', ') || '-'}`);
      for (const c of s.requirements) lines.push(`    need ${c.numberOfDocuments} x ${c.documentType}`);
    }
    for (const u of r.documentUpload ?? []) lines.push(`  upload session ${u.sessionId} ${u.status}; SDK token expires ${u.clientTokenExpiresAt} (token in --json output)`);
  }
  if (r.nextStep) lines.push(`  next step: ${r.nextStep}`);
  return scrubKnown(lines.join('\n'));
}

const CLI_OPTIONS = {
  person: { type: 'string' },
  sandbox: { type: 'boolean', default: false },
  'agreement-version': { type: 'string' },
  'consent-timestamp': { type: 'string' },
  'consent-ip': { type: 'string' },
  'start-doc-upload': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  'print-requests': { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false }, // old flag; request printing is now opt-in
};

export async function main(argv = process.argv.slice(2)) {
  let values;
  try {
    ({ values } = parseArgs({ args: argv, options: CLI_OPTIONS }));
  } catch (e) {
    console.error(`${e.message}\nSee the header of scripts/highnote-onboard.mjs for usage.`);
    return EXIT.ERROR;
  }
  const err = (...a) => console.error(...a);
  const emit = obj => (values.json ? console.log(JSON.stringify(redact(obj), null, 2)) : null);

  try {
    // Everything that can be checked locally is, before a single API call.
    const problems = [];
    const apiKey = process.env.HIGHNOTE_API_KEY;
    const productId = process.env.CARD_PRODUCT_ID;
    if (!apiKey?.startsWith('sk_test_')) problems.push('HIGHNOTE_API_KEY: set a TEST key (sk_test_...). Live keys are refused.');
    if (!/^pd_\w+$/.test(productId ?? '')) problems.push('CARD_PRODUCT_ID: set your debit card product id (pd_...).');
    let consent, personInput;
    try {
      consent = buildConsent({ agreementVersion: values['agreement-version'], consentTimestamp: values['consent-timestamp'], consentIp: values['consent-ip'] });
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      problems.push(...e.problems);
    }
    try {
      personInput = validatePerson(await loadPerson(values));
      rememberPII(personInput);
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      problems.push(...e.problems);
    }
    if (problems.length) throw new ValidationError(problems);

    const hn = highnoteClient({
      apiKey,
      onRequest: values['print-requests'] ? (step, body) => err(`\n--- ${step} request body (redacted) ---\n${JSON.stringify(body, null, 2)}`) : undefined,
    });
    const r = await onboard(hn, { personInput, productId, consent, startDocUpload: values['start-doc-upload'], log: values.json ? () => {} : m => err(scrubKnown(m)) });
    if (values.json) emit(r);
    else console.log(humanSummary(r));
    return EXIT[r.status];
  } catch (e) {
    const out = {
      status: 'ERROR',
      error: e instanceof ValidationError ? { kind: 'INPUT', problems: e.problems } : { kind: e.kind ?? 'UNEXPECTED', step: e.step ?? null, message: redactText(e.message) },
      ...(e.partial && { accountHolderId: e.partial.accountHolderId, applicationId: e.partial.applicationId, financialAccountId: e.partial.financialAccountId }),
    };
    if (values.json) emit(out);
    else {
      const hint = {
        VALIDATION: 'Input rejected by Highnote: fix the fields named above.',
        ACCESS_DENIED: 'Key lacks permission for this operation or product.',
        AUTH: 'Check HIGHNOTE_API_KEY.',
        TIMEOUT: 'Still PENDING: check the application later (or wait for the webhook) before issuing anything.',
      }[e.kind];
      err(`\nFAILED: ${redactText(e.message)}${hint ? `\n${hint}` : ''}`);
      if (e.partial?.accountHolderId) err(`  account holder: ${e.partial.accountHolderId}${e.partial.applicationId ? `, application: ${e.partial.applicationId}` : ''}`);
      if (!(e instanceof ValidationError) && !(e instanceof HighnoteError)) err(redactText(e.stack ?? ''));
    }
    return EXIT.ERROR;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => {
    process.exitCode = code;
  });
}

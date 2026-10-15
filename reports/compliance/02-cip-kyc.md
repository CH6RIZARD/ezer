> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. The sponsor bank's CIP governs. Where they differ, the bank's version wins.

# 02. Customer Identification Program (CIP) and KYC Procedures

## 1. Legal basis and ownership

- **CIP rule:** 31 CFR 1020.220 (USA PATRIOT Act §326). The bank must have a written CIP as part of its BSA program. The bank may **contract out** its procedures to EZER and/or Highnote, but it stays responsible for them.
- **Reliance** on another financial institution (1020.220(a)(6)) is available only for a regulated institution that agrees to it in writing. EZER is not one, so delegation to EZER is by contract, not by reliance.
- **Credit cards:** FinCEN's 2020 exemptive relief lets banks obtain a credit card customer's TIN from a third-party source rather than from the customer. Whether this applies to the Pay-in-4 card is `[DECISION: counsel/bank]`. Assume the TIN is collected from the customer.

| Step | Sponsor bank | Highnote | EZER |
|---|---|---|---|
| Approves CIP, risk-based verification standards | **Owns** | — | — |
| Shows CIP notice to applicant | Approves text | — | **Displays it in app** before data is collected |
| Collects name, DOB, address, ID number | — | Receives via API | **Collects in app**, transmits once, does not keep SSN (see 05) |
| Non-documentary verification (data sources, OFAC) | Sets rules | **Runs it** in the application flow and returns `APPROVED` / `DENIED` / `IN_REVIEW` | Acts on the outcome |
| Documentary verification (IN_REVIEW) | Sets acceptable documents | Hosts document upload/review tooling | `[DECISION: does EZER, Highnote or the bank review documents?]` |
| CIP record retention (5 yrs after closure) | Owns | Holds platform records | Does not hold SSN or ID images, so must make sure the bank/Highnote does |

## 2. Minimum information collected (1020.220(a)(2)(i))

Collected **before the account is opened**, in a dedicated in-app step:

1. Legal name (first, middle optional, last)
2. Date of birth. Already collected at signup and stored in `User.dateOfBirth`; the 18+ check runs server-side.
3. Residential street address. Not a P.O. box. APO/FPO is allowed under the rule. `[DECISION: allowed?]`
4. Identification number. US persons: SSN or ITIN (full 9 digits). Non-US persons: `[DECISION: are non-US persons eligible at all?]` If so, passport number and country of issuance, alien ID card number, or another government-issued document number with photo.
5. Also collected for fraud and contact (not CIP): email (already held), mobile phone `[DECISION:]`, device and IP signals.

**Current state:** `apps/api/src/services/highnote.ts` and `scripts/highnote-onboard.mjs` send **sandbox placeholder identity** (Highnote test SSN, address, DOB). The app collects no SSN or address yet. Real collection is a launch blocker.

## 3. Customer notice (1020.220(a)(5))

Shown on the identity screen before the user submits:

> **Important information about procedures for opening a new account.** To help the government fight the funding of terrorism and money laundering activities, federal law requires all financial institutions to obtain, verify, and record information that identifies each person who opens an account. What this means for you: when you open an account, we will ask for your name, address, date of birth, and other information that will allow us to identify you. We may also ask to see your driver's license or other identifying documents.

`[DECISION: the bank to approve the final text and add its name ("[Bank], Member FDIC")]`

## 4. Verification and outcome handling

Verification happens through Highnote's application (`createUSPersonAccountHolder`, then the card product application). The application status drives everything that follows:

| Highnote status | Meaning | EZER action | Customer sees |
|---|---|---|---|
| `PENDING` | Decision not returned yet | Poll or wait for the webhook. Do not issue a card. Show "verifying". | "We're verifying your identity" |
| `APPROVED` | Identity verified, no OFAC hit | Issue the financial account and card (`issueFinancialAccountForApplication`, then the card). Record the decision timestamp and the application ID. | Card ready |
| `IN_REVIEW` | Data sources could not verify, or a potential watchlist match | **No card, no funding.** Open a review case (section 5). Tell the customer what is needed and the expected timing. | "We need a document to finish verifying you" |
| `DENIED` / `CLOSED` | Could not verify, fraud signals, or OFAC | **No account.** Do not resubmit the same identity (`highnote-onboard.mjs` already enforces this). Send the notice in section 6. Refer to AML if fraud or OFAC is suspected (see 01). | Denial notice (section 6) |

**Do not repeat a known failure pattern.** `services/highnote.ts` currently polls for about 15 attempts and then throws on any non-APPROVED status. `IN_REVIEW` then has nowhere to go: no queue, no user message, no resolution. CLAUDE.md records this exact anti-pattern for underwriting ("There is no manual-review state … Do not reintroduce a review state without also building something that resolves it"). KYC review is legally required, so the review state must exist. Build it with an owner, a queue, an SLA, a notification to the customer, and a final outcome before going live.

## 5. IN_REVIEW: documentary verification

- **Owner:** `[NAME: reviewer]` (or the bank/Highnote ops team, per `[DECISION:]`).
- **SLA:** first action within `[DECISION: 1 business day]`, decision within `[DECISION: 5 business days]` of receiving documents. Close the case as unverified after `[DECISION: 30 days]` without a response.
- **Acceptable documents** (bank to confirm): unexpired US driver's license or state ID, US passport, or permanent resident card. For an address mismatch, add a utility bill or bank statement dated within 60 days. For an SSN mismatch, an SSA letter or W-2 `[DECISION:]`. A selfie/liveness check is `[DECISION:]`.
- **Upload path:** through Highnote's document-upload tooling or the bank's, **not** EZER's servers. This keeps ID images out of EZER's data stores and is consistent with privacy.html §1 (see 05 for the required update).
- **Review checklist:** document authentic and unexpired; name and DOB match the application; photo consistent with any selfie; address matches or is explained; no signs of tampering. Record the reviewer, the date, the documents relied on, how discrepancies were resolved, and the decision. These are CIP records (1020.220(a)(3)(i)(C)–(D)).
- **When identity cannot be verified** (1020.220(a)(2)(iii)): do not open the account. If an account was opened provisionally, close it, return any funds by the original method, and consider a referral (01 §6).

## 6. Adverse action and denial notices

Which notice applies depends on the product. `[DECISION: counsel to confirm wording; the bank's name goes on the notice]`

| Product | Rule | What's required |
|---|---|---|
| Pay in 4 (credit) | **ECOA / Reg B, 12 CFR 1002.9** | Written notice within **30 days** of a completed application, giving **specific principal reasons** (or a disclosed right to request them) and the ECOA anti-discrimination notice with the bank's federal regulator. "Did not pass verification" is a reason. Vague reasons such as "internal policy" are not. Applies to *every* credit denial, including an underwriting decline from Spending Power (`trustScoring.ts`), not only KYC denials. |
| Any product, decision based on a consumer report | **FCRA §615(a), 15 U.S.C. 1681m(a)** | Name and contact details of the consumer reporting agency, a statement that the CRA didn't make the decision, the right to a free report within 60 days, and the right to dispute. Credit score disclosure where a score was used. `[DECISION: are Highnote's KYC data vendors consumer reporting agencies for this use?]` |
| Debit/prepaid account (not credit) | Reg B does not apply | No federal reason requirement unless FCRA §615 applies. Still send a clear, non-misleading notice (UDAAP, see 08). Never cite OFAC or suspected fraud if doing so would reveal a referral. |

Retention: Reg B requires keeping applications and notices **25 months** (12 CFR 1002.12(b)). See 06.

## 7. Ongoing KYC

- Update customer information when there is a risk-based trigger: address change, a name mismatch with the linked funding bank (Plaid Identity), returned ACH, or a fraud report.
- Verify a change of address or phone before acting on it. These are account-takeover vectors.
- The card account owner's name must match the funding account owner `[DECISION: exact or fuzzy match threshold]`.

## 8. Records

The bank (or Highnote for the bank) keeps identifying information for **5 years after account closure**, and verification records for **5 years after they are made** (1020.220(a)(3)(ii)). EZER's account deletion must not be the only copy of anything in this list (see 06).

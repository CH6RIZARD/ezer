> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (a Montana LLC) d/b/a EZER. Every `[DECISION:]` and `[NAME:]` must be resolved before this document is adopted. The sponsor bank's BSA/AML program governs; where this draft conflicts with it, the bank's program controls.

# 01. BSA/AML and OFAC Program (Program Manager Component)

## 1. Purpose and scope

EZER is a **program manager**, not a bank. The card program's deposit/prepaid accounts and any Pay-in-4 credit are products of `[NAME: sponsor bank]`, processed on the Highnote platform. The Bank Secrecy Act (31 U.S.C. 5311 et seq.) obligations sit with the bank under its own program rule (12 CFR 21.21 for OCC banks, 12 CFR 326.8 for FDIC state non-member banks, 12 CFR 208.63 for Fed members) and FinCEN's rules at 31 CFR Chapter X, Part 1020. This document describes what EZER does **under contract** so the bank's program works for EZER's customers.

Covered products:

| Product | Status (Oct 2026) | Notes |
|---|---|---|
| User-funded debit card (Highnote) | Sandbox only; `scripts/highnote-onboard.mjs` | `[DECISION: deposit account (DDA/FBO sub-account) or prepaid account?]` This choice decides whether Reg E's prepaid rule (12 CFR 1005.18) and FinCEN's prepaid access rule apply. |
| Pay in 4 (Highnote revolving credit product "ezer bnpl") | Sandbox only; checkout not built | Credit. ECOA/Reg B applies; see 02. |
| Automated savings sweeps | Not live; processor is a stub (`HANDOFF.md`) | `[DECISION: money-movement architecture]` (Highnote prepaid/GPR, Increase, Dwolla/Plaid Transfer). See section 9. |
| Subscription tracking (Plaid read-only) | Live | Not a BSA-covered activity on its own. |

## 2. Who does what

"Typically" means typical for a Highnote-style bank partnership. Confirm every row against the program agreement. `[DECISION: confirm allocation in the Highnote and bank agreements]`

| Duty | Sponsor bank | Highnote | EZER (program manager) |
|---|---|---|---|
| Written BSA/AML program, board approval | **Owns** | Supports | Adopts this component; follows the bank's program |
| BSA Officer | **Owns** (bank BSA Officer) | Has own compliance staff | Names a program-level AML contact (section 3) |
| CIP / KYC at onboarding | Owns the program (31 CFR 1020.220) | **Usually runs** identity verification in the application flow | Collects the CIP data accurately; runs the IN_REVIEW document process if delegated (see 02) |
| OFAC screening at onboarding and ongoing | Owns | **Usually runs** screening of applicants and rescreens | Escalates potential matches; never overrides a hit |
| Transaction monitoring | Owns | Often provides rules/alerts | Reports unusual activity it sees (app behaviour, support contacts, device and IP signals) |
| SAR decision and filing (31 CFR 1020.320) | **Only the bank files** | Refers | Refers within the deadline in section 6. **Never tells the customer.** |
| CTR (31 CFR 1010.311) | Bank | — | N/A in practice: no cash. Note any cash-load feature if one is ever added |
| 314(a) requests (31 CFR 1010.520) | Bank receives and searches | May search platform data | Searches its own records on request within the bank's deadline (the bank has 14 days) |
| 314(b) information sharing (31 CFR 1010.540) | Bank, if registered | — | Only through the bank unless EZER registers itself `[DECISION:]` |
| Independent testing | Bank, of its program | — | Program-level testing (section 8) |
| Training | Bank trains its staff | — | Trains every EZER person with customer, support or data access |
| Recordkeeping (31 CFR 1010.430, 5 years) | Owns | Holds platform records | Keeps its own records per 06 |

## 3. Governance

- **Program-level AML contact:** `[NAME: AML/BSA contact for EZER]`. At founding this is likely the sole member. The bank should approve a person with training and authority, and accept that one person may hold several roles. `[DECISION: is a fractional BSA advisor engaged?]`
- **Approval:** adopted by the LLC's member/manager in writing. Reviewed at least every year and whenever a product, the money flow or a vendor changes.
- **Reporting:** a monthly report to the bank covering referrals made, OFAC escalations, training completed and open issues. `[DECISION: bank's required cadence and format]`

## 4. Customer due diligence (CDD)

CDD is the "fifth pillar" (31 CFR 1020.210(a)(2)(v)). For consumer accounts that means:

- **Understand the purpose of the account** to build a risk profile. Expected use: a card the user loads from their own linked bank account for everyday and subscription spending, and small Pay-in-4 purchases (Highnote plan range $1 to $1,000).
- **Ongoing monitoring** to identify and report suspicious activity, and to update customer information when there is a risk-based reason.
- Beneficial ownership (31 CFR 1010.230) applies to legal-entity customers. EZER serves **consumers only**, 18 or older (age gate enforced server-side with the server clock). `[DECISION: confirm no business accounts.]`

Risk factors EZER can see and should feed to the bank:
- Linked funding account owner's name does not match the cardholder. Plaid Identity/ownership is described in `docs/privacy.html` §2 as "confirm a linked account belongs to you before any money movement".
- Many accounts sharing one device, IP, funding bank account or address.
- Rapid load-and-spend, loads from several external accounts, or repeated ACH returns (R01, R02, R10, R29).
- Pay-in-4 used mainly for cash-equivalent merchants (gift cards, money orders, crypto). `[DECISION: MCC blocks in collaborative authorization]`
- IP or device geolocation in a sanctioned jurisdiction (section 7).

## 5. Transaction monitoring

| Signal | Source | Who reviews |
|---|---|---|
| Card authorizations and settlements | Highnote (EZER sees each Pay-in-4 auth through `POST /webhooks/highnote/authorize`) | Bank/Highnote rules; EZER flags anomalies |
| Load/funding ACH and returns | Processor `[DECISION: which]` | Bank; EZER flags returns |
| Account takeover signals (password reset then new device then load) | EZER logs | EZER, then referral |
| Structuring-like loading patterns | Processor/Highnote | Bank |

`[DECISION: does the bank or Highnote give EZER alert access, or does EZER only refer?]` Gap: EZER production logs record `error` level only (`HANDOFF.md`), and application logs rotate after 30 days (retention policy). Neither is enough for monitoring evidence. See 06.

## 6. Unusual activity referrals (feeding SARs)

- Any EZER person who sees potentially suspicious activity tells the AML contact **the same business day**.
- The AML contact sends a written referral to the bank `[NAME: bank BSA referral address]` within `[DECISION: e.g. 2 business days]`. The bank's SAR clock is 30 calendar days from **initial detection of facts that may constitute a basis for filing** (31 CFR 1020.320(b)(3)), or up to 60 days if no suspect is identified. Late referrals eat the bank's time.
- A referral contains: customer identifiers, accounts, dates, amounts, the narrative of what was seen and why it is unusual, and supporting records.
- **Confidentiality.** SARs, and any information that would reveal whether one exists, may not be disclosed (31 CFR 1020.320(e); 31 U.S.C. 5318(g)(2)). Support staff must not tell a customer that a referral exists or that an account action is "for AML reasons". Use neutral wording ("we can't continue to provide this service").
- Account restriction or closure after a referral follows the bank's instruction.

## 7. OFAC sanctions compliance

OFAC rules apply to every US person, EZER included, whether or not the bank screens too (31 CFR Chapter V).

- **Screening:** applicants are screened against the SDN List and other OFAC lists at onboarding, and the whole base is rescreened when lists change. Typically Highnote/the bank does this. `[DECISION: confirm who screens and how often; confirm whether EZER must screen anyone itself, e.g. Pay-in-4 merchants or payees.]`
- **Geography:** block sign-up and card use from comprehensively sanctioned jurisdictions (at present Cuba, Iran, North Korea, Syria `[DECISION: check the current list]`, and the Crimea, so-called DNR and LNR regions of Ukraine). Controls are IP/geolocation checks on sign-up and on sensitive actions, plus restricting app-store distribution. The privacy policy (§6) already says data is processed in the US.
- **Potential match:** EZER never clears a potential match itself. Freeze the onboarding or transaction, escalate to the bank the same business day, and follow the bank's decision.
- **Blocking and reporting:** blocked property is reported to OFAC within 10 business days (31 CFR 501.603), and rejected transactions within 10 business days (31 CFR 501.604). Holders of blocked property also file an annual report as of June 30, due by September 30. The bank files these. EZER supplies information.
- **Records:** OFAC records are kept **10 years** (31 CFR 501.601, as amended in 2025 to match the 10-year statute of limitations).

## 8. Training and independent testing

- **Training:** on hire, then yearly, for everyone with customer or data access. It covers red flags, referral steps, SAR confidentiality, OFAC escalation and fraud typologies (account takeover, synthetic identity, first-party BNPL fraud). Record the date, attendee, content and test result.
- **Independent testing:** of this component, by someone outside the day-to-day function (bank audit, Highnote, or a third-party firm) every `[DECISION: 12 or 18 months]`, or as the bank's risk rating requires.

## 9. Money transmission and prepaid access: open legal questions

These need counsel's answer before launch, not after:

1. **FinCEN MSB status.** If the card is a **prepaid** product, is EZER a "provider of prepaid access" (31 CFR 1010.100(ff)(4)) that must register with FinCEN (31 CFR 1022.380)? The rule lets program participants designate the provider by agreement. Bank-issued programs usually designate the bank. `[DECISION:]`
2. **State money transmission.** EZER must never take possession or control of customer funds. Funds should sit at the bank (or in an FBO account at the bank), with EZER only sending instructions. Many states, including states that adopted the Money Transmission Modernization Act, exempt banks, and some recognise "agent of the payee" or bank-agent arrangements. Treatment varies by state. Get a state-by-state memo for the launch states. Montana historically had no money transmitter licensing statute. Texas licenses under Texas Finance Code ch. 152. `[DECISION: counsel to confirm current Montana and Texas status, and the launch-state list]`
3. **Savings sweeps.** Moving money from the user's own bank to a "goal" is lowest-risk when funds go to an account in the **user's own name** at a bank, with EZER never holding them. The Dwolla/Plaid Transfer model, where funds can pass through a processor-held balance, needs its own money transmission analysis. `[DECISION: architecture; see HANDOFF.md "Next" item 2]`
4. **Pay in 4 lending.** State lending/licensing and "true lender" analysis for the bank-partner credit model. California (DFPI) treats BNPL as lending under the California Financing Law. `[DECISION: confirm the bank is the lender of record in every state.]`

## 10. Gaps found while drafting

- `DELETE /account` (`apps/api/src/routes/account.ts`) revokes Plaid items and cascade-deletes local rows, but it **does not close the Highnote account or card**, and does not check for a remaining balance or open Pay-in-4 installments. Before live issuing, deletion must: (a) close the card account through Highnote; (b) return any balance to the customer (or escheat it under state unclaimed-property law); (c) keep BSA/CIP and transaction records the law requires (see 06).
- There is no admin tooling or queue for referrals, OFAC holds or account restrictions. CLAUDE.md warns against review states that nothing resolves. Each hold described here needs a named owner and a tool.

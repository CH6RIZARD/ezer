> **DRAFT. For review and editing by chiagozie LLC's fintech counsel and the sponsor bank. Not legal advice. Nothing here is adopted policy.**
> Prepared 2026-10-13 for **chiagozie LLC** (a Montana limited liability company) d/b/a **EZER**.

# EZER Compliance Policy Pack: Read Me

## What this is

A starting set of program-manager policies for the Highnote and sponsor-bank application for live card issuing. EZER's products: subscription tracking through Plaid (live); automated savings (built, not live); a user-funded debit card through Highnote and a sponsor bank (sandbox); Pay-in-4 (sandbox, checkout not built).

The facts about EZER come from `CLAUDE.md`, `HANDOFF.md`, `docs/privacy.html`, `docs/data-retention-policy.html`, and the code they reference. Where the drafts found a conflict between those documents and the code, it is written down as a **gap**, not smoothed over.

| File | Covers |
|---|---|
| `01-bsa-aml-ofac.md` | BSA/AML component, CDD, referrals feeding the bank's SARs, OFAC, money transmission and prepaid-access questions |
| `02-cip-kyc.md` | CIP (31 CFR 1020.220), Highnote `APPROVED`/`DENIED`/`IN_REVIEW` handling, document review, adverse action (Reg B, FCRA) |
| `03-complaints.md` | Complaint definition, channels, clocks, bank and regulator escalation |
| `04-reg-e-disputes.md` | Reg E error resolution and liability, prepaid variations, Reg Z for Pay-in-4 |
| `05-privacy-data-security.md` | GLBA/Reg P, FTC Safeguards Rule, PCI scope, SSN handling, encryption, access, incident response, E-SIGN, CCPA |
| `06-record-retention.md` | Card-program retention schedule, deletion with legal holds |
| `07-vendor-management.md` | Highnote, the bank, Plaid, Supabase, Railway, RevenueCat, and others |
| `08-marketing-review.md` | UDAAP, FDIC-misrepresentation, bank approval, review checklist |

## How to use it

1. Counsel reviews for accuracy and for the launch states. The bank replaces sections with its own required language. **The bank's program controls wherever it differs.**
2. Resolve every `[DECISION:]` and fill every `[NAME:]`. Search the folder for `[DECISION` and `[NAME`.
3. Fix the code and document gaps listed below before going live. Several are launch blockers.
4. Adopt each policy in writing (LLC member/manager), record the version and date, and review every year.
5. **Update `docs/privacy.html` and `docs/data-retention-policy.html` in the same commit as any behaviour change** (CLAUDE.md rule). These drafts did not edit them.

## Who does what (summary)

| Area | Sponsor bank | Highnote | EZER |
|---|---|---|---|
| BSA/AML program, SAR filing, CTR, 314(a) | Owns | Supports and monitors | Follows; refers unusual activity; trains staff |
| CIP/KYC, OFAC screening | Owns the program | Usually runs verification and screening | Collects data and shows the CIP notice; acts on outcomes; IN_REVIEW handling `[DECISION]` |
| Reg E disclosures and error resolution | Responsible | Data and chargeback tooling | Intake, investigation file, customer notices |
| Privacy notice (GLBA) | Its own notice | — | Its own Reg P notice and the Safeguards Rule program |
| PCI DSS | Network obligations | Level 1 service provider; holds PAN | Stays out of scope (no PAN/CVV) |
| Complaints | Final responses to regulators | — | Logs all complaints; first response; monthly report |
| Marketing | Approves | — | Drafts and reviews; keeps records |

## Launch-blocking gaps found while drafting

1. **Retention policy contradicts the code.** The published 7-year retention for transfers and ledger entries is wrong in practice: `DELETE /account` cascade-deletes them (`onDelete: Cascade`). (06 §6.1)
2. **privacy.html says "we do not collect government ID numbers"**. Live KYC needs an SSN. DOB, collected since 2026-10-08, is also not listed. (05 §10)
3. **Highnote and the sponsor bank are not disclosed** as recipients in privacy.html or the retention policy. (05 §10, 07)
4. **Entity name and address mismatch.** The documents say "EZER, Parker, Texas", not chiagozie LLC (Montana). The contact is a personal Gmail account. (05 §10)
5. **`DELETE /account` doesn't close the Highnote card/account** and doesn't check balances, disputes or open installments. (01 §10, 06 §4)
6. **KYC `IN_REVIEW` has no resolution path.** `services/highnote.ts` throws after polling. This is the same dead-end review state CLAUDE.md forbids. (02 §4)
7. **Real CIP collection isn't built.** Issuance uses sandbox placeholder PII. (02 §2)
8. **No E-SIGN consent flow, no dispute intake, no support channel, no loss/theft phone number.** (03, 04, 05 §9)
9. **Production database on a free tier that auto-pauses.** Backup and log retention claims are unverified. (06 §6, 07)
10. **Logging:** production logs record errors only, yet the policies claim access is "logged". Deletion and Highnote failures need durable records. (05 §2, 06 §4)

## Open decisions

**Structure and licensing**
1. Is the card a deposit account (DDA/FBO) or a **prepaid** account? This drives Reg E §1005.18, FinCEN prepaid access, and the disclosures. (01, 04)
2. Is EZER a FinCEN "provider of prepaid access" / MSB, or is the bank designated by agreement? (01 §9)
3. State money transmission analysis for the launch states, including the current status in Montana and Texas. (01 §9)
4. Savings money-movement architecture (Highnote GPR / Increase / Dwolla / Plaid Transfer), and whether EZER ever holds funds. (01 §9)
5. Pay-in-4: is the bank the lender of record in every state? Reg Z coverage? Late-fee policy? Credit bureau reporting? FinCEN 2020 card TIN relief? (01, 02, 04, 08)
6. Consumers only, no business accounts? Non-US persons eligible? APO/FPO addresses accepted? (01 §4, 02 §2)

**Allocation (confirm in the Highnote and bank agreements)**
7. Who runs CIP verification, OFAC screening and rescreening, transaction monitoring, alert access, and IN_REVIEW document review? (01 §2, 02 §1)
8. Who decides Reg E claims and chargebacks? (04 §2)
9. Bank's required reporting cadence (AML, complaints) and marketing approval SLA. (01 §3, 03 §6, 08 §2)
10. Who keeps CIP, OFAC and card records, so EZER doesn't duplicate them? (06 §3)

**People** (`[NAME:]` placeholders)
11. EZER AML/BSA contact; is a fractional BSA advisor engaged? (01 §3)
12. Safeguards Rule Qualified Individual; incident lead; counsel; bank and Highnote incident contacts. (05)
13. KYC document reviewer; complaint owner; marketing reviewer; vendor-management owner; litigation-hold owner. (02, 03, 06, 07, 08)
14. A key-person backup with emergency access. (07 §4)

**Policy parameters**
15. Referral deadline to the bank (proposed 2 business days). (01 §6)
16. MCC blocks for Pay-in-4 (cash equivalents, crypto, gift cards). (01 §4)
17. Name-match threshold between the cardholder and the funding account. (02 §7)
18. IN_REVIEW SLAs (1 business day first action, 5 business days decision, 30 days abandon); acceptable documents; selfie/liveness. (02 §5)
19. Wording of adverse-action and denial notices; whether KYC data vendors are CRAs for FCRA §615. (02 §6)
20. Complaint acknowledgment and resolution targets (1 and 15 business days); bank escalation in 1 business day; record retention period. (03)
21. Reg E: investigate untimely claims anyway? Adopt $0 liability? Build a Pay-in-4 dispute exclusion from missed-installment suspension. (04)
22. Customer MFA for card users, or a written "equivalent control" approval. (05 §2)
23. EZER's own Reg P notice vs reliance on the bank's notice; CCPA and other state privacy law applicability. (05 §1, §7)
24. Confirm Highnote-hosted SSN/document capture and secure card display; collaborative-auth payload contains no PAN; SAQ type. (05 §5)
25. Key rotation schedule; penetration test vendor and date; bank incident notice deadline. (05 §4, §8)
26. Retention periods for card records, complaints, consents, incidents and marketing; escheat handling; archive design for retained records after deletion. (06)
27. Supabase plan, backups/PITR, and a DB-aware health check; Railway log retention. (07)
28. Add GitHub, Expo, Apple, Google, Microsoft and the future processor to the published sub-processor list, or confirm they're out of scope. (07 §3)
29. Exact bank, FDIC and network disclosure text for marketing. (08 §3)

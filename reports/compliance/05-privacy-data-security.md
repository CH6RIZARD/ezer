> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. This is the written information security program and privacy compliance summary. The public documents it must stay consistent with are `docs/privacy.html` (updated 2 Oct 2026) and `docs/data-retention-policy.html` (v1.0, 7 Sep 2026).

# 05. Privacy and Information Security Program

## 1. Which laws apply

| Law | Applies because | Key duties |
|---|---|---|
| **GLBA privacy, Reg P (12 CFR Part 1016)** | EZER is a nonbank "financial institution" in its own right (personal-finance data aggregation and savings services are financial activities), and it receives bank customers' nonpublic personal information (NPI) as the bank's service provider | Initial privacy notice when the customer relationship starts (§1016.4). Annual notice, unless the §1016.5(e) exception applies (sharing only under §§1016.13–.15 exceptions and policies unchanged). Opt-out before sharing NPI with non-affiliated third parties outside the exceptions (§1016.7, .10). Limits on reuse of NPI received from the bank (§1016.11). Model form at Appendix A to Part 1016. |
| **FTC Safeguards Rule (16 CFR Part 314)** | EZER is a nonbank financial institution under FTC jurisdiction | Written information security program with the §314.4 elements (section 2) |
| **Bank's Interagency Guidelines (12 CFR Part 30 App. B / 12 CFR 364 App. B)** | Flow down to EZER by contract as a bank service provider | Security controls, incident notice to the bank |
| **Bank service-provider incident notice (12 CFR 53.4 / 225.303 / 304.24)** | EZER provides services to the bank | Notify the bank **as soon as possible** of an incident that materially disrupts covered services, or is likely to, for **4+ hours**. The bank then has 36 hours to notify its regulator. |
| **PCI DSS v4.0.1** | Card program, by network rules and contract | Section 5 |
| **E-SIGN Act (15 U.S.C. 7001)** | Required disclosures (Reg E, Reg P, Reg Z, Reg B) delivered electronically | Section 9 |
| **CCPA/CPRA (Cal. Civ. Code 1798.100 et seq.)** | Only if a threshold is met (more than ~$26.6M revenue as adjusted, 100,000+ CA consumers/households, or 50%+ revenue from selling/sharing). GLBA-covered information is exempt (§1798.145(e)), but not the rest. | `[DECISION: counsel to confirm applicability]` privacy.html already honours access and deletion requests everywhere, which is a sound default. |
| **Other state privacy laws** (Montana MCDPA, Texas TDPSA, others) | Thresholds and GLBA exemptions vary by state. Montana amended its law in 2025. | `[DECISION: counsel to map]` |
| **State breach-notification laws** | Residents of every state | Section 8 |
| **CFPB §1033 personal financial data rights rule (12 CFR Part 1033)** | Governs data access through Plaid. Compliance dates and content were under reconsideration and litigation in 2025–26. | `[DECISION: counsel to track]` |
| **Google API Services User Data Policy (Limited Use)** | Gmail read-only scope | Already reflected in privacy.html §3 |

## 2. Safeguards Rule elements (16 CFR 314.4)

| Element | EZER implementation | Status |
|---|---|---|
| (a) Qualified Individual | `[NAME: Qualified Individual]` (likely the owner) | To appoint in writing |
| (b) Written risk assessment | Assets: Supabase Postgres, Railway API, Highnote/Plaid credentials, mobile app, GitHub repo, AI coding agents with repo access | `[DECISION: complete before launch]` Firms with fewer than 5,000 consumers are exempt from (b)'s written form (§314.6). Banks expect one anyway. |
| (c)(1) Access controls | Section 6 | Partly in place |
| (c)(2) Data and system inventory | Sub-processor table in the retention policy §9, plus this program | Add Highnote, GitHub, Expo/EAS, Google/Microsoft OAuth |
| (c)(3) Encryption in transit and at rest | Section 4 | In place, to verify |
| (c)(4) Secure development | Code review, dependency audit, secrets kept out of git (`env.ts` refuses to boot without production secrets) | `[DECISION: formal SDLC and review of AI-agent commits]` |
| (c)(5) **MFA for anyone accessing an information system** | Admin consoles: section 6. **Customers:** login is password or OAuth, plus an on-device passcode (LockGate). `[DECISION: is that "reasonably equivalent", with the Qualified Individual's written approval, or is MFA added for card customers?]` | Gap |
| (c)(6) Secure disposal no later than 2 years after last use, unless needed or legally required | Retention policy §3–4 | See 06 |
| (c)(7) Change management | Git, PR review on `claude/*` branches, Railway deploys gated on checks | Document it |
| (c)(8) Monitoring and logging of authorized users | Supabase/Railway audit logs | **Gap:** production logs only `error` level (HANDOFF.md). The privacy policy claims "Access to production systems is restricted and logged", so logging must be verified to exist. |
| (d) Testing | Yearly penetration test plus vulnerability scans every 6 months, or continuous monitoring | `[DECISION: vendor and date]` |
| (e) Training | Yearly security training | — |
| (f) Service provider oversight | 07 | — |
| (h) Written incident response plan | Section 8 | — |
| (i) Yearly written report to the governing body | Qualified Individual reports to the LLC member | — |
| (j) **FTC notification** | Within **30 days** of discovering unencrypted customer information of **500+ consumers** acquired without authorization | Section 8 |

## 3. Data map (from privacy.html, the retention policy and the code)

| Data | Where | Protection |
|---|---|---|
| Email, name, bcrypt password hash, DOB, consent record | Supabase (`User`) | Disk encryption. Passwords bcrypt only. |
| Plaid access tokens | Supabase | **AES-256-GCM** application-level encryption (`apps/api/src/utils/encryption.ts`) with `ENCRYPTION_KEY` held in Railway env, separate from the DB |
| Transactions, balances, subscriptions | Supabase | Disk encryption |
| Email content | **Device only.** Parsed on the phone; only extracted fields reach the server (CLAUDE.md "Inbox scanning") | Mailbox tokens never leave the device |
| Card photos | **Device only**, never uploaded, wiped on logout/deletion | Stored unredacted on the device (CLAUDE.md "Wallet card art") |
| Highnote IDs (`User.highnoteCardId`), last 4, expiry | Supabase / app | No full PAN or CVV |
| **SSN, full address, ID documents (CIP)** | Not collected yet | See section 5 |

## 4. Encryption and key management

- TLS 1.2+ on every external connection (API, Plaid, Highnote, Supabase).
- At rest: Supabase managed-disk encryption, plus field-level AES-256-GCM for Plaid tokens.
- Keys: `ENCRYPTION_KEY`, `JWT_SECRET`, `HIGHNOTE_API_KEY`, `HIGHNOTE_COLLAB_AUTH_SECRET`, `INSTALLMENT_SWEEP_SECRET` and `PROCESSOR_WEBHOOK_SECRET` are Railway environment variables only. They are never in git, and the API refuses to boot in production without the required ones (`env.ts`). Highnote scripts run through `railway run` so the key never leaves the environment.
- `[DECISION: key rotation schedule and procedure]`. Rotating `ENCRYPTION_KEY` needs a re-encryption migration.
- Webhooks are authenticated by HMAC over the raw body (Highnote collaborative authorization) and fail closed when no secret is configured.

## 5. SSN and PCI scope

**SSN and CIP data** (needed before live issuing; see 02):
- **Preferred:** capture the SSN and ID documents with Highnote/bank-hosted secure input or document upload, so they never reach EZER's servers. `[DECISION: confirm Highnote offers this for onboarding]`
- **Otherwise:** the SSN is sent over TLS from the app to the EZER API and passed straight to Highnote. It is **never written to the database, logs, analytics, crash reports, AsyncStorage or backups.** Fastify logger redaction is configured for the SSN, DOB and address fields. It is shown only as the last 4 digits. Requests carrying an SSN are excluded from any request logging.
- privacy.html §1 currently says *"We do not collect government ID numbers"*. That stops being true once real KYC ships. The policy must change **in the same release** (the CLAUDE.md rule).

**PCI DSS:**
- Target: **EZER never stores, processes or transmits the full PAN or CVV.** Card details shown to the user come from Highnote's PCI-compliant secure display component, rendered from Highnote rather than relayed through EZER's API. Today the app shows last 4, expiry and a TEST badge only.
- The collaborative-authorization webhook (`routes/highnoteAuth.ts`) must be confirmed to receive no PAN. `[DECISION: verify the payload]` If it ever does, the API comes into PCI scope.
- Obtain Highnote's PCI DSS **Attestation of Compliance** (Level 1 service provider) every year. `[DECISION: EZER's own SAQ type, likely SAQ A or none. Confirm with Highnote and the bank.]`
- Card photos are the user's own images, kept only on their device and never transmitted. They are outside EZER's cardholder data environment, but they can hold a full PAN. Redacting them before storage remains on the backlog (CLAUDE.md).

## 6. Access control

- **Production access:** restricted to `[NAME: policy owner]` (retention policy §7). A list of others with access is kept and reviewed every quarter.
- **MFA required** on GitHub, Railway, Supabase, Highnote dashboard, Plaid dashboard, Apple/Google developer consoles, RevenueCat, the domain registrar, and the support mailbox.
- **No direct production data edits** except under a logged, approved change. CLAUDE.md records a login broken by editing `passwordHash` by hand in the Supabase table editor.
- **AI coding agents:** they may read and propose. Production database writes and deploys need the owner's explicit approval, which the permission system already enforces. Agents never receive production PII or secrets in prompts.
- Leaver procedure: revoke all accounts and rotate shared secrets within 1 business day.

## 7. Customer-facing privacy duties

- **GLBA notice:** `[DECISION: EZER's own Reg P notice (model form) vs. reliance on the bank's notice for card customers]`. privacy.html is a good plain-language policy, but it is **not** a Reg P model-form notice.
- **Rights:** self-serve export (`GET /account/export`, which strips `passwordHash`) and deletion (`DELETE /account`). Emailed requests are answered within 30 days (retention policy §5).
- **No sale or sharing for cross-context advertising** (privacy.html §4). Marketing must not use financial or email data (see 08).

## 8. Incident response plan

**Roles:** Incident lead `[NAME:]`. Counsel `[NAME:]`. Bank contact `[NAME: bank incident contact]`. Highnote contact `[NAME:]`. Plaid security contact (per the Plaid agreement).

1. **Detect and triage (hour 0):** open an incident record with the time discovered, the systems affected, the data types, and whether data is encrypted.
2. **Contain:** rotate the affected secrets (Railway env), revoke tokens (Plaid `/item/remove` if Plaid tokens are exposed), suspend affected cards through Highnote, and disable the vulnerable route.
3. **Notify partners:**
   - **Bank:** as soon as possible, and within `[DECISION: e.g. 24 hours, per bank agreement]` for any incident touching bank customers' data or card services, and in any case for a disruption of 4+ hours.
   - **Highnote**, and the card networks through Highnote, for any suspected card data compromise.
   - **Plaid**, per its agreement, for any incident involving Plaid data.
4. **Notify regulators and individuals:**
   - **FTC** within **30 days** if 500+ consumers' unencrypted information was acquired (16 CFR 314.4(j); online form).
   - **Individuals and state AGs** under each affected state's law. **Texas:** individuals within 60 days; the AG within 30 days if 250+ Texans (Tex. Bus. & Com. Code 521.053). **Montana:** without unreasonable delay, with a copy to the Montana Office of Consumer Protection (Mont. Code Ann. 30-14-1704). `[DECISION: counsel to confirm the current text and the other launch states]`
   - privacy.html §8 promises notice "as required by applicable law".
5. **Recover and review:** fix the root cause, run a post-incident review within 10 business days, and update this program.
6. **Records:** keep the incident file for at least `[DECISION: 5 years]`.

## 9. E-SIGN consent

Before delivering any required disclosure electronically (Reg E initial disclosures and change notices, Reg P notice, Reg Z/Reg B notices, adverse action), get consent under 15 U.S.C. 7001(c). Before consent, the consumer gets a clear and conspicuous statement of:
- the right to paper copies, and any fee for them;
- the right to withdraw consent, and its consequences;
- what the consent covers;
- how to update contact details;
- how to get paper copies;
- the hardware and software needed.

The consumer consents electronically in a way that **reasonably demonstrates** they can access the format (for example, opening a PDF or page and confirming). Tell them of any change in hardware or software requirements. Record the consent with a timestamp and version, mirroring `User.consentedAt` / `consentVersion`. **Gap:** no E-SIGN consent flow exists today. The existing consent record covers the Terms and Privacy Policy only.

## 10. Gaps against the public documents (must fix before or at launch)

1. privacy.html §1 says no government ID numbers are collected. Live KYC requires an SSN, so the text must change.
2. privacy.html §1 doesn't list **date of birth**, which signup has collected since 2026-10-08 (`User.dateOfBirth`). Also missing: address and phone, once CIP ships.
3. **Highnote and the sponsor bank** are missing from privacy.html §5 and the retention policy §9. "A payment processor" should be named.
4. privacy.html and the retention policy name the operator as "EZER, 7308 Forest Bend Drive, Parker, Texas", not **chiagozie LLC, a Montana LLC**. `[DECISION: legal entity name and address on all documents]`
5. The contact address is a personal Gmail account. Use a company-domain mailbox.
6. privacy.html §9 promises that deletion means "everything goes". That conflicts with BSA/CIP/Reg E retention once card accounts exist (see 06).
7. The claim that access is "restricted and logged" needs verifying evidence (section 2, (c)(8)).

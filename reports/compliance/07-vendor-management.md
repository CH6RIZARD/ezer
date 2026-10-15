> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. EZER is itself a third party in the sponsor bank's risk management program (Interagency Guidance on Third-Party Relationships: Risk Management, June 2023). This policy covers EZER's **own** vendors. The bank will expect it to flow down the controls the bank imposes on EZER.

# 07. Vendor (Third-Party) Management

## 1. Lifecycle

1. **Plan:** say why the vendor is needed, what data it gets, and what happens if it fails.
2. **Due diligence before contract:** security attestations (SOC 2 Type II and/or ISO 27001; PCI AOC where card data is involved), financial health, regulatory standing, sub-processors, breach history, data location (US: privacy.html §6).
3. **Contract:** data use limits (GLBA §1016.11 reuse limits for bank customer NPI), confidentiality, security standards, **incident notice to EZER within `[DECISION: 24–72h]`**, audit and assessment rights or reliance on reports, sub-processor notice, data return and deletion at exit, business continuity, termination rights.
4. **Ongoing monitoring:** a yearly review for critical vendors and every 2 years for others. Collect new SOC reports and review them, including complementary user entity controls (CUECs). Track incidents and uptime.
5. **Exit:** retrieve data, confirm deletion in writing, revoke credentials and API keys, update the sub-processor list in privacy.html §5 and the retention policy §9 (which says adding a sub-processor triggers a policy review).

**Owner:** `[NAME: vendor management owner]`. Inventory reviewed every quarter.

## 2. Risk tiers

| Tier | Definition | Review |
|---|---|---|
| **Critical** | Handles bank customer NPI or card data, moves money, or an outage stops the card program | Yearly full review; bank notified of any change |
| **High** | Holds personal data, or an outage stops the app | Yearly |
| **Moderate** | Limited data, replaceable | Every 2 years |

## 3. Vendor inventory

| Vendor | Service | Data | Tier | Due diligence to collect | Known issues and notes |
|---|---|---|---|---|---|
| **Highnote** | Card issuing processor and platform; KYC application flow; collaborative authorization; ledgers | Full CIP data including SSN, PAN, transactions, balances | **Critical** | SOC 2 Type II, **PCI DSS AOC (service provider)**, bank partnership confirmation, KYC/OFAC vendor list, BSA program summary, incident-notice terms, SLA for the collaborative-auth timeout (Highnote waits about 2s, then applies stand-in rules) | Sandbox only today. Production needs Highnote approval plus a bank partner. Highnote test env template names contain other tenants' XSS strings, so never render Highnote-provided text as HTML. Not yet listed in privacy.html or the retention policy. **Add it.** |
| **Sponsor bank** `[NAME:]` | Issuer of record; BSA/CIP owner | Everything above | **Critical** (and EZER is *its* vendor) | Program agreement, compliance management system requirements, complaint and marketing approval process | Not yet in the public documents. Add it. |
| **Plaid Inc.** | Bank linking; transactions, balances, identity/ownership; `/item/remove` on deletion | Financial account and transaction data; encrypted access tokens held by EZER | **Critical** (funding verification) / High (subscriptions) | SOC 2 Type II, ISO 27001, Plaid developer policy and MSA, §1033 posture | Production review already in progress (compliance items in CLAUDE.md exist for it). Plaid calls are rate-limited per user because they cost money. Plaid-tagged `pay_in_4` banks. |
| **Supabase** | Managed Postgres (all stored personal data) | All server-side personal data | **Critical** | SOC 2 Type II, DPA, backup and PITR configuration, encryption at rest, region (US), access logging | **The production project auto-paused after 7 idle days on the free tier** (CLAUDE.md), and `/health` didn't detect it. A paused or unbacked database is unacceptable for a bank program. `[DECISION: move to a paid plan with backups/PITR matching the 30-day claim, and add a DB-touching health check]` |
| **Railway** | API hosting, environment secrets, logs | Data in transit and in memory; logs; **all production secrets** | **Critical** | SOC 2 report, DPA, region, log retention, team access and MFA | Migrations are applied by hand; there is no cron. Deploys queue behind GitHub checks. Only one replica is assumed (rate limiting is in memory). Verify log retention against the 30-day claim. |
| **RevenueCat** | Validates EZER's own paid-plan subscriptions (with Apple/Google) | Purchase status, app user ID; no financial account data | Moderate | SOC 2, DPA | Not involved in the card program. Keep NPI out of RevenueCat attributes. |

**Also in scope and missing from the public sub-processor list** `[DECISION: add, or confirm they don't process customer personal data]`:
- GitHub (source and CI; GitHub Pages hosts the legal documents)
- Expo/EAS (builds; `EXPO_PUBLIC_*` values are compiled into the app)
- Apple and Google (app stores, sign-in providers, and Gmail API when the user connects it)
- Microsoft (sign-in, Outlook)
- The future money-movement processor (Dwolla, Increase, Plaid Transfer, or Highnote)
- Email and support tooling once adopted
- AI coding tools with repository access (no production data; see 05 §6)

## 4. Concentration and continuity

- EZER depends on one person. `[DECISION: a written key-person continuity plan, with a named backup who has emergency access to Railway, Supabase, Highnote, Plaid and the domain]`. A bank reviewer will ask for this.
- Exit plan for Highnote/the bank: how cardholders are notified and funds returned if the program ends (ties to 06 §4).

> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. This draft **extends** the published `docs/data-retention-policy.html` (v1.0) for the card program. Once adopted, the published policy and privacy.html §7 must be updated in the same commit (CLAUDE.md rule).

# 06. Record Retention Schedule (Card Program Addendum)

## 1. Principle

The existing policy holds: keep personal data only while it is needed or while the law requires it, then delete it. The card program adds legal retention duties that **override a user's deletion request** for specific records. CCPA §1798.105(d) and GDPR Art. 17(3)(b) both allow this. The fix is to **retain the minimum, restrict access to it, and stop all other use**. Silent deletion is not an option.

## 2. Current published schedule (unchanged for non-card data)

The account record, Plaid tokens, transactions and balances, email-derived subscriptions, application logs (30 days) and encrypted backups (30 days) stay as the retention policy §3 states.

## 3. Additions for card issuing, Pay-in-4 and money movement

The holder is the party expected to keep the system of record. `[DECISION: confirm with Highnote and the bank. If they hold it, EZER need not keep a duplicate, and the agreement should say so.]`

| Record | Legal basis | Minimum period | Expected holder | EZER copy? |
|---|---|---|---|---|
| CIP identifying information (name, DOB, address, ID number) | 31 CFR 1020.220(a)(3)(ii)(A) | **5 years after the account is closed** | Bank / Highnote | Name and DOB only, under the same rule as the bank |
| CIP verification records (methods, documents, discrepancy resolution) | 1020.220(a)(3)(ii)(B) | **5 years after the record is made** | Bank / Highnote | No (ID images never on EZER systems; see 05 §5) |
| BSA records generally; funds-transfer records ≥ $3,000 | 31 CFR 1010.430, 1010.410 | **5 years** | Bank | Referral files: yes |
| SAR and supporting documentation; EZER referrals | 31 CFR 1020.320(d) | **5 years from filing** | Bank | Referral file, **access restricted** to the AML contact |
| OFAC: screening results, blocked and rejected transaction records | 31 CFR 501.601 | **10 years** | Bank / Highnote | Escalation records |
| Reg E: error notices, investigations, disclosures | 12 CFR 1005.13 | **2 years** (bank may require more) | Bank + EZER | Yes |
| Reg E §1005.10(b) preauthorized-transfer authorizations (savings sweeps, Pay-in-4 autopay) | §1005.10(b); Nacha (2 years from termination or revocation) | **2 years after termination or revocation** | EZER / processor | Yes |
| Reg B: credit applications, adverse action notices, reasons | 12 CFR 1002.12(b) | **25 months** after notice | Bank + EZER (Spending Power decisions, `CardAccessList`) | Yes |
| Reg Z (if applicable): billing-error files, disclosures | 12 CFR 1026.25 | **2 years** | Bank + EZER | Yes |
| Card transactions, statements | Bank program and network rules | `[DECISION: bank; commonly 5–7 years]` | Highnote / bank | Mirror optional |
| Savings transfers, ledger entries | Retention policy says **7 years** | 7 years | EZER | **See gap 1** |
| Complaint files | Bank agreement | `[DECISION: e.g. 3 years]` | EZER | Yes |
| E-SIGN consents, Terms/Privacy consent | Evidence | Life of account + `[DECISION: 7 years]` (current: +3 years) | EZER | Yes |
| Information security incident files | Safeguards Rule evidence; litigation | `[DECISION: 5 years]` | EZER | Yes |
| Marketing materials and approvals | Bank agreement; UDAAP evidence | `[DECISION: 3 years after last use]` | EZER | Yes |
| Vendor due diligence files | Bank third-party risk expectations | Life of relationship + 3 years | EZER | Yes |
| Training records, program approvals, independent test reports | BSA program evidence | **5 years** | EZER | Yes |

## 4. Account deletion with legal holds

`DELETE /account` (`apps/api/src/routes/account.ts`) currently revokes Plaid items **first** (that ordering is load-bearing and must stay), then deletes the `User` row, which cascades through every user-owned table. For card customers the endpoint must become:

1. **Block or route** the request if the card account has a non-zero balance, a pending transaction, an open Reg E dispute, or an open or unpaid Pay-in-4 plan. Tell the user why, and how to resolve it (balance refund, final installment).
2. **Revoke Plaid items upstream** (unchanged; still first).
3. **Close the Highnote card and financial account** through the API, and return any remaining funds to the customer by `[DECISION: method]`. Funds that cannot be returned follow state **unclaimed property** (escheat) rules. `[DECISION: dormancy and escheat handling, owned by the bank?]`
4. **Move retained records to a restricted archive** (a separate schema or table with no app read path), keyed by an archive ID. Keep only the fields the law requires: name, DOB and Highnote account IDs where CIP or transaction linkage is legally required; transfers, ledger entries and dispute files. "Separated from your identifying details" (privacy.html §7) is only achievable for records that do not legally need identity. **BSA/CIP records must stay attributable to the person.**
5. Delete everything else as today. Purge backups on the 30-day rotation.
6. Log the outcome, including any Plaid or Highnote revoke failure, for manual follow-up. **Production logs currently record errors only, so this log needs a durable home.**

## 5. Disposal

- Each record is disposed of when its period ends, by an automated job. `[DECISION: build]`. The FTC Safeguards Rule requires disposal no later than 2 years after last use unless a legal or business need exists (16 CFR 314.4(c)(6)).
- **Litigation or regulatory holds** suspend disposal for the affected records. `[NAME: hold owner]` maintains the hold list.
- Disposal never means handing data to a third party (retention policy §4).

## 6. Gaps found while drafting

1. **The published policy contradicts the code.** The retention policy §3 and privacy.html §7 say savings transfers and ledger entries are kept **7 years**. But `Transfer` and `LedgerEntry` carry `onDelete: Cascade` from `User` (`packages/db/prisma/schema.prisma`), and `DELETE /account` deletes them immediately. The retention policy §4 even lists transfers and ledger entries among the cascaded tables. This is a live misrepresentation risk. No real money has moved yet (savings processor stub; `FundingSource` has never had a row), so the practical exposure today is nil. **Fix before any money moves:** archive per section 4, or change the published text. `[DECISION:]`
2. `DELETE /account` does not touch Highnote (no card or account closure, no balance check).
3. **Backup retention claim:** "encrypted backups … 30-day rotation". Verify the Supabase plan's actual backup retention and that backups exist at all. The free tier auto-paused the production database (CLAUDE.md), which suggests production is on a free plan. See 07.
4. **Log retention claim:** "application logs 30 days". Verify Railway's actual retention for the current plan.
5. Consent records are kept for life of account + 3 years. Bank agreements and E-SIGN evidence usually call for longer. `[DECISION:]`

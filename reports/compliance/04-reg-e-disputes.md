> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. The sponsor bank is the "financial institution" under Reg E for the card account and owns the outcome. EZER runs intake and the investigation file under contract.

# 04. Regulation E: Error Resolution and Unauthorized Transfers

## 1. What is covered

| Activity | Rule | Notes |
|---|---|---|
| Debit card purchases, loads and withdrawals on the user-funded card | **Reg E, 12 CFR Part 1005** | If the card is a **prepaid account**, the prepaid rule (§1005.18) also applies, along with pre-acquisition disclosures (§1005.18(b)) and agreement submission to the CFPB (§1005.19). `[DECISION: deposit vs prepaid]` |
| ACH debits EZER initiates from the user's external bank to fund the card or a savings goal | Reg E §1005.10 (preauthorized transfers) and Nacha Rules | The user's own bank handles their Reg E disputes for its account. EZER may be a **"service provider" under §1005.14** if it issues an access device and provides EFT services without an agreement with that bank. `[DECISION: counsel]` |
| Pay-in-4 card transactions | **Reg Z, 12 CFR 1026.12–1026.13**, not Reg E, if the product is a credit card account under an open-end plan (the Highnote product is set up as revolving credit) | Section 7 below. `[DECISION: counsel to confirm Reg Z coverage of the Pay-in-4 product]` |
| Pay-in-4 repayment debits from the user's bank | Reg E §1005.10(e): **credit may not be conditioned on preauthorized EFT repayment** | Users must be offered another way to repay. `[DECISION: manual payment method]` |

## 2. Roles

| Duty | Sponsor bank | Highnote | EZER |
|---|---|---|---|
| Reg E disclosures (initial §1005.7, change in terms §1005.8, 21 days' notice) | Approves and is responsible | Hosts templates | Delivers them in app with E-SIGN consent (05 §9) |
| Periodic statement (§1005.9) or prepaid alternative (§1005.18(c)) | Responsible | Generates the data | Shows statements/history in app |
| Error intake | — | — | **Receives notices on every channel**; starts the clock the same day |
| Investigation | Oversees and decides | Network chargeback tooling and transaction data | **Assembles the file**; files the chargeback through Highnote where appropriate `[DECISION: who decides]` |
| Provisional credit | Funds and approves | Posts the ledger adjustment | Triggers it and tells the customer |
| Final notice | Approves the template | — | Sends it |

## 3. What counts as an error notice (§1005.11(a), (b))

Any oral or written notice, **through any channel, including support chat or email**, that lets EZER identify the consumer's name and account, says the consumer believes there is an error, and gives the type, date and amount where possible. Errors include unauthorized transfers, incorrect amounts, missing credits, computational errors, ATM cash shortfalls, transfers missing from a statement, and requests for documentation or clarification.

**Never** require the customer to use a specific form, file a police report, or contact the merchant first before investigating. Requiring merchant contact first is a frequent CFPB finding. Suggesting it is fine.

**Timeliness:** a notice is timely if received within **60 days** after the periodic statement first showing the error was sent. For prepaid accounts using the §1005.18(c) alternative, the 60 days run from the earlier of the consumer's first electronic access to history showing the error or the sending of a requested written history. Alternatively, the institution may treat a notice as timely within **120 days** after the transaction posted. `[DECISION: bank practice. Many programs investigate every claim regardless of timeliness.]`

## 4. Timelines

| Step | Standard account | New account (first 30 days after first deposit), POS debit card, or foreign-initiated |
|---|---|---|
| Written confirmation | May be required within 10 business days of an oral notice, **only if the customer is told this at the time and given the address** (§1005.11(b)(2)). If it isn't received, provisional credit is not required. | Same |
| Investigate and decide, no provisional credit | **10 business days** | **20 business days** (new accounts) |
| Extended investigation | Up to **45 calendar days**, if provisional credit posts within 10 business days | Up to **90 calendar days** (provisional credit within 10 business days, or 20 for new accounts) |
| Notice of provisional credit | Within **2 business days** of crediting: amount and date; customer has full use of the funds | Same |
| Correct a confirmed error | Within **1 business day** of the determination | Same |
| Report results | Within **3 business days** after the investigation ends | Same |
| Reversing provisional credit after a no-error finding | Notify the date and amount of the debit. Honour checks, drafts and preauthorized transfers to third parties up to the credited amount, without overdraft fees, for **5 business days** after the notice. | Same |

Prepaid accounts: provisional credit and the liability limits apply only to accounts whose identity verification is complete (§1005.18(e)(3)). EZER issues cards only after `APPROVED` KYC (see 02), so every live card account should be verified.

## 5. Consumer liability for unauthorized transfers (§1005.6)

- Reported within **2 business days** of learning of loss or theft of the card or credentials: liability is at most **$50**.
- Reported later: at most **$500**.
- Unauthorized transfers on a statement not reported within **60 days** of the statement being sent: no limit for transfers after day 60 and before notice, if the institution shows timely notice would have prevented them. Extend these periods for extenuating circumstances (hospitalization, travel).
- Negligence (for example, a shared PIN) **does not** increase liability under Reg E.
- Card network zero-liability rules (Mastercard) usually reduce this to **$0** for card transactions. `[DECISION: adopt $0 liability as program policy?]`
- A transfer by someone the consumer gave access to is authorized unless the consumer told the institution that access was revoked.

## 6. Investigation procedure

1. **Intake (day 0):** log in the complaint system (03), flagged "Reg E". Record the receipt time. Send an acknowledgment saying what happens next and, if written confirmation is required, the address and deadline.
2. **Protect:** on an alleged unauthorized transfer, offer to lock the card (Highnote suspend) and replace it. Force a password reset if account takeover is suspected.
3. **Gather:** the Highnote authorization and settlement record, merchant descriptor, MCC, entry mode, the EZER collaborative-authorization decision log, device and IP history, login history, linked funding sources, and earlier disputes.
4. **Decide by day 10** (business days). If more time is needed, **post provisional credit by day 10** and send the provisional-credit notice within 2 business days.
5. **Chargeback** through Highnote within network time limits where the facts support one. A chargeback outcome does **not** replace the Reg E determination. The consumer's rights do not depend on winning the chargeback.
6. **Determine and notify.** If an error occurred: correct within 1 business day and notify within 3. If not: a written explanation, the right to request the documents relied on (provide them promptly), and, if provisional credit is being reversed, the 5-business-day notice.
7. **Close** in the log with the root cause.

## 7. Pay-in-4 (if Reg Z applies)

Billing error notice within **60 days** of the first statement showing the error. Acknowledge in writing within **30 days**. Resolve within **two complete billing cycles, and no more than 90 days** (§1026.13). The consumer need not pay the disputed amount while it is under review, and collection and adverse reporting on it are restricted. Unauthorized use liability is capped at **$50** (§1026.12(b)). Missed-installment logic (`services/installmentEngine.ts` suspends Spending Power on a returned debit) **must exclude installments under billing-error dispute**. `[DECISION: build this exclusion]`

## 8. Records

Keep evidence of compliance, including notices, investigation files and determinations, for at least **2 years** (§1005.13; §1026.25 for Reg Z). Bank agreements often require longer. `[DECISION:]` See 06.

## 9. Gaps found while drafting

- No dispute intake exists in the app yet, and no phone number or address for reporting loss/theft (§1005.7(b)(2) requires one in the initial disclosures).
- No E-SIGN consent flow exists for delivering Reg E disclosures electronically (05 §9).
- Savings sweeps and Pay-in-4 repayment debits from the user's external bank need a §1005.10(b) **written (or similarly authenticated) authorization** that sets out the terms, with a copy given to the consumer, plus Nacha WEB-debit account validation. `[DECISION: confirm with the processor]`

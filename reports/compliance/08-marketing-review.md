> **DRAFT for review by counsel and the sponsor bank. Not legal advice. Not adopted.**
> Prepared 2026-10-13 for chiagozie LLC (Montana LLC) d/b/a EZER. Resolve every `[DECISION:]` and `[NAME:]` before adoption. Sponsor banks almost always require **prior written approval** of all marketing that mentions the bank's products. This policy routes material to that approval.

# 08. Marketing and Communications Review

## 1. Scope

Anything a prospective or current customer can see that describes EZER's products: the app store listing, the website (`docs/index.html` on GitHub Pages), in-app copy and onboarding, push notifications, email, SMS, social posts (including AI-generated and UGC content queued through the content engine), influencer and affiliate posts, press releases, and support macros.

## 2. Process

1. The author submits the material with its channel, audience and claims, and evidence for each factual claim.
2. **Compliance review** by `[NAME: marketing compliance reviewer]` against the checklist in section 4.
3. **Bank approval** for anything that mentions the card, Pay-in-4, deposits, FDIC insurance, the bank's name, or rates or fees. `[DECISION: bank SLA and which categories it pre-approves]`
4. Record the approved version, approver, date, and channels. Re-review on any change and every year for evergreen material.
5. Pull material that is withdrawn or superseded from every channel within `[DECISION: 5 business days]`.

## 3. Applicable rules

| Rule | What it means for EZER |
|---|---|
| **UDAAP:** CFPA 12 U.S.C. 5531, 5536; FTC Act §5 (15 U.S.C. 45) | No claim that is false, or misleading by net impression. Disclaimers can't cure a misleading headline. "Abusive" includes taking unreasonable advantage of a consumer's lack of understanding. |
| **FDIC insurance misrepresentation:** 12 U.S.C. 1828(a)(4); 12 CFR Part 328 Subpart B | **EZER is not a bank and is not FDIC-insured.** Never say or imply that it is. Mention pass-through deposit insurance only if the account structure qualifies (12 CFR 330.5, 330.7 recordkeeping) and the bank approves. Say that insurance covers the failure of the **bank**, not of EZER. Follow the bank's guidance on the FDIC digital-sign rule for its products. |
| **Bank disclosure** | Standard line: "EZER is a financial technology company, not a bank. Banking services provided by `[NAME: Bank]`, Member FDIC. The EZER card is issued by `[NAME: Bank]` pursuant to a license from Mastercard." `[DECISION: bank and network to confirm exact text]` |
| **Reg Z advertising (12 CFR 1026.16 / 1026.24)** if Pay-in-4 is Reg Z credit | Trigger terms (payment amount, number of payments, finance charge) require additional disclosures. "0% interest" and "no fees" must be true in every case, including late fees. `[DECISION: late fee policy; the Highnote plan is set to no fee]` |
| **ECOA / Reg B (12 CFR 1002.4(b))** | No statements that would discourage applicants on a prohibited basis. Targeting must not exclude protected groups. |
| **Reg E / prepaid (12 CFR 1005.18)** | Fee claims must match the short-form disclosure. |
| **Reg DD (12 CFR 1030.8)** | Applies to the bank if deposit or "savings" accounts are advertised with rates. EZER's "savings goals" are **not** savings accounts unless they are. No "APY" or "interest" unless the bank offers it. |
| **FTC Endorsement Guides (16 CFR Part 255) and Consumer Reviews Rule (16 CFR Part 465)** | Disclose material connections with influencers clearly. No fake, AI-generated-as-real, or bought reviews. No suppressing negative reviews. AI-generated people in ads must not be presented as real customers. |
| **TCPA (47 U.S.C. 227) / CAN-SPAM (15 U.S.C. 7701 et seq.)** | Prior express written consent for marketing texts. Working unsubscribe link; honour opt-outs within 10 business days. |
| **GLBA / privacy.html §4** | No use of financial or email data for ad targeting. No selling or sharing for cross-context advertising. **Gmail data may never be used for advertising** (Google Limited Use). |
| **App store and card network rules** | Network brand standards for card images and marks. |

## 4. Reviewer checklist

- [ ] Every number is real and current, or clearly labelled as an example. **Onboarding figures are labelled EXAMPLE and must stay that way** (CLAUDE.md). The invented "★ 4.9", "$4.8M caught" and "$34 a month on average" were deliberately removed and must not reappear here, on `docs/index.html`, or in social content.
- [ ] Savings claims ("save $X") are framed as what the user *could* free up, not as a promise.
- [ ] No claims of "free", "no fees", "no credit check", "instant", "guaranteed approval" or "build credit" unless true for every user. KYC and Spending Power can deny or set $25 limits. Pay-in-4 is **not available yet** (`payin4.tsx` says so), so don't advertise it as live.
- [ ] Spending Power and limit copy matches `trustScoring.ts` behaviour: automatic decision, $25 floor, suspension after a missed installment. No "pre-approved" unless it is a firm offer of credit under FCRA.
- [ ] The bank disclosure is present wherever the card or bank products appear.
- [ ] No "bank", "banking", "account" or "FDIC" language implying EZER is the bank. State laws restrict use of "bank" in names and advertising for non-banks.
- [ ] Privacy and security claims match privacy.html exactly (for example, "your email is processed on your phone" is true only while the on-device scanning design holds).
- [ ] Subscription-cancellation claims are accurate. EZER helps users cancel; it doesn't guarantee a cancellation or refund.
- [ ] Testimonials are real, documented and typical, or carry a clear "results not typical" context. The influencer connection is disclosed.
- [ ] Accessibility, and any non-English versions, reviewed for equivalent disclosures.

## 5. In-product messaging

Product copy is marketing too. These screens need the same review before launch: Spending Power reveal/status copy, Card Studio "physical card" flows (don't imply a physical card ships before it does), decline and suspension messages (see 02 §6 for adverse-action content), and push notifications about renewals and trials.

# Mailbox scopes and data flow

For Google's restricted-scope verification and Microsoft publisher
verification. Keep in sync with `docs/privacy.html` §3 and
`apps/mobile/utils/inboxScan/`.

## Scopes requested

| Provider | Scope | When |
|---|---|---|
| Google | `https://www.googleapis.com/auth/gmail.readonly` | Only when the user taps **Connect** on Settings › Inbox. Never at sign-in (`utils/googleAuth.ts` asks only for openid/profile/email). |
| Microsoft | `Mail.Read` (Graph) | Same; one scan per consent, no `offline_access`. |

No send, modify, delete or settings scope is requested.

## Data flow

1. The user opens Settings › Inbox and sees what is read, that it is
   processed on the phone, and what is saved, with a link to the privacy
   policy. Nothing is requested until they tap Connect.
2. The phone gets an access token from Google (Google Sign-In SDK,
   incremental `addScopes`) or Microsoft (PKCE auth-code flow). The token
   stays on the device. Gmail's is held by the Google SDK; Outlook's lives
   in memory for one scan. Neither is ever sent to the EZER backend.
3. The phone queries the provider API directly, narrowed to the last 400 days
   (then incremental from the last scan) and to subjects mentioning receipt,
   invoice, subscription, trial, renewal, billing, plan or membership. At most
   300 messages per scan.
4. Each message is reduced on the device by `extractSubscription()` to:
   merchant, amountCents, currency, cadence, nextChargeDate, trialEndsAt,
   cancelUrl, confidence. The message text is held in a local variable for
   that one call and is never written to disk, logged or transmitted.
5. Only those derived fields (plus `source: gmail|outlook`) are POSTed to
   `POST /subscriptions/detected`, which validates them with
   `detectedSubscriptionSchema` and merges them into the user's
   subscriptions. The server never receives subjects, bodies, sender
   addresses, attachments, message IDs or tokens.
6. **Disconnect** revokes the Google token at
   `https://oauth2.googleapis.com/revoke`, calls `revokeAccess()`/`signOut()`,
   and clears the local scan cursor. Microsoft tokens are never stored.

## Limited Use

Gmail data is used only to show the user their own subscriptions and trials.
It is not used for ads, not sold, not read by people, and not used to train
AI/ML models. See `docs/privacy.html` §3.

## Rollout gate

`GET /inbox-scan/enabled` returns true only if `INBOX_SCAN_ENABLED=1`, or the
account email is in `INBOX_SCAN_ALLOWLIST`. Use the allowlist to match the
test users on the Google consent screen until verification is approved.

# EZER handoff — 2026-10-06

You are picking up a long session. Read this first, then CLAUDE.md (repo rules,
SpinCard rules, the migration rule). Memory note `highnote-sandbox.md` has every
Highnote ID.

## Where things are

- **The one real repo:** `E:\c-offload\New folder\ezer` (branch `main`, remote
  `CH6RIZARD/ezer`, in sync at handoff). All other local EZER copies were deleted
  on purpose. `C:\New folder\ezer` holds only `.claude` settings, and sessions
  start from there, so always work with absolute paths into the E: repo.
- **Leave alone:** every `ezer forex` / `ezer-morgan-futures` folder (a separate
  project), and `C:\the void\...` (a different app, unrelated to EZER).
- **Newest APK:** `E:\tmp\ezer-build-37386522539` (preview build, installed on
  the S22). The k62 was disconnected, so it still has an older build.
- **Scratch scripts:** `E:\tmp\claude\c--New-folder-ezer\73fc1941-...\scratchpad\`.
  `hn*.js` are the Highnote scripts; state is in `hn-state.json`.

## Phones / build / test

- S22 `R5CYA0GF6FP` (720x1560), passcode **64226**: enter it via UI taps
  6→(564,809) 4→(155,809) 2→(360,633) 2 6. Pay in 4 tab is at (273,1380).
  Package `com.ezersaves.app`. k62 `R5CY249SW4K`, passcode unknown.
- APK: `gh workflow run "EAS local Android build" --repo CH6RIZARD/ezer --ref main -f profile=preview`,
  then `gh run download <id> --dir E:\tmp\ezer-build-<id>`, rename `.aab`→`.apk`,
  then `adb install -r`. Takes about 16 min.
- Typecheck: `npx tsc --noEmit -p .` in `apps/mobile` and `apps/api`.
  Tests: `apps/api/node_modules/.bin/tsx --test <file>`. They live in
  `apps/api/src/services/*.test.ts` and `apps/mobile/utils/*.test.ts`.
- Set `TEMP=E:\tmp` (C: fills up). Screenshots: use bash `adb exec-out screencap -p > file`,
  because PowerShell redirection corrupts PNGs.
- Run Highnote scripts with `railway run --service ezer-api node <script>` from the
  repo. Never print `HIGHNOTE_API_KEY` or `HIGHNOTE_COLLAB_AUTH_SECRET`.

## What was done this session (all pushed)

1. **Card (SpinCard):** restored the approved 90687a9 design, made the gold edge
   solid with filled sheets, made the chip plain, and moved drag to the native
   RNGH PanGestureHandler. Earlier on-device checks: the edge is solid, the first
   drag stays in step, and the card follows the finger. Not yet checked on device
   after the RNGH change: first-touch response, vertical drag vs page scroll, tap
   to reveal, scrolling outside the card. Also not checked on device: the compact
   calendar amounts.
2. **Passcode (4–6 digits):** LockGate, set during onboarding, 60s grace, one
   EZER fade after unlock, no second flash. Verified on the S22.
3. **Data snapshot:** the app loads from the saved snapshot at launch instead of zeros.
4. **Calendar:** `formatCompactCents` ($1.3k etc.) so large amounts fit.
5. **Highnote Pay in 4 (TEST env), end to end:**
   - Product "ezer bnpl" (revolving credit) with plans; collaborative
     authorization is ENABLED on the product (the user turned it on in the dashboard).
   - `POST /webhooks/highnote/authorize` (`apps/api/src/routes/highnoteAuth.ts`):
     checks the HMAC (hex, comma list), returns 2xx for the activation ping, and
     rejects authorization requests older than 15 min. It approves only if
     amount ≤ Spending Power − (Highnote card usage + EZER installments owed).
     Card usage = ledger ACCOUNT_HOLDER_CREDIT_LIMIT − AVAILABLE_CREDIT (about 150ms).
     A slow or failed read declines.
   - Issuing: an approved Spending Power (or the first `GET /cards/highnote`)
     calls `issueTestCard` (`services/highnote.ts`), with a `pending:<userId>`
     claim on `User.highnoteCardId`.
   - The Pay in 4 tab shows the real card (last4, expiry, a TEST CARD badge) and
     the real schedule rings.
   - Verified live: the user's card ..7430 ($25 limit): $5 approved, $26 declined;
     a $20 purchase split into 4 × $5 shows on the S22. A repayment settled, and a
     missed (returned) payment was simulated.
6. **Smart saving on a subscription** now creates a real goal "<Merchant> savings"
   (FIXED/MONTHLY rule). The user asked to keep the ORIGINAL banner/option copy
   because they are redesigning the savings UI themselves, so don't touch that copy.
   `fixedPerPeriod` now converts per-cadence amounts to the weekly sweep (it had
   been saving 4x for monthly goals).
7. **Railway build fix:** `--prod=false` on install (NODE_ENV=production was
   skipping prisma and typescript).

## Next, in priority order

1. Reinstall the newest APK on the k62 when it's plugged in. Verify on device the
   RNGH card drag and the compact calendar.
2. Savings is NOT live: nothing schedules `POST /savings/sweep/run`, and its
   processor is a stub. Before scheduling it, ask the user how money should move.
   Options discussed: a Highnote Prepaid/GPR product (no interest), Increase
   (account number per goal), Dwolla/Plaid Transfer (user's own checking →
   savings; easiest approval). Don't schedule a sweep against the stub.
3. The Highnote installment snapshot never showed the settled $5 as a paid
   installment. Re-check after the BIWEEKLY cycle closes. Due dates in the app
   are derived (start + 14d·i), not taken from Highnote.
4. Highnote card limit is set once at issuance and never re-synced if Spending
   Power changes. The auth endpoint enforces it anyway, but syncing would be cleaner.
5. Going live with Highnote needs Highnote's approval, a bank partner, and real
   KYC fields in the app (issuance currently uses sandbox placeholder PII).

## Be wary

- **Migrations:** never `prisma migrate deploy` (the DB was never baselined; it
  replays 0_init and fails). Apply each SQL file with `prisma db execute`, and do
  it BEFORE pushing code that reads the new column (Prisma selects every column,
  so a missing one breaks all User queries). Writing to the prod DB needs the
  user's own approval; the permission system blocks it otherwise.
- **Deploys:** Railway waits on GitHub checks (a queued Pages build stalls it).
  Watch `railway deployment list --service ezer-api`. Prod logs only show
  `error` level.
- **Highnote quirks:**
  - Page size max is about 20.
  - Purchases must be GOODS_AND_SERVICES.
  - The credit-limit update is ASYNC (minutes); don't conclude it failed from
    an immediate read.
  - simulate* status mutations take the `eftet_` transfer id, not `st_`/`se_`.
  - Return reason codes are enums (e.g. INSUFFICIENT_FUNDS_IN_EXTERNAL_ACCOUNT).
  - merchantDetails uses `category`, not `categoryCode`.
- **SpinCard:** RN 0.81 has no translateZ and Android doesn't anti-alias 3D
  views. Walls/rings failed before; read CLAUDE.md's SpinCard section before
  touching it. Don't start the dev web server with `CI=1` (it kills file watching).
- **Commits:** commit messages via `git commit -F` (quotes break native args).
  Commit messages end with the Co-Authored-By / Claude-Session lines from the
  system reminder.
- **The user** types fast with typos; read for intent. They prefer action over
  questions, but approvals for destructive or prod actions must come from them,
  and the permission classifier will block mass deletes and prod DB writes.
  Copy they're redesigning (savings) is theirs: change logic, not wording.

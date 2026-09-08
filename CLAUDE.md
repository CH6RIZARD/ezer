# EZER — working notes for agents

Read this before editing. It records decisions that are load-bearing for
compliance or that cost real money to get wrong, and it exists because this
repo is edited from two places that drift apart.

## GitHub is the source of truth. Your local copy probably is not.

This project is edited BOTH locally on the operator's machine AND by remote
Claude sessions that clone fresh and push branches. The two diverge, and the
divergence is not theoretical:

- `CH6RIZARD/all-projects` contains an `ezer/` subtree that is a STALE SNAPSHOT
  of this repo. It predates the real OAuth work — in that copy every provider
  button posts to `/simulator/dev-login`, which `apps/api/src/index.ts`
  deliberately does not register in production. Do not treat it as current, and
  do not sync from it into this repo without reading the diff first.
- Commits here arrive on `claude/*` branches, not on `main`. Work that looks
  missing locally may simply be unmerged.

**Before you change anything:** `git fetch origin && git log --oneline origin/main -5`
and check for unmerged `claude/*` branches. Before you push, rebase or merge —
never force-push over someone else's commits.

**Before you finish:** if you made a decision a future agent could unknowingly
undo, add it to this file. That is what this file is for.

## Compliance-critical — do not "clean up" these

These exist because Plaid's production review, Apple, the GDPR and the CCPA
each require them. Removing one silently is a regulatory problem, not a code
style problem.

- **`DELETE /account`** (`apps/api/src/routes/account.ts`) — revokes every Plaid
  Item upstream via `/item/remove` BEFORE deleting local rows. The ordering is
  the point: deleting first destroys the access tokens, leaving an item that is
  still connected to the user's bank, still billing us monthly, and no longer
  addressable. Never reorder this.
- **`GET /account/export`** — the access/portability half of the same right.
  It strips `passwordHash`; keep it stripped.
- **`User.consentedAt` / `User.consentVersion`** — a consent checkbox that
  stores nothing proves nothing when a regulator asks. Both signup paths write
  these: email (`routes/auth.ts`) and social (`utils/oauthUser.ts`). The social
  path previously recorded no consent at all. Both columns are NULLABLE on
  purpose — accounts created before the migration genuinely have no consent
  record, and backfilling a timestamp would fabricate evidence.
- **`CONSENT_VERSION`** lives in `apps/api/src/utils/consent.ts`, not beside the
  signup handler, because `routes/auth.ts` imports from `utils/oauthUser.ts` and
  importing back would close a CommonJS require cycle. Bump it whenever the
  Terms or Privacy Policy change materially.
- **`docs/privacy.html` and `docs/data-retention-policy.html`** are the published
  legal documents, served via GitHub Pages and submitted to Plaid. They describe
  what the code actually does. **If you change deletion, retention, consent, or
  which third parties receive data, update these in the same commit.** A policy
  that promises behaviour the code does not implement is a misrepresentation.

## Things that already broke once

- **`EXPO_PUBLIC_API_URL` is inlined at build time** and is only set in the `env`
  block of each `eas.json` profile, which ONLY EAS Build reads. Any other build
  (`expo export -p web`, a host's build step) carries no API URL. `utils/api.ts`
  therefore falls back to the deployed API for non-`__DEV__` bundles rather than
  to `127.0.0.1`, which on a deployed site is the visitor's own machine and is
  blocked as mixed content anyway.
- **`/health` does not touch the database.** Railway reports the service green
  while every query fails — which is exactly what happened when the Supabase
  project auto-paused after 7 idle days on the free tier. If logins fail with
  server errors, check whether Supabase is paused before debugging code.
- **Passwords are bcrypt.** Typing a plaintext password into the `passwordHash`
  column via the Supabase table editor produces a login that can never succeed:
  `bcrypt.compare(x, x)` is false. This happened. Use `/auth/signup` or write a
  generated hash.
- **The email unique index is case-sensitive.** `routes/auth.ts` lowercases and
  trims on both signup and login; anything that writes a `User` row directly
  must do the same or the account becomes unreachable.
- **Migrations do not run on deploy.** `railway.json` runs `prisma generate`
  only — `migrate deploy` needs a session-mode connection (port 5432), not the
  transaction pooler. Apply migrations manually. `20260907000000_add_consent_record`
  is pending as of this writing.

## Secrets

`env.ts` refuses to boot in production without `JWT_SECRET`, `ENCRYPTION_KEY`
and `DATABASE_URL`. That is deliberate — both secrets previously fell back to
development defaults committed to this repo. Do not reintroduce a fallback.
`DEV_OAUTH_BYPASS` must never be set in production; it is a login bypass.

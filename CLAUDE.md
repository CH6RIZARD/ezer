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
- **`apps/mobile/app.config.js` overrides `app.json`.** Expo loads the JS config
  when both exist. It spreads `app.json`'s `expo` block for the static fields,
  then REPLACES `plugins` wholesale — so build properties written into
  `app.json` are read by nothing. `targetSdkVersion: 36` sat in `app.json` for a
  full build cycle while Play kept rejecting the bundle for targeting API 35.
  `app.json` no longer declares `plugins` at all; change `expo-build-properties`
  in `app.config.js`. The same trap applies to `react-native-purchases`, which
  `app.config.js` deliberately omits because it ships no config plugin.
- **`packageManager` must stay at `pnpm@9.x` or later.** Pinned at `8.15.0`,
  Railway's Nixpacks builder (on its current `nodejs_24` base image) produced
  `prisma generate` binaries with the execute bit missing —
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL ... spawn prisma EACCES` — and every
  deploy failed at the build step. `apps/mobile`'s EAS builds already pinned
  `pnpm@9.15.0` with no such issue; matching that at the repo root fixed it.
  The lockfile (`lockfileVersion: '6.0'`) is unaffected — pnpm 9 reads it fine.
- **Migrations do not run on deploy.** `railway.json` runs `prisma generate`
  only — `migrate deploy` needs a session-mode connection (port 5432), not the
  transaction pooler. Apply migrations manually.
  `20260907000000_add_consent_record` and `20260908000000_add_card_designer`
  HAVE both been applied to the live Supabase database; future migrations still
  need running by hand.

## Card Studio

- **`CardFrontFace`/`CardBackFace`, exported from `components/redesign/CardCanvas.tsx`,
  are the ONLY place the physical card's locked layout is drawn** — front is
  the chip only, no wording (the contactless mark that used to sit next to it
  was removed on request); identifying details (name, masked number, CVV,
  expiry) are on the back. `PhysicalCardReview.tsx` renders a finished design
  with these same two components rather than reimplementing
  the layout, specifically so the two screens that show a design cannot drift
  apart the way the front once silently grew cardholder/number text back onto
  it. Add card visuals here, not in a screen file.
- **Card Studio's "Continue" branches on whether a `CardAccessOutcome` already
  exists** (`utils/cardDesignStore.ts`): first time through a saved design
  goes to `PhysicalCardApproval`; re-editing an already-approved design (via
  `PhysicalCardReview`'s "Edit design") goes straight back to
  `PhysicalCardReview` instead of re-running connect-bank-or-skip on someone
  who already chose. Home's card tile makes the same check
  (`useCardFlowStatus`) to decide whether tapping it opens the raw designer or
  the finished-design review. Losing either branch reopens the blank canvas on
  someone who already finished the flow — the exact complaint this fixed.
- **Line weight is a continuous 1.5–11 drag** (`LineWeightSlider` in
  `app/screens/PhysicalCard.tsx`, labelled "Line weight" on screen — not
  "Nib", which read as jargon), not the design comp's 5 fixed stops. Both were
  deliberate departures from the comp, asked for directly. Don't "restore" the
  comp's 5-button version or the "Nib" label thinking either is a bug fix.
- **`components/redesign/SpinCard.tsx` throttles drag-move handling to one
  update per animation frame** (`scheduleMove`/`flushMove`). This exists for
  the web export specifically: a mouse fires far more `pointermove` events per
  second than a touchscreen does, and without the throttle the card would
  visibly hang right at release while the main thread — the only thread RN Web
  has — worked through however many queued moves had piled up during the
  drag. Removing the throttle to "simplify" reintroduces that hang on web; it
  is a no-op on native, where the native driver already ran at display rate.
- **The Pay in 4 card's free-drag spin physics live in
  `components/redesign/SpinCard.tsx`**, not in `VirtualCard.tsx` — extracted
  so `PhysicalCardReview.tsx`'s finished-design preview gets the exact same
  interaction (idle float, drag-rotate, half-turn settle) instead of a second
  hand-copied implementation. Edit the physics there; `VirtualCard.tsx` and
  `PhysicalCardReview.tsx` should only ever supply front/back content to it.

## Routing and the app's front door

- **`app/onboarding.tsx` is the entry point for signed-out users**, not
  `app/index.tsx`. The flow ends in its own Apple / Google / email step, so
  `index.tsx` is a pure gate that redirects into it; restoring provider buttons
  there gives you two competing sign-in surfaces behind one tap. `index.tsx`
  still owns the authenticated redirects, and onboarding skips its auth step
  when `isAuthenticated` is already true.
- **The onboarding reads `darkTokens` directly, not `useTheme().colors`.** The
  flow is a committed dark design; the light palette washes out the gold and
  coral that carry the meaning (a trial about to convert, money leaving).
- **`inset: 0` is not implemented in React Native.** It is dropped silently, so
  an absolutely positioned box written that way has no dimensions. Use
  top/left/right/bottom.
- **Figures in onboarding are labelled EXAMPLE on screen and must stay that
  way.** They illustrate the product; they are not a claim about a user's
  account. The invented "★ 4.9", "$4.8M caught" and "$34 a month on average"
  from the design handoff are deliberately NOT in the build — there are no
  members to average and no store rating to quote. Do not reinstate them here
  or in `docs/index.html`.
- **`utils/demoData.ts` is deleted and must not come back.** It shipped 508
  lines of invented merchants into release bundles, which is how the Wallet
  once listed subscriptions for a user with no bank connected. Everything
  charge-shaped comes from the API; `DataContext` deliberately shows nothing
  rather than substituting on a failed call.

## Secrets

`env.ts` refuses to boot in production without `JWT_SECRET`, `ENCRYPTION_KEY`
and `DATABASE_URL`. That is deliberate — both secrets previously fell back to
development defaults committed to this repo. Do not reintroduce a fallback.
`DEV_OAUTH_BYPASS` must never be set in production; it is a login bypass.

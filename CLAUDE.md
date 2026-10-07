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
  The lockfile is pnpm 9's `lockfileVersion: '9.0'` since expo-haptics was
  added (it was '6.0' before; pnpm 9 rewrote it). Add dependencies with
  `pnpm@9.15.0`, not a newer local pnpm, so the format stays what CI reads.
- **Wallet range presets end at 23:59:59.999 LOCAL, and the per-range
  breakdown cache keys on calendar days** (`presetRange` in
  `utils/chargeOccurrences.ts`, `keyFor` in `app/(tabs)/wallet.tsx`). The
  API filters `date <= endDate` on a DateTime, so a preset ending at the last
  day's 00:00 drops that day for anyone east of UTC — and "ytd" once ended at
  `new Date()`, millisecond precision, which made its cache key different on
  every computation: the prefetch warmed a key no tap ever asked for, so YTD
  was a round trip every time while the other presets were instant. A cache
  hit younger than `BREAKDOWN_FRESH_MS` is also NOT re-fetched behind the
  tap; the re-fetch handed the list an identical second set of rows a few
  hundred ms later, one more full re-render, which on a slow phone was the
  lag the cache was meant to remove. The chip row is a horizontal ScrollView
  whose chips never shrink (`flexShrink: 0`) — four equal-width chips and
  then four shrinkable ones both clipped "This month"/"Last month" on a 360dp
  phone with a larger system font. Don't put them back in a fixed row.
- **The build needs devDependencies** (prisma CLI, typescript). Railway's
  `NODE_ENV=production` makes `pnpm install` skip them, which shows up as
  "spawn prisma EACCES". That's why `railway.json`'s buildCommand installs
  with `--prod=false`. Keep it, and keep `NODE_ENV=production` for runtime.
- **Migrations do not run on deploy.** `railway.json` runs `prisma generate`
  only — `migrate deploy` needs a session-mode connection (port 5432), not the
  transaction pooler. Apply migrations manually.
  `20260907000000_add_consent_record` and `20260908000000_add_card_designer`
  HAVE both been applied to the live Supabase database; future migrations still
  need running by hand. `20260930020000_add_installment_engine` (the Pay in 4
  installment engine: `InstallmentPlan`/`Installment`,
  `FundingSource.purpose`/`Transfer.installmentId`) HAS been applied — the
  `POST /cards/installments/sweep` endpoint returned a real 200 after, not
  the P2021/P2022 "table/column does not exist" errors it threw before.
  `20260930030000_add_linked_banks_model` (`User.payIn4InstrumentId`,
  `PlaidItem.readForSubscriptions`, `FundingInstrument.subtype`/`itemId`) HAS
  been applied. `20261005000000_add_highnote_card_id` (`User.highnoteCardId`)
  HAS been applied. Apply each one with `railway run --service ezer-api npx
  prisma db execute --schema prisma\schema.prisma --file <migration.sql>` from
  `packages/db`. NEVER `migrate deploy`: this DB was never baselined, so it
  replays `0_init` and fails on "type already exists".

## Card Studio

- **`CardFrontFace`/`CardBackFace`, exported from `components/redesign/CardCanvas.tsx`,
  are the ONLY place the physical card's locked layout is drawn** — front is
  the chip only, no wording (the contactless mark that used to sit next to it
  was removed on request — and NO card anywhere in the app shows a
  contactless/NFC mark: VirtualCard, the Saved tab card, CreditCard and the
  Home tile's NfcTapIcon animation were all stripped of it on request too.
  Don't add one back); identifying details (name, masked number, CVV,
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
- **Never `addListener` on SpinCard's Animated values (`rx`, `ry`, `float`).**
  They are `useNativeDriver: true`, and a JS listener on a native-driven value
  forces every animation frame back across the bridge to JS. The idle float
  loops from mount on a tab that stays mounted, so three such listeners kept
  the JS thread busy ~60×/sec from app launch on every screen — measured as
  "high input latency" on 65–84% of frames app-wide (`dumpsys gfxinfo`). It
  read as "the whole app is laggy." The plain-number mirrors `rxVal`/`ryVal`
  are written where THIS code sets the values (`applyMove`, the release snap),
  and `freezeFloat` reads the float through `stopAnimation`'s callback. If you
  need the current value of one of these, use `stopAnimation(cb)`, not a
  listener. Related: `app/(tabs)/_layout.tsx` sets `freezeOnBlur: true` so a
  blurred tab's subtree stops rendering at all — don't remove it to "fix" a
  stale-looking tab; use `useFocusEffect` on that screen instead (Wallet
  already does, for its carousel position).
- **SpinCard's gold side is the design the owner approved on the dev page
  (commit 90687a9, re-confirmed Oct 4 2026): seven FULL-SIZE gold sheets
  (`SIDE_DEPTHS`) between faces at ±3 (`FACE_DEPTH`), all faded in together
  by |sin rx|+|sin ry| (0 below ~6°, full by ~17°). Do not redesign it.**
  A flat single core between the faces reads as two unconnected sheets
  edge-on, which is why the stack exists. The stack is planes parallel to
  the faces, so in the last few degrees before edge-on every sheet is a
  hairline, and Android (no anti-aliasing on 3D-transformed views) drew
  seven separate stripes with see-through gaps and prongs at the ends.
  So the stack is DENSE: 23 sheets 0.25px apart (`SIDE_STEP`), under a
  device pixel, so the hairlines overlap into one band. Each sheet is FILLED
  (plain colour, no gradient): rings with an empty middle, to save overdraw,
  showed the page through the band just short of edge-on, where the line of
  sight runs through the card's interior (k62). Only every third sheet (the
  old 7) draws at ordinary tilts; the other 16 fade in past ~65°, where a
  sheet's cost (its projected area) is small: all 23 at every angle made the
  spin janky (S22 gfxinfo: 83% of frames over budget). Perpendicular side walls
  placed by projection maths were tried and missed on Android (its camera
  projection does not match a computed placement) — don't retry them.
  With 25 layers a card, headless Edge drops whole faces once a harness page
  holds 16 cards; render `v=dev` four angles at a time. Two later redesigns (per-axis
  stacks with insets, 3px thickness) were judged against a STALE dev page
  and rejected once the APK showed them: the APK must match this design.
  **The dev server must not be started with `CI=1`**: CI mode turns off
  Metro's file watching, so the page keeps serving the code from launch;
  that is how the dev page and the APK drifted apart for a whole day.
  **Check any change by rendering it:** `scripts/spincard-edge-render.html
  ?v=dev&mode=web` (or `mode=native`) in headless Edge with `--screenshot`
  draws this layer stack at a grid of angles, both render paths. RN 0.81 has
  no `translateZ` natively (Android `TransformHelper.kt` and iOS
  `RCTConvert+Transform.m` skip it), so `withDepth`/`at` in SpinCard fakes
  depth k as a screen-space shift of (k·sin ry, −k·sin rx·cos ry) placed
  before the rotations, built from `Animated.modulo`/`interpolate`/`multiply`
  so it stays on the native driver. `translate: [0, 0, k]` is NOT usable —
  the native driver only takes numeric transform values.
- **On native, SpinCard's drag must run no React work at touch-down.** Page
  scroll is blocked by gesture-handler exclusivity: `payin4.tsx` and
  `PhysicalCardReview.tsx` use RNGH's `ScrollView`, and the card's pan
  (minDist 2) activates first and cancels it. The native handler does NOT
  call `onDragChange`; it used to, and the parent's `setState` re-rendered
  the whole screen on Android's UI thread right as the finger moved, giving
  an initial lag on every drag that the web dev page never showed.
  `onDragChange` + `scrollEnabled` remain for the web (PanResponder) path only.
- **The Pay in 4 card's free-drag spin physics live in
  `components/redesign/SpinCard.tsx`**, not in `VirtualCard.tsx` — extracted
  so `PhysicalCardReview.tsx`'s finished-design preview gets the exact same
  interaction (idle float, drag-rotate, half-turn settle) instead of a second
  hand-copied implementation. Edit the physics there; `VirtualCard.tsx` and
  `PhysicalCardReview.tsx` should only ever supply front/back content to it.

## Spending Power / Pay in 4 underwriting

- **There is no manual-review state.** There used to be one — any trust score
  under 20, or a bank Plaid couldn't read signals from yet, produced
  `status: 'manual_review'`, and nothing anywhere in this codebase ever read
  that status back out: no admin tool, no queue, no cron. It was a permanent
  dead end presented to the user as "we'll get back to you." `limitForScore`
  (`apps/api/src/services/trustScoring.ts`) has no zero band from score alone
  — the floor is a real $25, not a decline, matching how
  Klarna/Affirm/Cash App Borrow/Zip actually underwrite (automatic, generous
  at the start, nothing held for a human). Do not reintroduce a review state
  without also building something that resolves it. `'suspended'` (below) is
  not that review state — it always resolves itself the moment the missed
  installment is cured.
- **The scoring logic lives in `apps/api/src/services/trustScoring.ts`**, not
  in `routes/cards.ts` — it moved out so
  `services/installmentEngine.ts` could call the exact same `assessAccess()`
  a missed-payment event needs to re-score against, without either file
  importing the other's route module (the same CommonJS-cycle reason
  `CONSENT_VERSION` lives in `utils/consent.ts` instead of `routes/auth.ts`).
  `routes/cards.ts`'s `POST /access-list` is now a thin wrapper: derive
  signals via `assessAccess`, write the `CardAccessList` row.
- **The model is "generous start, tighten on failure," and BOTH halves are
  now implemented.** Generous: `limitForScore`'s real $25 floor from score
  alone. Tighten: an uncured `MISSED` Pay in 4 installment
  (`InstallmentPlan`/`Installment` tables) forces `limitForScore` to return 0
  and the status to `'suspended'` — regardless of score — the instant
  `services/installmentEngine.ts`'s `onInstallmentTransferEvent` sees a
  `returned` debit, not on the user's next Spending Power check. A cured miss
  lifts the suspension but keeps scoring as a heavy, lingering penalty in
  `scoreTrust` (`missedInstallmentsLast12mo`, bigger than the overdraft
  penalty) for 12 months — the same way a real BNPL provider's risk model
  keeps scoring a cured late payment after it's resolved.
- **No real purchase flow or processor calls this yet.** Pay in 4 checkout
  itself still doesn't exist (`payin4.tsx` still says "not yet available"),
  and there is no BIN sponsor/ACH processor contracted — `FundingSource` (the
  model this engine debits from) has never had a row created anywhere in this
  codebase; `FundingSource.processorToken` stays null the same way
  `services/savingsEngine.ts`'s own dormant sweep scaffolding does. The engine
  was built anyway so the SCORING side has something real to react to right
  now, and so wiring a real purchase flow later is only: call
  `createPlan(userId, totalCents)` from checkout, and point a real scheduler
  at `POST /cards/installments/sweep` (see below) instead of whatever manually
  triggers it today. Do not invent a second scoring path when that day comes —
  extend `trustScoring.ts`.
- **`POST /cards/installments/sweep` is secret-gated, not JWT-auth'd**, the
  same pattern as `/webhooks/processor/transfers`: it originates real debits
  once a processor exists, for every user at once, so a user's own token must
  never be enough to call it. Gated on `INSTALLMENT_SWEEP_SECRET` (header
  `x-sweep-secret`), which fails CLOSED when unset — same reasoning as
  `PROCESSOR_WEBHOOK_SECRET`. There is no cron inside this process (see
  "Migrations do not run on deploy" above — this app has never had one); an
  external scheduler must call this route, the same way migrations are
  applied by hand today.
- **`components/redesign/SpendingPowerSheet.tsx` is the ONLY entry point**
  for checking or joining Pay in 4 early access — a bottom sheet over the Pay
  in 4 tab, not a standalone screen. `app/screens/SpendingPower.tsx` (this
  session's earlier, full-screen version) is DELETED; do not recreate it.
  Home's Spending Power tile opens it via
  `router.push({ pathname: '/(tabs)/payin4', params: { sheet: 'spending' } })`
  — `payin4.tsx` watches `params.sheet === 'spending'` (guarded by a ref so
  it only fires once per param value) and opens the sheet itself, rather than
  the tile pushing a route that doesn't exist. The Pay in 4 tab's own CTA
  opens the same sheet directly (`openSheet(viaJoin)`) without any navigation
  at all. It used to route through Card Studio (`PhysicalCardApproval.tsx`),
  then through a dedicated full screen — see `PATCH-NOTES-early-access-sheet.md`
  if it resurfaces; `POST /cards/access-list` always accepted `designId: null`,
  so neither coupling was ever a backend requirement. Card Studio's own
  qualify-after-design step (`PhysicalCardApproval.tsx`, reached from
  `PhysicalCard.tsx`'s "Continue") is unchanged and still exists for people
  actually designing a card.
- **The sheet has four phases — `ask` → `assessing` → `reveal` → `status`**
  — and `reveal` (the large serif $ number) is tracked SEPARATELY from the
  underwriting outcome, via `getSpendingPowerRevealSeen`/
  `markSpendingPowerRevealSeen` in `utils/cardDesignStore.ts` (its own
  AsyncStorage key, `@ezer_spending_power_reveal_seen`). It is a one-time
  animation beat, not underwriting state — re-checking a limit that hasn't
  changed must go straight to `status`, not replay the reveal. `ask` itself
  renders two ways from one phase: `justJoined` (true only when this exact
  sheet-open just POSTed the waitlist join) adds the checkmark/"you're on the
  list" preamble; `joined` (true whenever ANY outcome already exists) does
  not by itself change `ask`'s copy — it only decides whether a fresh open
  lands on `ask` at all versus `status`. `'suspended'` (an uncured missed Pay
  in 4 payment, see the installment engine below) isn't in the original mock
  and is folded into `status` with its own copy rather than a fifth phase.
- **The sheet caches its outcome under its OWN AsyncStorage key**
  (`getSpendingPowerOutcome`/`saveSpendingPowerOutcome` in
  `utils/cardDesignStore.ts`), separate from Card Studio's design-record
  `.access` field. Reusing the design record would mean a Spending Power
  re-check with no saved card design either silently drops (the old
  `saveCardAccessOutcome` no-ops without a record) or forces inventing an
  empty placeholder design, which `PhysicalCardReview.tsx` would then render
  as "your design" — the exact regression `mirrorServerAccessOutcome`'s own
  comment exists to prevent. The sheet also best-effort mirrors onto the
  design record (`mirrorServerAccessOutcome`) so Home's "Get your physical
  card" tile (`useCardFlowStatus`, which still reads only the design record)
  doesn't show a stale outcome for someone who has a saved design AND just
  re-checked Spending Power.
- **`FundingInstrument.purpose` and `FundingSource.purpose`** are UI/engine
  grouping labels only, set to `'pay_in_4'` ONLY when "Connect a new bank" is
  used (see Patch 2 below) — threaded through `usePlaid().openPlaidLink`'s
  third argument → `POST /plaid/exchange-public-token`. A `pay_in_4`-tagged
  bank ALSO defaults `PlaidItem.readForSubscriptions` to `false` at link time
  (Patch 3's model, below) — someone connecting a separate bank specifically
  for Pay in 4 does not want it silently feeding subscription detection too.
  `installmentEngine.ts`'s `getRepaymentSource` prefers a `purpose`-tagged
  `FundingSource` when charging. Every linked account is STILL read
  identically for trust-score signals regardless of `purpose` or
  `readForSubscriptions` — see the next point for the one real exception
  (which account balance gets ASSESSED for Pay in 4, not which accounts count
  at all).
- **Patch 2 (PATCH-NOTES-early-access-sheet.md): the primary pill offers "Use
  connected bank" instead of forcing a second Plaid Link.** Someone whose
  subscriptions are already being read from a linked account must not be made
  to link a SEPARATE bank just to see a Pay in 4 number —
  `SpendingPowerSheet.tsx` checks `instruments.length > 0 || subscriptions.length > 0`
  (`contexts/DataContext.tsx`) and, if true, a first tap reveals "Use
  connected bank" (runs the real assessment immediately, no Plaid Link)
  alongside "Connect a new bank" (the `pay_in_4`-tagged Plaid Link flow, for a
  deliberately separate bank). No bank linked at all skips straight to
  "Connect a new bank" — nothing to choose between.
- **Patch 3 (same file, "Patch 3 — Settings › Linked banks"): Pay in 4 has
  exactly ONE real funding account, not an aggregate of every linked bank.**
  `User.payIn4InstrumentId` (a `FundingInstrument.id`) is that account.
  `trustScoring.ts`'s `resolvePayIn4Instrument` reads it, and — this is the
  part that makes "Use connected bank" above keep working without forcing
  everyone through Settings first — AUTO-PICKS and PERSISTS the oldest
  eligible (non-credit, `type === 'bank'`) linked account the first time
  nothing is chosen yet. `derivePlaidSignals`'s BALANCE signal is scoped to
  just that one account's Plaid `account_id` when one is resolved. The
  inflow/overdraft signals are **NOT** scoped — `Transaction` rows carry no
  per-account attribution in this schema (only `FundingInstrument.
  plaidAccountId` does), so scoping those would need a real schema change;
  documented as a known limitation in `derivePlaidSignals`'s own comment
  rather than silently wrong. Don't "fix" this by guessing at
  `rawData`-based JSON matching without reading that comment first.
  - **Settings' "Linked banks" is now real per-account UI**, not the old
    `purpose`-based two-bucket list: `GET /plaid/linked-banks`
    (`routes/plaid.ts`) returns banks grouped by `PlaidItem`, each with its
    accounts and which one (if any) funds Pay in 4 — `app/settings.tsx`'s
    "Pay in 4 pays from" card, `app/screens/BankDetail.tsx` (one bank:
    accounts, the subscriptions-read switch, disconnect), and
    `components/redesign/PayIn4AccountPicker.tsx` (the account-picker
    sheet) all read this shape directly rather than inferring anything.
  - **`POST /cards/pay-in4-account`** is the only deliberate way to change
    the funding account — sets `payIn4InstrumentId` AND immediately re-runs
    `assessAccess`, writing a fresh `CardAccessList` row, so the picker's
    "re-checks your spending power" copy is literally true, not aspirational.
  - **`DELETE /plaid/items/:id`** disconnects ONE bank (Plaid `itemRemove`
    FIRST, same ordering rule as `DELETE /account` and for the same reason),
    cascade-deletes its `FundingInstrument` rows via the `itemId` FK, and
    clears `payIn4InstrumentId` ONLY if that bank actually held it.
  - **`POST /plaid/items/:id/read-for-subscriptions`** is the per-bank switch
    on `BankDetail.tsx`. Turning off does not delete existing `Subscription`
    rows from that bank — they age out through the normal renewal-date flow,
    same as a bank that stops billing for any other reason. Turning on
    triggers a real sync for just that item.
  - **`app/settings/connected-accounts.tsx` is DELETED.** It was a fully
    unreachable pre-Plaid screen with hardcoded fake accounts ("Chase
    Checking •4532") — nothing in the app ever routed to it, but it sat there
    as a landmine for exactly the confusion it was built to avoid. Do not
    recreate a "connected accounts" screen separate from the ones above.

## Inbox scanning (`apps/mobile/utils/inboxScan/`, `SCOPES.md`)

- **Email is read ON THE PHONE, never on the server.** The app fetches
  Gmail/Outlook directly, `extractSubscription()` reduces each message to
  merchant/amount/cadence/dates/cancel link, and only those fields go to
  `POST /subscriptions/detected` (`apps/api/src/routes/inbox.ts`). Tokens stay
  on the device. This is the whole argument for Google's restricted-scope
  review skipping the paid CASA audit ("restricted data is not stored or
  transmitted server-side"), and `docs/privacy.html` §3 promises it. Don't
  add a server-side Gmail pull, a body/subject field to
  `detectedSubscriptionSchema`, or token upload without redoing both. The old
  server-side stubs in `routes/connect.ts`/`routes/ingest.ts` predate this and
  are not the path.
- **Detected records merge into the existing Merchant/Subscription/
  PriceHistory/Trial rows**, matched on `normalizeMerchantName`, the same key
  Plaid sync uses. No new table, so no migration. Email only FILLS gaps and
  never overwrites Plaid-derived values. Trials land in `Trial`, so /risks and
  the Alerts tab show them with no extra wiring.
- **Gated by the server** (`INBOX_SCAN_ENABLED=1`, or `INBOX_SCAN_ALLOWLIST` of
  emails) until Google approves `gmail.readonly`. Unverified apps only work
  for consent-screen test users anyway. The Settings row is hidden when off.
- Tests: `node --test apps/mobile/utils/inboxScan/extract.test.ts` (Node's
  native TS, hence the `.ts` import extension). Not yet built: background
  scans (no `expo-background-fetch`) and local trial push notifications (no
  `expo-notifications`). Both need a new native dependency and a lockfile change.

## Wallet card art (`apps/mobile/utils/cardArt/`)

- **No data source returns what a linked card physically looks like.** Plaid,
  MX, Finicity, Yodlee, Teller and Akoya return at most an institution logo,
  a brand colour and a product name — never card art, and never the card
  number. The only licensed source of real card art is a Visa/Mastercard
  **network token**, which needs the full card number, so it is only ever
  possible for a card the user enters in full (e.g. the BNPL repayment card),
  never an aggregator-linked one. `FundingInstrument.networkTokenArtUri` is
  RESERVED for that and nothing populates it yet.
- **`resolveCardArt()` is the single place that decides a card's look**, first
  hit wins: user photo → design the user picked → network-token art → catalog
  design for the matched bank → bank colour + logo template. Explicit user
  choices deliberately outrank automatic sources. Catalog designs are re-tinted
  with Plaid's real `primary_color` when we have it (our catalog hues are only
  fallbacks), and a product name like "Platinum"/"Gold"/"Reserve" switches the
  card to a silver/gold/dark finish (`finishFor`, whole-word match). `BankCardFace` draws every
  tier; don't reintroduce a second inline card in `wallet.tsx`.
- **Do not add scraped or copied issuer card art** (PNC's marketing PNGs and the
  like) to the catalog. It is copyrighted, carries trademarks and third-party
  marks (teams, universities), and is a legal risk in a shipped consumer
  fintech app. The catalog is EZER's own renderings in approximate brand
  colours; replace an issuer's designs only with assets a bank has licensed.
- **Network art display rules are load-bearing** (Visa/Mastercard): the
  `network_token` tier shows the art untouched with only last-4 at bottom-left
  ("Visa 4865") — no subs pill or other overlay. Don't add any.
- **Card photos never leave the device** (`prefs.ts`, AsyncStorage, one key per
  card) and are wiped by `AuthContext.logout()`, which account deletion also
  goes through. `docs/privacy.html` says so; if photos ever get uploaded or
  synced, that document must change in the same commit. The stored file is not
  redacted (the number band is only covered when drawn) — burning redaction in
  needs `expo-image-manipulator` or a view-shot dependency; it was left out
  to avoid a lockfile rewrite (that rewrite has since happened for
  expo-haptics, so it is no longer a blocker).
- **`utils/cardArt/resolver.test.ts` uses Node's runner**, not Jest (the mobile
  app has none): `pnpm --filter @ezer/mobile exec npx tsx --test utils/cardArt/resolver.test.ts`.
  It is excluded from `tsc` in `apps/mobile/tsconfig.json`.
- Bank-name matching is whole-word on purpose ("Citizens" must not match "citi",
  and "First Citizens" is its own issuer). Add issuers in `catalog.ts`; the
  test checks every alias resolves to its own issuer.

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
- **There are three theme modes, not two: `'light' | 'dark' | 'black'`**
  (`utils/ThemeContext.tsx`, `ThemeMode`). `'black'` is the true-black
  AMOLED variant (`blackTokens` in `theme/tokens.ts` — only the surfaces
  differ from `darkTokens`; text/accent/gold are shared). `isDark` is `true`
  for BOTH dark modes on purpose, so every existing `isDark` consumer (status
  bar, calendar, popovers) needed no change — read `mode` only when the
  distinction matters. The stored preference is the mode string; the old
  `'dark'`/`'light'` values remain valid. Settings' appearance control is ONE
  three-colour pill in the "raised key" style (Patch 4, mock 2b, `ThemePill`
  in `app/settings.tsx`): a sunk trough with three gradient keys Light /
  EZER / Dark (colours in `themeKeys`, `theme/tokens.ts`). The active key is
  flex 2, lifted 2px, glows, and shows a checkmark. NO labels inside the
  pill; only the "Theme" row's subtitle names the mode. Names map onto the
  existing modes: "EZER" = `'dark'` (the purple-tinted dark; the owner
  renamed the mock's "Purple"/"Ezer" and wants it in CAPS), "Dark" =
  `'black'` (true dark mode). There is no separate purple theme; don't invent
  one. Shadows: `boxShadow` can't be interpolated, so each key carries the
  sunk inset shadow and the raised glow on separate layers and cross-fades
  them on the same native-driven 350ms `raised` value that lifts it — don't
  collapse them back into one swapped `boxShadow`. Haptic: `expo-haptics`
  `impactAsync(Light)` on change, skipped on web.
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

## Motion

- **Animation rules come from `.claude/skills/` (Emil Kowalski's skills,
  MIT, vendored).** `animate-expo` is the one for this app. Enter/press motion
  uses `motion.easeOut` (`theme/type.ts`, `0.23,1,0.32,1`), never `Easing.in`
  or RN's default curve. DayPopover/RangeCalendar used to overshoot
  (`0.2,0.9,0.3,1.2`, from the design handoff); that was removed on purpose,
  since a tapped popover carries no momentum to bounce with.
- **`useReduceMotion()` (`components/redesign/Primitives.tsx`)** reads the OS
  setting. Reduced = fades stay, travel and idle loops go (ScreenBody's rise,
  PulseRing's loop). The app has no Reanimated; adding it is a native
  dependency plus a rebuild, so it hasn't been done.

## Secrets

`env.ts` refuses to boot in production without `JWT_SECRET`, `ENCRYPTION_KEY`
and `DATABASE_URL`. That is deliberate — both secrets previously fell back to
development defaults committed to this repo. Do not reintroduce a fallback.
`DEV_OAUTH_BYPASS` must never be set in production; it is a login bypass.
`INSTALLMENT_SWEEP_SECRET` gates `POST /cards/installments/sweep` — unlike
the three above, an unset value does not stop the server booting (it isn't in
`REQUIRED_IN_PRODUCTION`), it just makes that one route permanently 503
(fail-closed, see `routes/installments.ts`) until it's set.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

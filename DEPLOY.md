# EZER — deploy and verification plan

Everything below is written to be run from `d:\all projects\ezer` unless a
different directory is stated. Nothing in this document has been executed —
it is the plan to run once all feature work has landed.

---

## 0. Machine constraints — read this first

This is not a footnote. Two of these have already bitten this project.

- **~25 GB commit limit.** The git root (`d:\all projects`) holds ~20 unrelated
  projects. Do not add large binaries, `node_modules`, or APKs to the repo.
- **Metro and `eas-cli` have both been OOM-killed on this machine** when Chrome
  and VS Code were open at the same time. Before starting Metro or an EAS
  build: close Chrome, close VS Code, and run the command from a bare terminal.
  If Metro dies with no error message, or `eas build` dies during "Compressing
  project files", that is the OOM killer, not a project bug — free memory and
  retry.
- **Run one heavy process at a time.** Never run Metro and `eas build`
  concurrently.
- **Do not run a build while other work is mid-flight.** EAS archives the
  working tree as-is, not the last commit; a build started during unfinished
  work ships that unfinished work.

---

## 1. Typecheck

```bash
cd "d:/all projects/ezer/apps/mobile"
pnpm exec tsc --noEmit
```

There is no `typecheck` script in `apps/mobile/package.json`; invoke `tsc`
directly as above. Expect it to take a minute or two and to use ~2 GB — close
Chrome first.

---

## 2. Dev server (Metro)

```bash
cd "d:/all projects/ezer/apps/mobile"
pnpm start            # = expo start --offline
```

`--offline` is deliberate: it skips Expo's network checks, which have hung on
this machine. Add `--clear` only when you suspect a stale transform cache — it
makes the first bundle much slower and much more memory-hungry.

Web preview (useful for quick layout checks, but **not** a substitute for a
device pass — `expo-blur`, the NFC icon, and the card 3D transforms all render
differently on web):

```bash
pnpm web           # port 8082
```

---

## 3. Builds

Both build commands are run from `apps/mobile`. Neither has been run as part of
this prep work.

### 3a. Dev-client APK

Install once per device. JS then loads live from Metro, so day-to-day work
needs no rebuild — rebuild only when a native dependency changes.

```bash
cd "d:/all projects/ezer/apps/mobile"
eas build --profile development --platform android
```

Profile `development` (in `eas.json`): `developmentClient: true`,
`distribution: internal`, `android.buildType: apk`.

After installing, start Metro (step 2) and open the dev client on the device.
It must be on the same LAN as this machine.

### 3b. Preview APK (standalone)

A self-contained APK with the JS bundle baked in — no Metro needed. This is
what goes to testers.

```bash
cd "d:/all projects/ezer/apps/mobile"
eas build --profile preview --platform android
```

Profile `preview`: `distribution: internal`, `android.buildType: apk`, no dev
client.

### 3c. Before either build — archive sanity check

The archive is rooted at the **git** root (`d:\all projects`), not at `ezer/`.
`d:\all projects\.easignore` is the only ignore file EAS reads; ignore files
placed at `ezer/` or `ezer/apps/mobile/` are **never** consulted.

Watch the `eas build` output for the line reporting compressed archive size.
It should be roughly **47 MB**. If it is:

- **~265 MB** — `.easignore` was not applied, or a new sibling project appeared
  at the repo root and is not listed in it. Add it to the "unrelated sibling
  projects" block.
- **a few hundred bytes** — someone reintroduced the `/*` + `!/ezer/` re-include
  idiom. EAS's ignore parser does not support it; it produced a 99-byte archive.
  Sibling projects must be listed one by one.

### 3d. API base URL in standalone builds

`utils/api.ts` resolves the API host in this order:

1. `process.env.EXPO_PUBLIC_API_URL` (inlined at bundle time)
2. Metro's debugger host (dev client on the same LAN)
3. `http://10.0.2.2:3001` on Android (emulator loopback)

`ezer/.env` is now excluded from the EAS archive — it is a **server** env file
holding `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `PLAID_SECRET` and an
Upstash token, none of which should ever reach a third-party build server.

Consequence: a **dev-client** build is unaffected (it falls back to the Metro
host, which is more correct than the stale LAN IP that was in `.env`). A
**preview or production** build has no API URL and will fall back to the
emulator loopback, which reaches nothing on a real handset. Before the first
real preview build, set the value explicitly — pick one:

```bash
# per-profile, stored on EAS (preferred)
eas env:create --name EXPO_PUBLIC_API_URL --value "https://api.example.com" --environment preview
```

or add an `env` block to the `preview` profile in `eas.json`:

```json
"preview": {
  "extends": "base",
  "distribution": "internal",
  "android": { "buildType": "apk" },
  "env": { "EXPO_PUBLIC_API_URL": "https://api.example.com" }
}
```

Substitute the real host — no value was invented here.

---

## 4. Open configuration decisions

### 4a. `expo-updates` / `runtimeVersion` — resolved by removing the policy

`app.json` previously declared `runtimeVersion: { policy: "appVersion" }` while
`expo-updates` was not installed anywhere in the workspace (verified: absent
from both `apps/mobile/node_modules` and `ezer/node_modules`). That combination
does nothing except emit a warning on every build, because `runtimeVersion` only
has meaning as the compatibility key between a build and an OTA update payload.

**Decision: the `runtimeVersion` block has been removed from `app.json`.** OTA
updates are not set up, are not needed for internal APK distribution, and
`expo-updates` adds native surface area and a startup network check for no
current benefit.

To enable OTA later, do all four steps together — steps 1 and 4 without 2 and 3
recreate exactly the warning that was just removed:

```bash
cd "d:/all projects/ezer/apps/mobile"
pnpm add expo-updates          # SDK 54 expects ~29.0.16
eas update:configure           # writes extra.eas.projectId + updates.url
```

3. Add a `channel` to the `preview` and `production` profiles in `eas.json`
   (for example `"channel": "preview"`).
4. Restore the policy in `app.json`:

```json
"runtimeVersion": { "policy": "appVersion" }
```

Then a native rebuild is required once; after that `eas update --branch preview`
ships JS-only changes.

### 4b. `RECORD_AUDIO` — flagged, not removed

`android.permission.RECORD_AUDIO` is declared in `app.json`. **Nothing in the
app requests or uses it.** A full scan of `app/`, `components/`, `utils/`,
`theme/`, `contexts/` and `constants/` found no import of `expo-av`,
`expo-audio`, or any recording API; the only other hits were inside the
`.tmp-bnpl-web-check` build artifact, which is vendor code.

It was left in place because feature work was still landing when this was
written. **Before any Play Store submission, delete it** — an undeclared-use
microphone permission is a common review rejection, and it surfaces to users as
"this app can record audio" on the install screen. Once confirmed unused, remove
the whole `permissions` array from `app.json`.

Related: `expo-image-picker` is listed as a config plugin in both `app.json` and
`app.config.js`, but no source file imports it. Its plugin injects `CAMERA` and
media-read permissions. Same recommendation — confirm with the agent that owns
the Physical Card designer whether image import is planned; if not, drop the
plugin and the dependency together.

### 4c. `app.config.js` overrides `app.json` plugins

`apps/mobile/app.config.js` does `{ ...require('./app.json').expo, plugins }`
with its own `plugins` array. **The `plugins` array in `app.json` is dead
config** — `app.config.js` wins, and it deliberately omits
`react-native-purchases` (that package ships no Expo config plugin). Every other
key, including `splash`, `userInterfaceStyle`, `android` and `ios`, comes from
`app.json`. Edit plugins in `app.config.js`; edit everything else in `app.json`.

### 4d. `eas-build-pre-install.sh` is not wired up

`apps/mobile/eas-build-pre-install.sh` copies `packages/shared` and
`packages/ui` into `local-packages/` and rewrites `workspace:*` specifiers. EAS
runs the **npm script** named `eas-build-pre-install`, not a loose `.sh` file,
and `apps/mobile/package.json` has no such script. The hook therefore never
runs — which is currently harmless, because `apps/mobile/package.json` no longer
depends on `@ezer/shared` or `@ezer/ui` at all. Either delete the script or wire
it up; leaving it looks like working infrastructure and is not.

---

## 5. Config changes already applied

| File | Change |
|---|---|
| `app.json` | `splash.backgroundColor` `#F7F7F5` → `#F7F3EA` (light token `bg`) |
| `app.json` | added `splash.dark.backgroundColor` `#151021` (dark token `bg`) |
| `app.json` | added `userInterfaceStyle: "automatic"` |
| `app.json` | `adaptiveIcon.backgroundColor` `#F7F7F5` → `#F7F3EA` |
| `app.json` | added `android.versionCode: 1` |
| `app.json` | removed `runtimeVersion` (see 4a) |
| `eas.json` | `preview` — explicit `android.buildType: "apk"` |
| `eas.json` | `production` — explicit `android.buildType: "app-bundle"` |
| `eas.json` | `development-simulator` — explicit `android.buildType: "apk"` |
| `.easignore` | added `/void-rank/`, `**/.env*`, `**/.tmp-*/`, `**/.wrangler/`, `**/.turbo/`, `**/.claude/`, `**/.cursor/`, `**/.vscode/`, `ezer/.tunnel/`, `ezer/web-preview/`, design-handoff folder + zip, root screenshots, `**/*.zip` |

`userInterfaceStyle` deserves a note. It was previously unset, which means
Expo's default of `"light"`. On iOS that pins `useColorScheme()` to `'light'`
forever, and `utils/ThemeContext.tsx` defaults to the system scheme
(`setIsDark(systemColorScheme === 'dark')`) — so dark mode would never engage
from system preference on iOS. `"automatic"` lets the real scheme through.

**Verify on device (Android):** the `splash.dark` key is honoured through
`expo-splash-screen`, which is present transitively but is not listed in
`plugins`. If the dark-mode launch still flashes cream, the `dark` variant is
being ignored on Android — in that case set the base
`splash.backgroundColor` to `#151021` and accept the (much milder) dark→cream
transition in light mode. This is smoke-test item S2 below.

---

## 6. Dependency and asset audit

Reported only. **Nothing was added or removed** — other agents were mid-flight.

### Assets — all present

`assets/icon.png` (6.0 KB), `assets/splash.png` (18.7 KB),
`assets/adaptive-icon.png` (6.0 KB), `assets/favicon.png` (272 B). All four
paths referenced from `app.json` resolve.

`assets/merchants/*` was still in flight at audit time and does not yet exist.
Confirm `components/MerchantLogo.tsx` and `components/redesign/MerchantMark.tsx`
degrade gracefully — a missing static `require()` is a **bundle-time** error,
not a runtime one, so a missing merchant asset breaks the whole app.

### Imported but not declared

None. Every bare specifier imported from source resolves to a declared
dependency. The `@/theme` and `@/utils` aliases are handled by
`babel-plugin-module-resolver`.

### Declared but never imported

| Package | Assessment |
|---|---|
| `react-native-chart-kit` | **Unused.** No import anywhere. Charting is done by `components/redesign/PriceChart.tsx` via `react-native-svg`. Safe to drop once the redesign settles. |
| `react-native-purchases-ui` | **Unused.** `react-native-purchases` is imported; the `-ui` companion is not. Drop unless the paywall is going to use RevenueCat's prebuilt UI. |
| `expo-image-picker` | **Unused in JS**, but active as a config plugin. See 4b. |
| `expo-font` | Keep. No direct import, but it is a required peer of `@expo-google-fonts/*` and `@expo/vector-icons`. |
| `expo-dev-client` | Keep. Consumed by the `development` build profile, not by JS. |
| `expo-build-properties` | Keep. Config plugin. |
| `@react-navigation/native`, `@react-navigation/bottom-tabs` | Keep. Required peers of `expo-router`. |
| `react-native-screens` | Keep. Required peer of `expo-router`. |
| `react-native-web`, `react-dom` | Keep. Required by the web target. |

### Version mismatch — fix before the next native build

`expo-linear-gradient` is pinned at `~14.0.1`, but Expo SDK 54's
`bundledNativeModules.json` expects **`~15.0.8`**. It is imported widely
(`VirtualCard`, `RotatingTile`, the gold tiles, the chart card). A major-version
skew on a package with native code is a real crash risk in a standalone build,
even though it usually survives on web and in Expo Go.

Fix (do **not** run this while other agents are editing `package.json`):

```bash
cd "d:/all projects/ezer/apps/mobile"
pnpm exec expo install --check      # lists every mismatch
pnpm exec expo install --fix        # applies them
```

Everything else checked (`expo-blur`, `expo-constants`, `expo-font`,
`expo-router`, `expo-status-bar`, `react-native-svg`, `react-native-screens`,
`react-native-safe-area-context`, `react-native-gesture-handler`) matches the
SDK 54 expectation.

### Encoding

`apps/mobile` (excluding `node_modules`) and `ezer/scripts` were scanned for the
mojibake signatures left by `Set-Content -Encoding utf8` — `â€` sequences (from
`•` and `—`) and stray `Â` before a non-breaking space. **130 files scanned,
zero hits, zero UTF-8 BOMs.** The detector was validated against synthetic
mojibake first, so the clean result is trustworthy and not a broken regex.
No repairs were needed.

If corruption reappears, repair with a cp1252 round-trip — never with
`Set-Content`:

```powershell
$p = 'path\to\file.tsx'
$t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
$fixed = [System.Text.Encoding]::UTF8.GetString([System.Text.Encoding]::GetEncoding(1252).GetBytes($t))
[System.IO.File]::WriteAllText($p, $fixed, (New-Object System.Text.UTF8Encoding($false)))
```

---

## 7. Manual smoke test

Run the whole list on a **physical Android device** against a **preview APK**
(§3b). The dev client is fine for iteration, but blur, shadows, and the card
transforms differ enough that sign-off must happen on the standalone build.

Run the entire list **twice** — once in system light mode, once in system dark
mode. Most of the redesign risk is in the dark palette.

### S — startup and shell

- [ ] **S1** Cold launch from the launcher. Splash appears, no white frame
      between splash and first screen.
- [ ] **S2** In **system dark mode**: splash background is dark plum
      (`#151021`), not cream. If it is cream, apply the fallback in §5.
- [ ] **S3** In **system light mode**: splash background is cream (`#F7F3EA`).
- [ ] **S4** App opens in the theme matching the system setting (fresh install,
      no stored preference).
- [ ] **S5** Status bar icons are legible in both themes (light glyphs on dark,
      dark glyphs on light).
- [ ] **S6** Floating tab bar: four tabs — Home, Pay in 4, Wallet, Savings —
      in that order, 12px side inset, blur visible behind it, rounded corners
      not clipped square.
- [ ] **S7** Active tab shows the `accSoft` pill behind an accent-coloured icon
      and label.
- [ ] **S8** No content is trapped under the floating bar on any tab — scroll
      each tab to the bottom and confirm the last element clears it.
- [ ] **S9** Rotate to landscape and back: orientation is locked to portrait, so
      nothing should rotate.
- [ ] **S10** Background the app for 30s and resume: state is preserved, no
      white flash on resume.

### T — tabs

**Home** (`app/(tabs)/home.tsx`)
- [ ] **T1** Loads with demo data; no spinner stuck on screen.
- [ ] **T2** Spending-power gold tile renders its gradient (not flat).
- [ ] **T3** "How you're getting charged" chart card renders the gold line and
      the purple gradient in both themes.
- [ ] **T4** Calendar strip: days with charges are highlighted; tapping one
      opens the day popover with the right merchants.
- [ ] **T5** Every card links through to its detail screen and back.

**Pay in 4** (`app/(tabs)/payin4.tsx` — rewritten)
- [ ] **T6** Instalment schedule shows four instalments with correct dates and
      amounts summing to the total.
- [ ] **T7** Primary CTA renders the purple→gold gradient and responds to tap.
- [ ] **T8** Paid vs upcoming instalments are visually distinct.
- [ ] **T9** Empty state (no active plan) renders without a layout collapse.

**Wallet** (`app/(tabs)/wallet.tsx` — rewritten)
- [ ] **T10** Virtual card renders the Amethyst gradient, correct corner radius.
- [ ] **T11** Card flip/spin animation completes both directions, and the gold
      metal edge is visible mid-spin.
- [ ] **T12** NFC tap icon animates and is not clipped.
- [ ] **T13** Bank cards (sapphire and gold) render with the gold card's middle
      stop at 65%, not the midpoint.
- [ ] **T14** Card detail opens and back-navigates cleanly.
- [ ] **T15** Entry point to the Physical Card designer is present and works.

**Savings** (`app/(tabs)/savings.tsx` — landed late, test hardest)
- [ ] **T16** Tab loads; goals list renders from `SavingsGoalsContext`.
- [ ] **T17** Create a goal: it appears immediately and survives an app restart
      (AsyncStorage persistence).
- [ ] **T18** Edit a goal's target and name; the progress bar recalculates.
- [ ] **T19** Delete a goal; no crash, list re-renders, empty state appears when
      the last goal is removed.
- [ ] **T20** Goal progress bar clamps at 100% when contributions exceed target
      — no overflow past the track.
- [ ] **T21** Zero-target or zero-progress goal does not produce `NaN%` or a
      divide-by-zero.
- [ ] **T22** Confirm whether `app/savings.tsx` (root route) and
      `app/(tabs)/savings.tsx` are both reachable. Two routes named `savings`
      is a likely duplicate — if the root one is dead, it should be deleted.

### C — Physical Card designer and approval

**Designer** (`app/screens/PhysicalCard.tsx`, `components/redesign/CardCanvas.tsx`)
- [ ] **C1** Screen opens from Wallet.
- [ ] **C2** Each finish (Amethyst, Onyx, Midnight) applies to the live preview.
- [ ] **C3** Preview updates without a full re-render flash on every change.
- [ ] **C4** Design choices persist via `utils/cardDesignStore.ts` — leave the
      screen, come back, selection is retained.
- [ ] **C5** Design survives a full app restart.
- [ ] **C6** Text overlaid on the card stays legible on the lightest finish.
- [ ] **C7** If image upload is offered, confirm the permission prompt copy and
      that declining does not crash (see 4b).

**Approval** (`app/screens/PhysicalCardApproval.tsx` — landed late)
- [ ] **C8** Reached from the designer's confirm action.
- [ ] **C9** Summary reflects the exact design chosen, not a default.
- [ ] **C10** Approve: success state renders; back-navigation does not re-submit.
- [ ] **C11** Cancel/back from approval returns to the designer with the design
      intact.
- [ ] **C12** Double-tapping the approve button does not fire twice.

### D — detail screens

- [ ] **D1** **Subscription Detail** (`app/screens/SubscriptionDetail.tsx`) —
      opens from Home and Saved; charge history, next-charge date, and cancel
      entry point all render.
- [ ] **D2** **Drain Review** (`app/screens/DrainReview.tsx` — rewritten) —
      flagged subscriptions listed; totals match the sum of the rows; actions
      dismiss rows correctly.
- [ ] **D3** **Drain Review** empty state (nothing flagged) renders properly.
- [ ] **D4** **Settings** (`app/settings.tsx` — rewritten) — theme toggle flips
      the whole app immediately, including the tab bar blur tint.
- [ ] **D5** Theme choice persists across a full restart.
- [ ] **D6** All four settings sub-routes open: `account`,
      `connected-accounts`, `notifications`, `help`.
- [ ] **D7** **Alerts** (`app/(tabs)/alerts.tsx` — rewritten) — reachable by
      route even though hidden from the tab bar; list renders; back works.
- [ ] **D8** **Saved** (`app/(tabs)/saved.tsx`) — same: reachable, renders,
      back works.
- [ ] **D9** **Paywall** (`app/screens/Paywall.tsx`) — renders. RevenueCat is
      native-only; confirm it does not hard-crash if no offering is configured.
- [ ] **D10** Remaining screens open without crashing: `CancelFlow`,
      `ConfirmCancel`, `CashAdvanceFlow`, `MonthlyBurn`, `Reallocate`,
      `RiskDetail`, `SilentSubscriptions`, `TrialDecision`, `CardDetail`.
- [ ] **D11** Onboarding (`app/onboarding.tsx`) and auth
      (`app/auth/login.tsx`, `app/auth/signup.tsx`) render on a fresh install.

### F — finish

- [ ] **F1** No red error box or yellow warning box anywhere in the pass.
- [ ] **F2** Fonts: Instrument Serif and Space Grotesk are actually applied —
      no fallback to system sans anywhere.
- [ ] **F3** No mojibake on screen (`â€¢` where `•` belongs, `â€"` where `—`
      belongs). Check headings and legal/fine-print text specifically.
- [ ] **F4** Currency values format consistently (`constants/money.ts`,
      `utils/format.ts`) — no raw floats like `12.300000000000001`.
- [ ] **F5** Back gesture and hardware back button behave on every stack screen.
- [ ] **F6** Deep link works: `adb shell am start -W -a android.intent.action.VIEW -d "ezer://settings"`.

---

## 8. Pre-submission checklist (Play Store)

Not needed for internal APK distribution; required before a store upload.

- [ ] Remove `RECORD_AUDIO` (4b), and `expo-image-picker` if still unused.
- [ ] Bump `version` and `android.versionCode` in `app.json`
      (`appVersionSource` is `"local"`, so EAS reads them from there — they are
      not auto-incremented).
- [ ] Set `EXPO_PUBLIC_API_URL` for the production profile (3d).
- [ ] Turn off `usesCleartextTraffic` in the `expo-build-properties` plugin
      config — it is currently `true`, which permits plaintext HTTP and is
      flagged in review. It is only needed to reach a local HTTP dev API.
- [ ] Build with `--profile production` (AAB, not APK).
- [ ] Confirm `ITSAppUsesNonExemptEncryption: false` is still accurate for iOS.

---

## 9. Automated goal savings engine — migration & wiring

Added in this pass: 8 Prisma models, `apps/api/src/services/savingsEngine.ts`, and
`apps/api/src/routes/savings.ts` (mounted at `/savings`, auth-required).

### 9a. Apply the schema

This repo had **no migration history** — everything up to now was applied with
`db push`. Migrations have now been introduced by BASELINING, not by running
`migrate dev` cold.

> **Never run `prisma migrate dev` against a db-push database.** It detects
> drift, reports that the schema matches no migration history, and offers to
> **reset**. On a dev box that costs you the seeded Plaid links and test ledgers;
> pointed at a shared database it is a genuine incident.
>
> **Never run `migrate dev` against production at all** — `dev` can reset,
> `deploy` cannot. Production uses `migrate deploy`, only.

Two migrations are committed, split so the ledger tables have a dated,
reviewable origin rather than disappearing into the baseline:

| Migration | Contents |
|---|---|
| `0_init` | The 18 pre-existing tables, diffed from the schema as committed BEFORE the savings work. |
| `20260731000000_add_savings_engine` | The 9 new tables: FundingSource, SavingsGoal, GoalAllocationRule, SavingsSettings, InternalAccount, Transfer, SavingsLedgerEntry, SweepRun, ProcessorWebhookEvent. |

**Baseline every existing database once**, before its first `migrate deploy` —
dev, staging, and production if it already has tables:

```bash
cd "d:\all projects\ezer\packages\db"
pnpm exec prisma migrate resolve --applied 0_init
```

That records `0_init` as already applied without executing it. Then:

```bash
# dev — from here on this behaves normally and writes real SQL files
pnpm exec prisma migrate dev --name <change>

# staging / production — NEVER migrate dev
pnpm exec prisma migrate deploy
```

Because the savings tables were never pushed, `20260731000000_add_savings_engine`
still needs to run for real; `migrate deploy` applies it after the baseline.

Regenerating the two migration files from scratch (only if they are ever lost):

```bash
git show <pre-savings-commit>:ezer/packages/db/prisma/schema.prisma > /tmp/pre.prisma
pnpm exec prisma migrate diff --from-empty --to-schema-datamodel /tmp/pre.prisma --script \
  > prisma/migrations/0_init/migration.sql
pnpm exec prisma migrate diff --from-schema-datamodel /tmp/pre.prisma \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/20260731000000_add_savings_engine/migration.sql
```

The Prisma client has already been regenerated, so the API typechecks clean
(`cd apps/api && npx tsc --noEmit` → 0 errors). Re-run `pnpm exec prisma generate`
in `packages/db` after any further schema edit.

### 9b. What works today, and what does not

Working end to end against the stub processor:
- goal CRUD, safety-rail settings, `/savings/sweep/preview`, `/savings/sweep/run`
- double-entry ledger with derived balances (no mutable balance column anywhere)
- settle / return webhook, ACH return-window holds, withdrawal eligibility

**The engine will not move money yet, by design.** Two seams are deliberately
unimplemented in `savingsEngine.ts`:

| Function | State | Why |
|---|---|---|
| `fetchLiveBalance()` | returns `null` → sweep aborts | A guessed balance is exactly how you overdraft a real user. The design's own note calls the live read "the single most important guardrail". |
| `forecastInflows()` | returns `[]` | Conservative direction: no inflows means a LOWER projected minimum, so the engine sweeps less, never more. |

`stubProcessor` in `routes/savings.ts` records what would have been originated and
returns a deterministic external id. It intentionally does **not** auto-settle —
settlement only happens on a webhook, exactly as in production, so the
return-window logic stays exercised.

### 9c. Before this touches real money

1. Wire `fetchLiveBalance()` to `plaid.accountsBalanceGet` and read
   `balances.available` (NOT `.current` — current includes uncleared credits).
2. Replace `stubProcessor` with the real ACH provider (Dwolla / Increase / Column).
3. Add a reconciler for transfers left `PENDING` after a failed origination. They
   are deliberately not marked `FAILED`: a failed API call is not a returned
   debit, and reversing the ledger for money that may still move corrupts the books.

### 9d. Processor webhook

`POST /webhooks/processor/transfers` — `apps/api/src/routes/processorWebhook.ts`.

It is registered as its **own Fastify plugin**, not as a path exception inside
the auth hook. Plugins are encapsulation contexts, so the savings `preHandler`
structurally cannot reach it; a path check would regress the first time someone
refactored that hook. The HMAC signature is the authentication — processors send
no user JWT, so requiring one would be the wrong auth, not stronger auth.

Implemented:

| Control | How |
|---|---|
| Raw-byte verification | A `parseAs: 'buffer'` content-type parser scoped to this plugin. HMAC over `JSON.stringify(body)` fails intermittently — key order and whitespace won't match what was signed. |
| Constant-time compare | `crypto.timingSafeEqual`, never `===`. |
| Replay window | Rejects timestamps outside ±5 minutes; the signature covers `timestamp + rawBody`. |
| Idempotency | `ProcessorWebhookEvent.eventId` is UNIQUE. Insert first; a collision returns 2xx and skips the handler. Processors retry on any non-2xx and on timeouts, and double-processing a settlement double-credits a goal — unrecoverable, unlike a missed webhook. |
| Fail closed | An unset `PROCESSOR_WEBHOOK_SECRET` returns 503, never "accept everything". |
| 2xx only after durable record | Recorded, applied, then `processedAt` stamped. |
| Rejection logging | Every rejection logs reason + source IP. |

Required env before enabling:

```
PROCESSOR_NAME=<dwolla|increase|column>
PROCESSOR_WEBHOOK_SECRET=<shared signing secret>
```

Expected headers: `x-processor-signature` (hex HMAC-SHA256), `x-processor-timestamp`
(epoch ms). Adjust both names and the signing string to match the provider's
actual scheme when one is chosen.

# EZER API — deploy to Railway

Companion to `DEPLOY.md` (which covers the mobile app). This one covers the
Fastify API, Supabase and Plaid.

Everything in the "Verified" section below was actually executed against the
live Supabase project and the live Plaid sandbox on 2026-08-02, not reasoned
about. Everything in "Still open" was not.

---

## Verified working

| Thing | Evidence |
|---|---|
| Supabase Postgres reachable, schema applied | 28 tables present, incl. `SavingsGoal`, `SavingsSettings`, `SweepRun`, `PlaidItem`, `Transfer` |
| Sign up / sign in | `POST /auth/signup` → real user row + JWT; `SavingsSettings` auto-created on first read |
| Plaid link token | `POST /plaid/create-link-token` → `link-sandbox-…` |
| Plaid item exchange | `POST /plaid/exchange-public-token` → item stored, access token encrypted |
| Transaction sync → subscription detection | `POST /plaid/sync` runs against real Plaid transactions; the sandbox set contains no genuine recurring merchant, so it now correctly detects **0** (it detected 12 before the filters — see "Fixed since the first draft") |
| Funding instruments | 12 accounts written from Plaid (`Plaid Checking ****0000`, …) |
| Live balances | `GET /plaid/balance` → checking available $100.00 |
| Savings API | `/savings/goals`, `/savings/settings`, `/savings/sweep/preview` all respond |
| Deposit → settle → move | $200 deposit booked IN_TRANSIT; signed webhook settled it to `funded=20000`; $50 then $25 moved between goals with the total conserved at 20000 throughout |
| Webhook auth | valid HMAC accepted, `deadbeef` rejected with `BAD_SIGNATURE` |

---

## 1. Railway environment variables

`railway.json` is already correct (NIXPACKS, `/health` check, the right build
and start commands). What Railway needs is the environment.

Copy these from the repo-root `.env`. **Do not commit `.env`** — it holds live
Plaid and database credentials.

**Required — the API will not work without these:**

```
DATABASE_URL      # Supabase pooler, see §2 — the params matter
JWT_SECRET        # tokens signed with a different secret are rejected
ENCRYPTION_KEY    # decrypts stored Plaid access tokens; LOSING THIS ORPHANS
                  # every linked bank — users must re-link
PLAID_CLIENT_ID
PLAID_SECRET
PLAID_ENV         # "sandbox" for now — see §5
PROCESSOR_WEBHOOK_SECRET   # HMAC for POST /webhooks/processor/transfers
NODE_ENV=production
```

`PROCESSOR_WEBHOOK_SECRET` was missing entirely and nothing surfaced it,
because the route reads it at module scope and returns
`WEBHOOK_NOT_CONFIGURED` per request. Without it **no transfer ever settles**:
deposits sit in IN_TRANSIT forever and goal balances stay at zero while the
app cheerfully reports success. A random 32-byte hex value is fine; it just has
to match whatever the processor is configured with.

With `NODE_ENV=production` the API now refuses to boot if `JWT_SECRET`,
`ENCRYPTION_KEY` or `DATABASE_URL` are absent (`src/env.ts`). That is
deliberate: both secrets previously fell back to hardcoded development defaults
committed to this repo, so a missing variable produced a working-but-insecure
server rather than a failure.

**Do not set `PORT`.** Railway injects it, and `src/index.ts` already prefers
`process.env.PORT` over `API_PORT`. Setting it by hand is how you get a
container that builds, starts, and fails its health check.

**Optional, per feature:**

```
REDIS_URL / UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   # worker queues
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI   # Gmail ingest
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_REDIRECT_URI
FEATURE_PLAID=true
UPLOAD_DIR / MAX_FILE_SIZE
```

**Leave behind:** `DEV_OAUTH_BYPASS`. It exists to skip OAuth locally. In
production it is a login bypass.

---

## 2. `DATABASE_URL` — the pooler parameters are not optional

```
postgresql://postgres.<ref>:<pw>@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=10
```

**`connection_limit=10`, not `1`.** Prisma's docs recommend `connection_limit=1`
alongside pgbouncer, but that guidance is for *serverless* functions where each
invocation is its own process. This is a long-lived Fastify server: `GET
/savings/goals` fans out two queries per goal, so a pool of one deadlocks and
returns `P2024 Timed out fetching a new connection`. That was reproduced here
before the value was raised.

Port **6543** is Supabase's transaction pooler (pgbouncer). Prisma keeps
server-side prepared statements alive across checkouts, and pgbouncer hands the
same statement name to a different session — which surfaces as:

```
ERROR: prepared statement "s0" already exists
```

That was reproduced on this project before `pgbouncer=true` was added. It is
intermittent and load-dependent, which is the worst way for it to reach
production. The params are already applied to the local `.env`; make sure
whatever you paste into Railway keeps them.

### Migrations

`prisma migrate deploy` must **not** run through the transaction pooler — DDL
and advisory locks need a session connection. The build command in
`railway.json` deliberately runs only `prisma generate`, not `migrate deploy`.

Both migrations (`0_init`, `20260731000000_add_savings_engine`) are **already
applied** to this Supabase database, so there is nothing to run for this deploy.
For future migrations you need a session-mode URL (port 5432) as `directUrl`.

> Known local issue: `prisma migrate status` fails with `P1001` against
> port 5432 from this Windows machine, while a raw Postgres handshake to the
> same host and port succeeds and the API queries fine over 6543. So it is a
> Prisma-engine/Windows networking problem, not a paused project or bad
> credentials. If you hit it when adding a migration, run the migration from
> the Supabase SQL editor or from CI rather than this machine.

---

## 3. Point the mobile app at the deployed API

`apps/mobile/utils/api.ts` resolves the base URL in this order: the
`EXPO_PUBLIC_API_URL` env var → the Expo Go debugger host → an emulator
loopback. The repo-root `.env` currently has a LAN address:

```
EXPO_PUBLIC_API_URL="http://10.1.57.191:3001"
```

That is correct for developing against your laptop and wrong for anything you
ship. Before an EAS build, set it to the Railway URL:

```
EXPO_PUBLIC_API_URL="https://<your-app>.up.railway.app"
```

`EXPO_PUBLIC_*` values are **inlined into the bundle at build time**, so this
must be right *before* `eas build`, not after. Changing it later means a
rebuild.

CORS is `origin: true`, so the web PWA and native app are both accepted without
further configuration.

---

## 4. Plaid Link needs a development build

`apps/mobile/utils/usePlaid.ts` loads `react-native-plaid-link-sdk` through a
guarded `require`. It is a **native module**, so in Expo Go the require fails,
the hook detects it, and the user gets an explanatory alert instead of a crash.

Linking a real bank therefore requires:

```bash
eas build --profile development --platform ios     # or android
```

Everything else in the flow — sign in, subscriptions, savings, wallet — works
in Expo Go against the deployed API.

---

## 5. Sandbox → production Plaid, when you are approved

Plaid Production access is granted per-account by Plaid; until then this stays
on sandbox, where linking uses `user_good` / `pass_good` against a fake bank
with real API semantics.

When approval lands, this is the entire change — **no code**:

```
PLAID_ENV=production
PLAID_SECRET=<your production secret>
```

`PLAID_CLIENT_ID` is the same across environments. `getPlaidClient()` in
`routes/plaid.ts` reads `PLAID_ENV` on every call and maps it through Plaid's
own `PlaidEnvironments`, so nothing is cached at boot.

Two things to know before you flip it:

- **Existing sandbox items stop working.** Access tokens are environment-scoped.
  Every linked item in the database was minted in sandbox and will fail against
  production. Users re-link; there is no migration path. Plan the flip for
  before you have real users, not after.
- **Production is billed per item.** Sandbox is free.

---

## 6. Deploy sequence

```bash
# 1. from the Railway dashboard: set the env vars from §1
# 2. push; Railway builds via railway.json
# 3. verify
curl https://<your-app>.up.railway.app/health
# → {"status":"ok","timestamp":"..."}

# 4. verify auth + database in one shot
curl -X POST https://<your-app>.up.railway.app/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@example.com","password":"<pick one>","name":"Smoke"}'
# → {"success":true,"data":{"token":"eyJ...","userId":"c..."}}

# 5. verify Plaid is configured on the deployed box
curl -X POST https://<your-app>.up.railway.app/plaid/create-link-token \
  -H "Authorization: Bearer <token from step 4>"
# → {"success":true,"data":{"linkToken":"link-sandbox-..."}}
```

Step 5 is the one that catches a missing `PLAID_CLIENT_ID`/`PLAID_SECRET`. It
returns `503 "Plaid not configured on this server"` rather than crashing, so
the health check stays green while bank linking is quietly broken — exactly the
failure this project already hit locally.

---

## Fixed since the first draft

- **Recurrence false positives.** One sandbox account produced **12** bogus
  subscriptions including the user's own payroll. Two causes, both fixed and
  now covered by `packages/shared/src/subscriptionDetection.test.ts` (24 tests):
  no category filter at all (transfers, loan payments and income were all
  eligible), and a recurrence test that averaged gaps over as few as two
  transactions — which is how KFC, McDonald's, Starbucks and United Airlines
  became "monthly subscriptions". Same account now yields **0**.
- **Manual deposit and move-between-goals** now exist:
  `POST /savings/goals/:id/deposit` and `POST /savings/transfer`. Both go
  through the double-entry ledger. Deposits get the same 4-business-day ACH
  return window as a sweep; moves are capped at `withdrawableCents` so hopping
  a goal cannot launder that window.

## Still open

Not done, and not hidden:

- **The mobile Savings screens do not use this API.** `SavingsGoalsContext`
  keeps goals in AsyncStorage and runs its own sweep engine client-side. The
  server has the real one — double-entry ledger, ACH return windows, idempotent
  weekly sweeps. Until the context is rewritten against `/savings/*`, the
  Savings tab shows device-local numbers while the server holds the real ones.
- **The two savings engines disagree.** The client uses a buffer with a 5%/3-day
  sweep capped at $50; the server uses `minCheckingCents` ($100 default) and
  `maxWeeklyCents` ($500 default). The server is authoritative — the client
  should become a view of it, not a second opinion.
- **No `directUrl`** in `packages/db/prisma/schema.prisma`, so future migrations
  cannot run through the pooled connection (see §2).

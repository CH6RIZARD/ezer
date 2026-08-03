# EZER

Turn subscriptions into explicit decisions. EZER is a production-ready subscription management app that helps users make conscious decisions about their recurring payments through pre-trial intercepts, funding-first wallet UI, direct cancellation flows, and smart reallocation.

## Features

### Core Features (Tier 1 - Fully Implemented)

- **Pre-Trial Intercept**: Detect new trials via email/SMS/transaction parsing and prompt users to set auto-cancel rules
- **Funding-First Wallet UI**: Visual card carousel showing subscription drains by funding instrument
- **Direct Cancellation Spine**: Guided cancel flow with proof upload and confirmation tracking
- **Price-Drain Timeline**: Historical cost analysis with investment opportunity cost calculator (7% annualized)
- **Reallocation Engine**: Redirect canceled subscription amounts to savings, debt, investing, or intentional subscriptions

### Data Intake
- Email parsing (Gmail API, Outlook Graph API, IMAP fallback)
- SMS parsing (Twilio webhook)
- Transaction CSV import with recurrence detection
- .eml file upload support

### OAuth & Security
- Native Google Sign-In (iOS + Android) via Google Auth Platform
- Apple Sign-In (iOS) with server-side identity token verification
- Microsoft Entra sign-in (iOS + Android) via system browser
- Email/password signup + login (bcrypt)
- AES-256-GCM encryption for stored mailbox tokens
- JWT-based sessions (no demo / bypass login in the app)
- Optional `DEV_OAUTH_BYPASS` only enables `/simulator/*` for local tooling — off by default

## Architecture

Turborepo monorepo with the following packages:

```
ezer/
├── apps/
│   ├── mobile/          # Expo React Native app
│   └── api/             # Fastify Node.js API
├── packages/
│   ├── db/              # Prisma schema & migrations
│   ├── shared/          # Shared types, utils, Zod schemas
│   ├── ui/              # React Native UI components
│   └── worker/          # BullMQ background jobs
└── docker-compose.yml   # Postgres + Redis
```

## Tech Stack

- **Frontend**: Expo, React Native, TypeScript
- **Backend**: Fastify, Node.js, TypeScript
- **Database**: PostgreSQL (Prisma ORM)
- **Queue**: Redis + BullMQ
- **Auth**: OAuth 2.0 (Google, Microsoft, Apple)
- **Storage**: Local filesystem for uploads

## Prerequisites

- Node.js >= 18
- pnpm >= 8
- Docker & Docker Compose

## Quick Start

### 1. Clone and Install

```bash
git clone <repo-url>
cd ezer
pnpm install
```

### 2. Environment Setup

Copy the environment file:

```bash
cp .env.example .env
```

Copy `.env.example` → `.env`. Keep `DEV_OAUTH_BYPASS=false` for real sign-in.

**Google (required for Continue with Google):** see [`docs/google-auth-platform.md`](docs/google-auth-platform.md).

```env
# Google Auth Platform — Web + iOS + Android client IDs
GOOGLE_CLIENT_ID="web-client-id"
GOOGLE_WEB_CLIENT_ID="web-client-id"
GOOGLE_IOS_CLIENT_ID="ios-client-id.apps.googleusercontent.com"
GOOGLE_ANDROID_CLIENT_ID="android-client-id.apps.googleusercontent.com"
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="web-client-id"
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="ios-client-id.apps.googleusercontent.com"

# Microsoft Entra (mobile redirect: ezer://auth/microsoft)
MICROSOFT_CLIENT_ID="..."
EXPO_PUBLIC_MICROSOFT_CLIENT_ID="..."

# Apple (bundle / services id)
APPLE_CLIENT_ID="com.ezer.app"
```

### 3. Start Infrastructure

```bash
# Start Postgres + Redis
pnpm docker:up

# Run migrations
pnpm db:migrate

# Seed demo data
pnpm db:seed
```

### 4. Start Development

```bash
# Start all services (API, Worker, Mobile)
pnpm dev
```

This starts:
- **API**: http://localhost:3001
- **Worker**: Background job processor
- **Mobile**: Expo dev server (scan QR code with Expo Go app)

## Authentication (deploy-ready)

The mobile app **does not** invent users locally. Every sign-in hits the API:

| Method | Mobile → API |
|--------|----------------|
| Google | Native SDK ID token → `POST /auth/oauth/google/complete` |
| Apple (iOS) | `expo-apple-authentication` → `POST /auth/oauth/apple/complete` |
| Microsoft | Auth Session + PKCE → `POST /auth/oauth/microsoft/complete` |
| Email | `POST /auth/signup` / `POST /auth/login` |

Setup for Google: [`docs/google-auth-platform.md`](docs/google-auth-platform.md).

`DEV_OAUTH_BYPASS=true` only mounts `/simulator/*` for local tooling. Leave it `false` for real builds.

## Database Schema

The schema includes:

- **Auth**: User, AuthAccount, OAuthToken, DataSource
- **Wallet**: FundingInstrument, SubscriptionCharge
- **Core**: Merchant, Subscription, Trial, DecisionRule, PriceHistory
- **Cancellation**: CancelAttempt, ProofArtifact
- **Reallocation**: AllocationPlan, LedgerEntry

See [packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma) for full schema.

## API Endpoints

### Auth
- `POST /auth/signup` — email/password signup
- `POST /auth/login` — email/password login
- `POST /auth/oauth/google/complete` — Google ID token → JWT
- `POST /auth/oauth/apple/complete` — Apple identity token → JWT
- `POST /auth/oauth/microsoft/complete` — Microsoft ID token → JWT
- `POST /auth/session` — validate JWT

### Inbox Connections
- `POST /connect/gmail/start`
- `POST /connect/gmail/callback`
- `POST /connect/outlook/start`
- `POST /connect/outlook/callback`
- `POST /connect/imap`

### Wallet
- `GET /wallet/instruments`
- `GET /wallet/instruments/:id/summary?range=...`
- `GET /wallet/instruments/:id/merchants?range=...`
- `PATCH /wallet/instruments/:id`
- `POST /wallet/charges/reassign`

### Core
- `GET /home/summary`
- `GET /risks?days=30`
- `GET /trials`
- `POST /trials/:id/decision`
- `GET /subscriptions`
- `GET /subscriptions/:id`

### Cancellation
- `POST /subscriptions/:id/cancel`
- `POST /cancel-attempts/:id/proof`
- `POST /cancel-attempts/:id/confirm`
- `GET /cancel-attempts/:id`

### Ingest
- `POST /ingest/eml`
- `POST /ingest/sms`
- `POST /ingest/csv`
- `POST /ingest/gmail/pull`
- `POST /ingest/outlook/pull`

### Jobs
- `POST /jobs/run-analysis`

### Simulator (only if `DEV_OAUTH_BYPASS=true`)
- `POST /simulator/mock-inbox`
- `POST /simulator/auto-cancel/:trialId`
- `POST /simulator/mark-canceled/:subscriptionId`

## Mobile App Screens

1. **Onboarding**: Choose sign-in method (Google / Apple / Microsoft)
2. **Home**: Monthly burn rate, 30-day risk, silent subscriptions count
3. **Wallet**: Card carousel with drain summary by funding instrument
4. **Card Detail**: Merchants draining specific card
5. **Risks**: Trials expiring + upcoming renewals in next 30 days
6. **Trials**: Active trials list with countdown
7. **Trial Decision**: Set auto-cancel or conversion rules
8. **Subscription Detail**: Charge history, price timeline, lifetime cost, cancellation difficulty
9. **Cancel Flow**: Guided cancel with proof upload
10. **Confirm Cancel**: Proof summary + mark confirmed
11. **Reallocate**: Choose allocation target after cancellation
12. **Ledger**: Reclaimed this month + allocations

## Testing

### Run Tests

```bash
pnpm test
```

### Manual Testing Checklist

1. **Auth Flow**:
   - Open mobile app
   - Sign in with any provider
   - Verify redirect to Home screen

2. **Wallet**:
   - Navigate to Wallet
   - Swipe through funding instrument cards
   - Select different date ranges (Last 30 / This Month / Last 90)
   - Tap "Review Card Drain"
   - Verify merchant list with correct totals

3. **Trials**:
   - Navigate to Risks or Trials
   - Select a trial
   - Set auto-cancel rule
   - Confirm decision saved

4. **Cancel Flow**:
   - Navigate to Subscription Detail
   - Tap "Cancel Subscription"
   - Follow guided checklist
   - Upload proof (screenshot or email)
   - Confirm cancellation

5. **Ledger**:
   - Navigate to Ledger
   - Verify reclaimed amount updates after cancellation

## Production Deployment

### Environment Variables

Set the following in production:

```env
NODE_ENV=production
DEV_OAUTH_BYPASS=false

# Use strong secrets
JWT_SECRET=<secure-random-string>
ENCRYPTION_KEY=<64-char-hex-string>

# Google Auth Platform client IDs (Web + iOS + Android)
GOOGLE_CLIENT_ID=...
GOOGLE_WEB_CLIENT_ID=...
GOOGLE_IOS_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...

MICROSOFT_CLIENT_ID=...
EXPO_PUBLIC_MICROSOFT_CLIENT_ID=...
APPLE_CLIENT_ID=com.ezer.app
```

### Database

```bash
# Run migrations
pnpm db:migrate:deploy

# DO NOT seed in production
```

### Build & Deploy

```bash
# Build all packages
pnpm build

# Start API
cd apps/api && pnpm start

# Start Worker
cd packages/worker && pnpm start

# Build mobile app
cd apps/mobile && pnpm build
```

## Development Commands

```bash
# Install dependencies
pnpm install

# Start all services
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Clean build artifacts
pnpm clean

# Database commands
pnpm db:migrate     # Run migrations
pnpm db:seed        # Seed demo data
pnpm db:studio      # Open Prisma Studio

# Docker commands
pnpm docker:up      # Start Postgres + Redis
pnpm docker:down    # Stop Postgres + Redis

# Complete setup from scratch
pnpm setup          # Install + Docker + Migrate + Seed
```

## Project Structure Details

### packages/db
Prisma schema with comprehensive data model for auth, wallet, subscriptions, trials, cancellations, and reallocation.

### packages/shared
Zod schemas for validation, TypeScript types, utility functions (merchant normalization, recurrence detection, funding attribution, investment opportunity cost calculation).

### packages/ui
React Native components with theme tokens. Includes Button, Card, Text components with consistent styling.

### apps/api
Fastify server with:
- OAuth routes (Google, Microsoft, Apple)
- Inbox connection routes (Gmail, Outlook, IMAP)
- Wallet routes (funding instruments, drain summaries)
- Core routes (home, risks, trials, subscriptions)
- Cancel routes (attempts, proof upload, confirmation)
- Ingest routes (email, SMS, CSV)
- Simulator routes (dev login, mock inbox)

### packages/worker
BullMQ workers for:
- Email parsing (extract merchant, amount, trial dates, funding hints)
- SMS parsing
- CSV import processing
- Recurrence detection (25-35 day interval for monthly)
- Price history updates
- Risk window computation
- Funding instrument inference

### apps/mobile
Expo React Native app with navigation stack and 12 screens implementing the EZER UX flow.

## Design Principles

- **White/near-white background UI**: Clean, minimal aesthetic
- **One primary action per screen**: Single prominent CTA
- **Numbers > charts**: Plain numbers with red (drain) / green (reclaimed) semantics
- **The app acts**: Not just informative, but actionable (cancel flows, reallocations)

## License

MIT

## Contributing

See CONTRIBUTING.md for development guidelines.

## Support

For issues, please file a GitHub issue at: https://github.com/yourusername/ezer/issues

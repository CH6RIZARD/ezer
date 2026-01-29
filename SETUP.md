# EZER - Complete Setup Guide

This guide walks you through setting up and running EZER locally.

## System Requirements

- **Node.js**: v18.0.0 or higher
- **pnpm**: v8.0.0 or higher
- **Docker**: Latest version
- **Docker Compose**: Latest version

### Check Your Installation

```bash
node --version    # Should be >= v18.0.0
pnpm --version    # Should be >= 8.0.0
docker --version  # Any recent version
docker-compose --version
```

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd ezer
pnpm install
```

This will install all dependencies for all packages in the monorepo.

### 2. Start Infrastructure

Start PostgreSQL and Redis containers:

```bash
pnpm docker:up
```

Wait for containers to be healthy (about 10-15 seconds). You should see:

```
✔ Container ezer-postgres  Healthy
✔ Container ezer-redis     Healthy
```

### 3. Initialize Database

Run Prisma migrations to create the database schema:

```bash
pnpm db:migrate
```

You should see output like:
```
Your database is now in sync with your Prisma schema.
✔ Generated Prisma Client
```

### 4. Seed Demo Data

Populate the database with demo data:

```bash
pnpm db:seed
```

You should see:
```
🌱 Starting seed...
✅ Created user: demo@ezer.app
✅ Created funding instruments
✅ Created merchants
✅ Created subscriptions
✅ Created trials
✅ Created subscription charges and price history
🎉 Seed completed successfully!
```

The seed creates:
- 1 demo user (`demo@ezer.app`)
- 4 funding instruments (3 cards + 1 unknown)
- 8 merchants (Netflix, Spotify, Adobe, NY Times, Gym, ChatGPT, Hulu, Amazon)
- 8 subscriptions (5 active + 3 trials)
- 6 months of charge history
- 2 price creep examples (Netflix, Adobe)

### 5. Start Development Servers

In **separate terminal windows**, run:

#### Terminal 1: API Server
```bash
cd ezer
pnpm --filter @ezer/api dev
```

Wait for:
```
🚀 EZER API running at http://localhost:3001
```

#### Terminal 2: Worker
```bash
cd ezer
pnpm --filter @ezer/worker dev
```

Wait for:
```
🔧 EZER Worker started
📊 Running 7 workers with concurrency 5
```

#### Terminal 3: Mobile App
```bash
cd ezer
pnpm --filter @ezer/mobile dev
```

Wait for Expo to start and display a QR code.

### 6. Open Mobile App

**Option A: Physical Device (Recommended)**
1. Install Expo Go app on your phone:
   - iOS: https://apps.apple.com/app/expo-go/id982107779
   - Android: https://play.google.com/store/apps/details?id=host.exp.exponent
2. Scan the QR code from Terminal 3

**Option B: Emulator/Simulator**
- iOS Simulator (Mac only): Press `i` in Terminal 3
- Android Emulator: Press `a` in Terminal 3

**Option C: Web Browser (Limited)**
- Press `w` in Terminal 3 to open in web browser

## Using the App

### 1. Login (Dev Mode)

On the onboarding screen, select any provider:
- **Continue with Google**
- **Continue with Apple**
- **Continue with Microsoft**

Since `DEV_OAUTH_BYPASS=true`, this will:
1. Create/use demo user (`demo@ezer.app`)
2. Generate a session token
3. Create mock inbox with sample subscription receipts
4. Redirect to Home screen

### 2. Explore Features

**Home Screen**:
- View monthly burn rate (~$169/month from seed data)
- See next 30-day risk (trials + renewals)
- Count of silent subscriptions

**Wallet**:
- Swipe through funding instrument cards
- See which card each subscription drains
- Switch date ranges (Last 30 / This Month / Last 90)

**Trials**:
- View 3 active trials (ChatGPT, Hulu, Amazon)
- Set auto-cancel rules or conversion thresholds

**Risks**:
- See upcoming trial expirations
- See upcoming renewals

**Subscription Detail**:
- View charge history
- See lifetime cost
- Calculate investment opportunity cost (7% annualized)
- View cancellation difficulty

**Cancel Flow**:
- Initiate cancellation
- View guided checklist
- Upload proof screenshot
- Confirm cancellation

## Verify Everything Works

### Health Check

```bash
curl http://localhost:3001/health
```

Should return:
```json
{"status":"ok","timestamp":"2024-01-..."}
```

### Test Simulator Login

```bash
curl -X POST http://localhost:3001/simulator/dev-login \
  -H "Content-Type: application/json" \
  -d '{"provider":"google"}'
```

Should return:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGc...",
    "userId": "...",
    "email": "demo@ezer.app",
    "provider": "google"
  }
}
```

### Test Home Summary

Use the token from above:

```bash
curl http://localhost:3001/home/summary \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

Should return summary with burn rate, risk, etc.

## Troubleshooting

### Docker Issues

**Problem**: Containers won't start

```bash
# Stop all containers
pnpm docker:down

# Remove volumes
docker volume prune

# Start fresh
pnpm docker:up
```

**Problem**: Port already in use (5432 or 6379)

```bash
# Find process using port
lsof -i :5432  # Mac/Linux
netstat -ano | findstr :5432  # Windows

# Kill process or change port in .env
```

### Database Issues

**Problem**: "Can't reach database server"

```bash
# Check Docker containers are running
docker ps

# Should see ezer-postgres and ezer-redis

# Check logs
docker logs ezer-postgres
docker logs ezer-redis
```

**Problem**: Migration errors

```bash
# Reset database (WARNING: deletes all data)
pnpm docker:down
pnpm docker:up
pnpm db:migrate
pnpm db:seed
```

### Mobile App Issues

**Problem**: "Unable to connect to localhost"

If using a physical device, you need to use your computer's IP address:

1. Find your IP:
   - Mac: `ifconfig | grep "inet "`
   - Windows: `ipconfig`
   - Look for something like `192.168.1.X`

2. Update `.env`:
   ```env
   EXPO_PUBLIC_API_URL="http://192.168.1.X:3001"
   ```

3. Restart mobile app

**Problem**: "Network request failed"

- Ensure API is running (`curl http://localhost:3001/health`)
- Check firewall settings
- Ensure device and computer are on same network

### API Issues

**Problem**: 401 Unauthorized

- Token expired (re-login via onboarding)
- Token not sent (check AsyncStorage has token)

**Problem**: CORS errors

- CORS is enabled by default in development
- Check API logs for details

## Advanced Usage

### View Database in Prisma Studio

```bash
pnpm db:studio
```

Opens at http://localhost:5555 to browse data.

### Run Specific Jobs

```bash
# Via API
curl -X POST http://localhost:3001/jobs/run-analysis \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Simulate Auto-Cancel

```bash
# Get trial ID from /trials endpoint, then:
curl -X POST http://localhost:3001/simulator/auto-cancel/TRIAL_ID
```

### Import Transactions

```bash
curl -X POST http://localhost:3001/ingest/csv \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transactions": [
      {
        "date": "2024-01-15",
        "merchant": "Netflix",
        "amount": 15.49
      }
    ]
  }'
```

## Next Steps

- Explore all 12 mobile screens
- Test cancel flow with proof upload
- Experiment with trial decision rules
- Review wallet funding attribution
- Check price history and investment calculations

For production deployment, see README.md.

## Getting Help

- Check logs in each terminal window
- Use `docker logs ezer-postgres` and `docker logs ezer-redis`
- File issues at: https://github.com/yourusername/ezer/issues

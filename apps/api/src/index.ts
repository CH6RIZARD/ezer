// MUST stay the first import. Loads the monorepo-root .env before any module
// that reads process.env at import time — see src/env.ts for why a dotenv call
// in this file's body is too late.
import './env';

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth';
import { accountRoutes } from './routes/account';
import { connectRoutes } from './routes/connect';
import { walletRoutes } from './routes/wallet';
import { coreRoutes } from './routes/core';
import { cancelRoutes } from './routes/cancel';
import { ingestRoutes } from './routes/ingest';
import { jobRoutes } from './routes/jobs';
import { simulatorRoutes } from './routes/simulator';
import { plaidRoutes } from './routes/plaid';
import { cardRoutes } from './routes/cards';
import { savingsRoutes } from './routes/savings';
import { processorWebhookRoutes } from './routes/processorWebhook';
import { ensureUploadsDir } from './utils/storage';

// PORT first: every container platform (Railway, Render, Fly, Heroku) injects
// the port it will route to, and ignoring it means the proxy health-checks a
// port nothing is listening on — the container builds, starts, and is still
// killed as unhealthy. API_PORT stays as the local-dev override.
const PORT = parseInt(process.env.PORT || process.env.API_PORT || '3001', 10);
// Listen on all interfaces by default so physical devices / Expo Go on LAN can reach the API.
const HOST = process.env.API_HOST || '0.0.0.0';

const server = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'info' : 'error',
  },
});

async function start() {
  try {
    // Ensure uploads directory exists
    await ensureUploadsDir();

    // Register plugins
    await server.register(cors, {
      origin: true,
      credentials: true,
    });

    await server.register(multipart, {
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
      },
    });

    await server.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
    });

    // Health check
    server.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Register routes
    await server.register(authRoutes, { prefix: '/auth' });
    await server.register(accountRoutes, { prefix: '/account' });
    await server.register(connectRoutes, { prefix: '/connect' });
    await server.register(walletRoutes, { prefix: '/wallet' });
    await server.register(coreRoutes);
    await server.register(cancelRoutes);
    await server.register(ingestRoutes, { prefix: '/ingest' });
    await server.register(jobRoutes, { prefix: '/jobs' });
    // Simulator routes are a LOGIN BYPASS and are not registered unless
    // explicitly enabled outside production.
    //
    // `/simulator/dev-login` mints a valid JWT for a shared demo@ezer.app user
    // with no credentials — it is what the "Continue with Google" buttons
    // actually call. The handler already checks DEV_OAUTH_BYPASS, but a single
    // env var is the only thing standing between a deployed instance and
    // anonymous sign-in as a real user. One stray `DEV_OAUTH_BYPASS=true` in a
    // Railway variable list and the whole API is open.
    //
    // Gating registration means the routes do not EXIST in production, whatever
    // the environment says.
    const devBypass =
      process.env.NODE_ENV !== 'production' && process.env.DEV_OAUTH_BYPASS === 'true';

    if (devBypass) {
      server.log.warn(
        'DEV_OAUTH_BYPASS is on: /simulator/dev-login can sign in as demo@ezer.app without credentials'
      );
      await server.register(simulatorRoutes, { prefix: '/simulator' });
    }
    await server.register(plaidRoutes, { prefix: '/plaid' });
    await server.register(cardRoutes, { prefix: '/cards' });
    await server.register(savingsRoutes, { prefix: '/savings' });
    // Separate plugin on purpose: its own encapsulation context means the
    // savings auth preHandler cannot reach it. Authenticated by HMAC signature
    // over the raw request bytes, not by a user JWT.
    await server.register(processorWebhookRoutes, { prefix: '/webhooks/processor' });

    // Start server
    await server.listen({ port: PORT, host: HOST });
    console.log(`🚀 EZER API running at http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();

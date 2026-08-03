import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth';
import { connectRoutes } from './routes/connect';
import { walletRoutes } from './routes/wallet';
import { coreRoutes } from './routes/core';
import { cancelRoutes } from './routes/cancel';
import { ingestRoutes } from './routes/ingest';
import { jobRoutes } from './routes/jobs';
import { simulatorRoutes } from './routes/simulator';
import { ensureUploadsDir } from './utils/storage';

const PORT = parseInt(process.env.API_PORT || '3001', 10);
const HOST = process.env.API_HOST || 'localhost';

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
    await server.register(connectRoutes, { prefix: '/connect' });
    await server.register(walletRoutes, { prefix: '/wallet' });
    await server.register(coreRoutes);
    await server.register(cancelRoutes);
    await server.register(ingestRoutes, { prefix: '/ingest' });
    await server.register(jobRoutes, { prefix: '/jobs' });

    // Simulator / demo login is never exposed unless explicitly enabled.
    if (process.env.DEV_OAUTH_BYPASS === 'true') {
      await server.register(simulatorRoutes, { prefix: '/simulator' });
      server.log.warn('DEV_OAUTH_BYPASS=true — simulator routes are enabled. Do not use in production.');
    }

    // Start server
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`🚀 EZER API running at http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();

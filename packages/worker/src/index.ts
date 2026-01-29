import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { parseEmailJob } from './jobs/parseEmail';
import { parseSmsJob } from './jobs/parseSms';
import { parseCsvJob } from './jobs/parseCsv';
import { detectRecurringSubscriptionsJob } from './jobs/detectRecurring';
import { updatePriceHistoryJob } from './jobs/updatePriceHistory';
import { computeRiskWindowJob } from './jobs/computeRiskWindow';
import { inferFundingInstrumentJob } from './jobs/inferFunding';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);

const connection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Define queues
const queues = {
  parseEmail: new Queue('parseEmail', { connection }),
  parseSms: new Queue('parseSms', { connection }),
  parseCsv: new Queue('parseCsv', { connection }),
  detectRecurring: new Queue('detectRecurring', { connection }),
  updatePriceHistory: new Queue('updatePriceHistory', { connection }),
  computeRiskWindow: new Queue('computeRiskWindow', { connection }),
  inferFunding: new Queue('inferFunding', { connection }),
};

// Create workers
const workers = [
  new Worker('parseEmail', parseEmailJob, { connection, concurrency: CONCURRENCY }),
  new Worker('parseSms', parseSmsJob, { connection, concurrency: CONCURRENCY }),
  new Worker('parseCsv', parseCsvJob, { connection, concurrency: CONCURRENCY }),
  new Worker('detectRecurring', detectRecurringSubscriptionsJob, {
    connection,
    concurrency: CONCURRENCY,
  }),
  new Worker('updatePriceHistory', updatePriceHistoryJob, { connection, concurrency: CONCURRENCY }),
  new Worker('computeRiskWindow', computeRiskWindowJob, { connection, concurrency: CONCURRENCY }),
  new Worker('inferFunding', inferFundingInstrumentJob, { connection, concurrency: CONCURRENCY }),
];

// Set up event handlers
workers.forEach((worker) => {
  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} completed in queue ${worker.name}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed in queue ${worker.name}:`, err.message);
  });
});

console.log('🔧 EZER Worker started');
console.log(`📊 Running ${workers.length} workers with concurrency ${CONCURRENCY}`);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down workers...');
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
});

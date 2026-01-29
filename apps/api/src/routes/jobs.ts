import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth';

export async function jobRoutes(server: FastifyInstance) {
  server.addHook('preHandler', authMiddleware);

  // POST /jobs/run-analysis
  server.post('/run-analysis', async (request, reply) => {
    const userId = (request as any).userId;

    // In production, this would queue background jobs:
    // - detectRecurringSubscriptionsJob
    // - updatePriceHistoryJob
    // - computeRiskWindowJob
    // - inferFundingInstrumentJob

    return {
      success: true,
      message: 'Analysis jobs queued. Results will be available shortly.',
    };
  });
}

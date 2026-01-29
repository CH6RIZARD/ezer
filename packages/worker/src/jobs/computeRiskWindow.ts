import { Job } from 'bullmq';
import { prisma } from '@ezer/db';

export async function computeRiskWindowJob(job: Job) {
  const { userId, days = 30 } = job.data;

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + days);

  // Get trials expiring in window
  const trials = await prisma.trial.count({
    where: {
      subscription: {
        userId,
      },
      trialEndDate: {
        gte: new Date(),
        lte: targetDate,
      },
    },
  });

  // Get renewals in window
  const renewals = await prisma.subscription.count({
    where: {
      userId,
      status: 'active',
      renewalDate: {
        gte: new Date(),
        lte: targetDate,
      },
    },
  });

  return { success: true, trials, renewals, totalRisks: trials + renewals };
}

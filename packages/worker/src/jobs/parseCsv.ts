import { Job } from 'bullmq';
import { prisma } from '@ezer/db';

export async function parseCsvJob(job: Job) {
  const { userId } = job.data;

  // Get all transactions for this user that haven't been processed
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      source: 'csv_import',
    },
    orderBy: {
      date: 'asc',
    },
  });

  // This is a placeholder - in production, detectRecurringSubscriptionsJob would handle this
  console.log(`Processing ${transactions.length} CSV transactions for user ${userId}`);

  return { success: true, transactionsCount: transactions.length };
}

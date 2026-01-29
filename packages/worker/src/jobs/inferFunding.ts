import { Job } from 'bullmq';
import { prisma } from '@ezer/db';

export async function inferFundingInstrumentJob(job: Job) {
  const { userId } = job.data;

  // Get all charges with unknown funding instruments
  const unknownInstrument = await prisma.fundingInstrument.findFirst({
    where: {
      userId,
      brand: 'Unknown',
    },
  });

  if (!unknownInstrument) {
    return { success: true, reassignedCount: 0 };
  }

  const charges = await prisma.subscriptionCharge.findMany({
    where: {
      userId,
      fundingInstrumentId: unknownInstrument.id,
    },
    take: 100, // Process in batches
  });

  // In production, this would analyze evidenceRef to extract funding hints
  // and attempt to match them to existing funding instruments
  // For now, it's a placeholder

  return { success: true, reassignedCount: 0, pendingCount: charges.length };
}

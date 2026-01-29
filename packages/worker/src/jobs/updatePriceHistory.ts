import { Job } from 'bullmq';
import { prisma } from '@ezer/db';
import { getCurrentMonthString } from '@ezer/shared';

export async function updatePriceHistoryJob(job: Job) {
  const { userId } = job.data;

  const currentMonth = getCurrentMonthString();

  // Get all active subscriptions
  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId,
      status: { in: ['active', 'trial'] },
    },
  });

  // Update price history for each subscription
  for (const subscription of subscriptions) {
    // Get most recent charge for this subscription
    const recentCharge = await prisma.subscriptionCharge.findFirst({
      where: {
        userId,
        merchantId: subscription.merchantId,
      },
      orderBy: {
        chargeTimestamp: 'desc',
      },
    });

    if (recentCharge) {
      await prisma.priceHistory.upsert({
        where: {
          subscriptionId_month: {
            subscriptionId: subscription.id,
            month: currentMonth,
          },
        },
        create: {
          subscriptionId: subscription.id,
          month: currentMonth,
          amountCents: recentCharge.amountCents,
        },
        update: {
          amountCents: recentCharge.amountCents,
        },
      });
    }
  }

  return { success: true, subscriptionsUpdated: subscriptions.length };
}

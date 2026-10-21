-- Subscription saving is ONE goal per user (SavingsGoal.kind =
-- SUBSCRIPTION_POOL). Smart saving on a subscription adds a source to it; each
-- real charge writes one accrual (unique on chargeId) that the weekly sweep
-- carries. Apply by hand (CLAUDE.md "Migrations do not run on deploy").

-- Enums
CREATE TYPE "SavingsGoalKind" AS ENUM ('STANDARD', 'SUBSCRIPTION_POOL');
CREATE TYPE "SubscriptionSavingMode" AS ENUM ('HALF', 'MATCH');
CREATE TYPE "SubscriptionSavingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- SavingsGoal.kind
ALTER TABLE "SavingsGoal" ADD COLUMN "kind" "SavingsGoalKind" NOT NULL DEFAULT 'STANDARD';

-- At most one pool per user. Not expressible in schema.prisma, so it lives
-- only here; concurrent first enables race on this index and one loses.
CREATE UNIQUE INDEX "SavingsGoal_one_pool_per_user" ON "SavingsGoal" ("userId") WHERE "kind" = 'SUBSCRIPTION_POOL';

-- SubscriptionSavingSource
CREATE TABLE "SubscriptionSavingSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "mode" "SubscriptionSavingMode" NOT NULL,
    "status" "SubscriptionSavingStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionSavingSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionSavingSource_goalId_subscriptionId_key" ON "SubscriptionSavingSource"("goalId", "subscriptionId");
CREATE INDEX "SubscriptionSavingSource_userId_idx" ON "SubscriptionSavingSource"("userId");
CREATE INDEX "SubscriptionSavingSource_subscriptionId_idx" ON "SubscriptionSavingSource"("subscriptionId");

ALTER TABLE "SubscriptionSavingSource" ADD CONSTRAINT "SubscriptionSavingSource_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubscriptionSavingSource" ADD CONSTRAINT "SubscriptionSavingSource_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SubscriptionSavingAccrual
CREATE TABLE "SubscriptionSavingAccrual" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sweptTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionSavingAccrual_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionSavingAccrual_amountCents_positive" CHECK ("amountCents" > 0)
);

CREATE UNIQUE INDEX "SubscriptionSavingAccrual_chargeId_key" ON "SubscriptionSavingAccrual"("chargeId");
CREATE INDEX "SubscriptionSavingAccrual_sourceId_idx" ON "SubscriptionSavingAccrual"("sourceId");
CREATE INDEX "SubscriptionSavingAccrual_sweptTransferId_idx" ON "SubscriptionSavingAccrual"("sweptTransferId");

ALTER TABLE "SubscriptionSavingAccrual" ADD CONSTRAINT "SubscriptionSavingAccrual_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "SubscriptionSavingSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

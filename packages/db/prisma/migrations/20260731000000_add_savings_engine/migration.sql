-- CreateEnum
CREATE TYPE "FundingSourceStatus" AS ENUM ('ACTIVE', 'LOGIN_REQUIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AllocationMode" AS ENUM ('FIXED', 'ADAPTIVE');

-- CreateEnum
CREATE TYPE "AllocationCadence" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'PAYDAY');

-- CreateEnum
CREATE TYPE "InternalAccountKind" AS ENUM ('AVAILABLE', 'GOAL', 'IN_TRANSIT', 'FBO_CASH');

-- CreateEnum
CREATE TYPE "TransferDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'SUBMITTED', 'POSTED', 'SETTLED', 'FAILED', 'RETURNED', 'CANCELED');

-- CreateTable
CREATE TABLE "FundingSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plaidItemId" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "accessTokenRef" TEXT NOT NULL,
    "processorToken" TEXT,
    "mask" TEXT,
    "subtype" TEXT,
    "status" "FundingSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "targetDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SavingsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalAllocationRule" (
    "goalId" TEXT NOT NULL,
    "mode" "AllocationMode" NOT NULL DEFAULT 'ADAPTIVE',
    "cadence" "AllocationCadence" NOT NULL DEFAULT 'WEEKLY',
    "fixedAmountCents" INTEGER,
    "maxPeriodCents" INTEGER,
    "aggressiveness" DECIMAL(3,2) NOT NULL DEFAULT 0.50,

    CONSTRAINT "GoalAllocationRule_pkey" PRIMARY KEY ("goalId")
);

-- CreateTable
CREATE TABLE "SavingsSettings" (
    "userId" TEXT NOT NULL,
    "minCheckingCents" INTEGER NOT NULL DEFAULT 10000,
    "maxWeeklyCents" INTEGER NOT NULL DEFAULT 50000,
    "pausedUntil" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "InternalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "InternalAccountKind" NOT NULL,
    "goalId" TEXT,

    CONSTRAINT "InternalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "direction" "TransferDirection" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "externalId" TEXT,
    "returnCode" TEXT,
    "settlesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsLedgerEntry" (
    "id" BIGSERIAL NOT NULL,
    "transferId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavingsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SweepRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "decided" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SweepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessorWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawBody" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "ProcessorWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FundingSource_userId_isPrimary_idx" ON "FundingSource"("userId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "FundingSource_userId_plaidAccountId_key" ON "FundingSource"("userId", "plaidAccountId");

-- CreateIndex
CREATE INDEX "SavingsGoal_userId_status_idx" ON "SavingsGoal"("userId", "status");

-- CreateIndex
CREATE INDEX "InternalAccount_userId_idx" ON "InternalAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "InternalAccount_userId_kind_goalId_key" ON "InternalAccount"("userId", "kind", "goalId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_idempotencyKey_key" ON "Transfer"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_externalId_key" ON "Transfer"("externalId");

-- CreateIndex
CREATE INDEX "Transfer_userId_status_idx" ON "Transfer"("userId", "status");

-- CreateIndex
CREATE INDEX "Transfer_goalId_idx" ON "Transfer"("goalId");

-- CreateIndex
CREATE INDEX "SavingsLedgerEntry_accountId_idx" ON "SavingsLedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "SavingsLedgerEntry_transferId_idx" ON "SavingsLedgerEntry"("transferId");

-- CreateIndex
CREATE INDEX "SweepRun_userId_idx" ON "SweepRun"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SweepRun_userId_periodKey_key" ON "SweepRun"("userId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessorWebhookEvent_eventId_key" ON "ProcessorWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "ProcessorWebhookEvent_receivedAt_idx" ON "ProcessorWebhookEvent"("receivedAt");

-- AddForeignKey
ALTER TABLE "FundingSource" ADD CONSTRAINT "FundingSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsGoal" ADD CONSTRAINT "SavingsGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalAllocationRule" ADD CONSTRAINT "GoalAllocationRule_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsSettings" ADD CONSTRAINT "SavingsSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAccount" ADD CONSTRAINT "InternalAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalAccount" ADD CONSTRAINT "InternalAccount_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "SavingsGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsLedgerEntry" ADD CONSTRAINT "SavingsLedgerEntry_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsLedgerEntry" ADD CONSTRAINT "SavingsLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "InternalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SweepRun" ADD CONSTRAINT "SweepRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


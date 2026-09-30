-- Pay in 4 installment charging engine + purpose-tagging FundingSource,
-- mirroring FundingInstrument.purpose so installmentEngine.ts can prefer a
-- bank the user linked specifically to repay Pay in 4.

-- FundingSource.purpose
ALTER TABLE "FundingSource" ADD COLUMN "purpose" TEXT;

-- Enums
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETE', 'DEFAULTED');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'PAID', 'MISSED', 'CURED');

-- InstallmentPlan
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InstallmentPlan_userId_status_idx" ON "InstallmentPlan"("userId", "status");

ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Installment
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "n" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "missedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Installment_planId_n_key" ON "Installment"("planId", "n");
CREATE INDEX "Installment_planId_idx" ON "Installment"("planId");
CREATE INDEX "Installment_userId_status_idx" ON "Installment"("userId", "status");
CREATE INDEX "Installment_status_dueDate_idx" ON "Installment"("status", "dueDate");

ALTER TABLE "Installment" ADD CONSTRAINT "Installment_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Transfer.installmentId
ALTER TABLE "Transfer" ADD COLUMN "installmentId" TEXT;
CREATE INDEX "Transfer_installmentId_idx" ON "Transfer"("installmentId");

ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_installmentId_fkey"
    FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

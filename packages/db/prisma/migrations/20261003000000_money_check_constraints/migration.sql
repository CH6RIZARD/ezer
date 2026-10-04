-- Money sanity at the database layer: app-level validation already rejects
-- these, but a CHECK constraint is the one validator every future code path
-- (scripts, consoles, bugs) goes through.

-- A transfer or an installment leg is always a positive amount.
ALTER TABLE "Transfer"
    ADD CONSTRAINT "Transfer_amountCents_positive" CHECK ("amountCents" > 0);

ALTER TABLE "Installment"
    ADD CONSTRAINT "Installment_amountCents_positive" CHECK ("amountCents" > 0);

-- Ledger entries are SIGNED (reversals are negative rows), so only zero is
-- impossible — a zero row moves nothing and breaks the sum-to-zero audit.
ALTER TABLE "SavingsLedgerEntry"
    ADD CONSTRAINT "SavingsLedgerEntry_amountCents_nonzero" CHECK ("amountCents" <> 0);

-- CardAccessList is append-only and read "latest decision per user" — index
-- that scan. (Mirrored in schema.prisma's @@index([userId, createdAt]).)
CREATE INDEX "CardAccessList_userId_createdAt_idx" ON "CardAccessList"("userId", "createdAt");

-- Durable consent record.
--
-- Both columns are NULLABLE on purpose. Accounts created before this migration
-- genuinely have no consent record; backfilling a timestamp would fabricate
-- evidence that a user agreed to something at a moment they did not.
ALTER TABLE "User" ADD COLUMN "consentedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "consentVersion" TEXT;

-- Age gate (18+). Nullable: pre-gate accounts have no record.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfBirth" DATE;

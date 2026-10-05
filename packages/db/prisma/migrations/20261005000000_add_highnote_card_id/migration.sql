-- Highnote payment card id for Pay in 4 collaborative authorization.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "highnoteCardId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_highnoteCardId_key" ON "User"("highnoteCardId");

-- Highnote payment card id for Pay in 4 collaborative authorization.
ALTER TABLE "User" ADD COLUMN "highnoteCardId" TEXT;
CREATE UNIQUE INDEX "User_highnoteCardId_key" ON "User"("highnoteCardId");

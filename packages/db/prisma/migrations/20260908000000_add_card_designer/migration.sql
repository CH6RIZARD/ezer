-- Card designer persistence.
--
-- Replaces two in-process Maps in routes/cards.ts. Every deploy erased them,
-- and Railway deploys on every push to main.
--
-- "userId" is TEXT with no foreign key on purpose: designing a card is a
-- pre-account action and resolveUserId() returns the literal 'anonymous' when
-- the request carries no token.

CREATE TABLE "CardDesign" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "finish"    TEXT NOT NULL,
    "strokes"   JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardDesign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardAccessList" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "designId"   TEXT,
    "mode"       TEXT NOT NULL,
    "status"     TEXT NOT NULL,
    "limitCents" INTEGER,
    "trustScore" INTEGER,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardAccessList_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CardDesign_userId_idx"     ON "CardDesign"("userId");
CREATE INDEX "CardAccessList_userId_idx" ON "CardAccessList"("userId");

-- SET NULL, not CASCADE: an approval decision outlives the artwork it was
-- made against. Deleting a design must not erase the record of a credit
-- decision.
ALTER TABLE "CardAccessList"
  ADD CONSTRAINT "CardAccessList_designId_fkey"
  FOREIGN KEY ("designId") REFERENCES "CardDesign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

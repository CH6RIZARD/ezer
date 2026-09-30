-- Turn 3: Settings > Linked banks — one Pay in 4 funding account, per-bank
-- subscription-read flag, and the FundingInstrument -> PlaidItem grouping
-- both features need.

-- User.payIn4InstrumentId
ALTER TABLE "User" ADD COLUMN "payIn4InstrumentId" TEXT;

-- PlaidItem.readForSubscriptions
ALTER TABLE "PlaidItem" ADD COLUMN "readForSubscriptions" BOOLEAN NOT NULL DEFAULT true;

-- FundingInstrument.subtype, FundingInstrument.itemId
ALTER TABLE "FundingInstrument" ADD COLUMN "subtype" TEXT;
ALTER TABLE "FundingInstrument" ADD COLUMN "itemId" TEXT;
CREATE INDEX "FundingInstrument_itemId_idx" ON "FundingInstrument"("itemId");

ALTER TABLE "FundingInstrument" ADD CONSTRAINT "FundingInstrument_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "PlaidItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

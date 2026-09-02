-- Tags, second edition: who a piece is cut for, its proportion and make, a note and care.
ALTER TABLE "WardrobeItem"
  ADD COLUMN "cutFor" TEXT,
  ADD COLUMN "secondaryColor" TEXT,
  ADD COLUMN "fit" TEXT,
  ADD COLUMN "length" TEXT,
  ADD COLUMN "texture" TEXT,
  ADD COLUMN "weight" TEXT,
  ADD COLUMN "occasions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "details" JSONB,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "care" TEXT;

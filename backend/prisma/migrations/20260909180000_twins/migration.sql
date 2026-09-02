-- Twins: a piece that looks like one already in the closet.
ALTER TABLE "WardrobeItem"
  ADD COLUMN "twinOfId" TEXT,
  ADD COLUMN "twinScore" DOUBLE PRECISION,
  ADD COLUMN "twinResolvedAt" TIMESTAMP(3),
  ADD COLUMN "twinDismissed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "fingerprint" TEXT;

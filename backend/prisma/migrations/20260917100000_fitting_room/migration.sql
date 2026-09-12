-- The Fitting Room: shop-link candidates and optional measurements.
ALTER TABLE "WardrobeItem"
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "canonicalUrl" TEXT,
  ADD COLUMN "retailer" TEXT,
  ADD COLUMN "productName" TEXT,
  ADD COLUMN "currency" TEXT,
  ADD COLUMN "listPrice" DOUBLE PRECISION,
  ADD COLUMN "salePrice" DOUBLE PRECISION,
  ADD COLUMN "chosenColour" TEXT,
  ADD COLUMN "chosenSize" TEXT,
  ADD COLUMN "sizeOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "availability" TEXT,
  ADD COLUMN "sourceImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lastCheckedAt" TIMESTAMP(3),
  ADD COLUMN "ingestSource" TEXT,
  ADD COLUMN "extraction" JSONB,
  ADD COLUMN "verdictVersion" INTEGER,
  ADD COLUMN "gapOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tryOnUrl" TEXT;

ALTER TABLE "StyleProfile" ADD COLUMN "measurements" JSONB;

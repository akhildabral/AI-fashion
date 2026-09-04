-- The taste layer: raw style events and the derived per-member profile.

-- CreateTable
CREATE TABLE "StyleEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT,
    "slot" TEXT,
    "outId" TEXT,
    "inId" TEXT,
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outfitId" TEXT,
    "rating" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TasteProfile" (
    "userId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "colourAffinity" JSONB NOT NULL,
    "formalityOffset" JSONB NOT NULL,
    "pairAffinity" JSONB NOT NULL,
    "silhouette" JSONB NOT NULL,
    "shoeHabits" JSONB NOT NULL,
    "layering" JSONB NOT NULL,
    "favouriteOutfits" JSONB NOT NULL,
    "facts" JSONB NOT NULL,
    "dismissedFacts" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "TasteProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "StyleEvent_userId_occurredOn_idx" ON "StyleEvent"("userId", "occurredOn");

-- AddForeignKey
ALTER TABLE "StyleEvent" ADD CONSTRAINT "StyleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TasteProfile" ADD CONSTRAINT "TasteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

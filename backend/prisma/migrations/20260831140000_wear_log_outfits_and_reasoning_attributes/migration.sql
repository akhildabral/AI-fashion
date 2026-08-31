-- AlterTable
ALTER TABLE "WardrobeItem" ADD COLUMN     "attrConfidence" JSONB,
ADD COLUMN     "colorPalette" JSONB,
ADD COLUMN     "formalityScore" INTEGER,
ADD COLUMN     "layerRole" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'clean',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "warmthValue" INTEGER;

-- CreateTable
CREATE TABLE "Outfit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemIds" TEXT[],
    "rationale" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'work',
    "provenance" TEXT NOT NULL DEFAULT 'ai',
    "rating" INTEGER,
    "wearCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outfit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WearLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outfitId" TEXT,
    "itemIds" TEXT[],
    "wornOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT,
    "weather" JSONB,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WearLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outfit_userId_idx" ON "Outfit"("userId");

-- CreateIndex
CREATE INDEX "WearLog_userId_wornOn_idx" ON "WearLog"("userId", "wornOn");

-- AddForeignKey
ALTER TABLE "Outfit" ADD CONSTRAINT "Outfit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WearLog" ADD CONSTRAINT "WearLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WearLog" ADD CONSTRAINT "WearLog_outfitId_fkey" FOREIGN KEY ("outfitId") REFERENCES "Outfit"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "WearLog" ADD COLUMN "featuredAt" TIMESTAMP(3);

CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "activities" TEXT,
    "packedItemIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Trip_userId_startDate_idx" ON "Trip"("userId", "startDate");
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Lookbook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tryOnIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lookbook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Lookbook_userId_idx" ON "Lookbook"("userId");
ALTER TABLE "Lookbook" ADD CONSTRAINT "Lookbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

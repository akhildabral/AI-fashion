-- What you really wore: a photo of the day, read into pieces.
ALTER TABLE "WearLog" ADD COLUMN "suggestedItemIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WearLog" ADD COLUMN "woreInstead" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WearPhotoJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "photoUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "rows" JSONB,
  "error" TEXT,
  "confirmedLogId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WearPhotoJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WearPhotoJob_userId_date_idx" ON "WearPhotoJob"("userId", "date");
ALTER TABLE "WearPhotoJob" ADD CONSTRAINT "WearPhotoJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

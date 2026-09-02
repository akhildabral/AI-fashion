CREATE TABLE "UserPhoto" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "consentAt" TIMESTAMP(3) NOT NULL,
  "consentVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserPhoto_userId_idx" ON "UserPhoto"("userId");
ALTER TABLE "UserPhoto" ADD CONSTRAINT "UserPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TryOn" ADD COLUMN "photoPath" TEXT;

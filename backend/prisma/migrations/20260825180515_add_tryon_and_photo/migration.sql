-- AlterTable
ALTER TABLE "User" ADD COLUMN     "photoPath" TEXT;

-- CreateTable
CREATE TABLE "TryOn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lookId" TEXT,
    "imageUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TryOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TryOn_userId_idx" ON "TryOn"("userId");

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TryOn" ADD CONSTRAINT "TryOn_lookId_fkey" FOREIGN KEY ("lookId") REFERENCES "Look"("id") ON DELETE SET NULL ON UPDATE CASCADE;

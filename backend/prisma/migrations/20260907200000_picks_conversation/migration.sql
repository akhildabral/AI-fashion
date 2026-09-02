-- AlterTable
ALTER TABLE "FriendPick" ADD COLUMN     "forDay" TEXT,
ADD COLUMN     "thanksAt" TIMESTAMP(3),
ADD COLUMN     "reply" TEXT,
ADD COLUMN     "wornLogId" TEXT,
ADD COLUMN     "wornAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FriendPick_byUserId_idx" ON "FriendPick"("byUserId");

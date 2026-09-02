CREATE TABLE "LookReaction" (
    "id" TEXT NOT NULL,
    "wearLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LookReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LookReaction_wearLogId_userId_key" ON "LookReaction"("wearLogId", "userId");
CREATE INDEX "LookReaction_userId_idx" ON "LookReaction"("userId");
ALTER TABLE "LookReaction" ADD CONSTRAINT "LookReaction_wearLogId_fkey" FOREIGN KEY ("wearLogId") REFERENCES "WearLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LookReaction" ADD CONSTRAINT "LookReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

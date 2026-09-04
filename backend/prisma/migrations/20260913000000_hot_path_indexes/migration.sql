-- CreateIndex
CREATE INDEX "WearLog_sharedAt_idx" ON "WearLog"("sharedAt");

-- CreateIndex
CREATE INDEX "WearLog_featuredAt_sharedAt_idx" ON "WearLog"("featuredAt", "sharedAt");

-- CreateIndex
CREATE INDEX "Poll_expiresAt_settledNotifiedAt_idx" ON "Poll"("expiresAt", "settledNotifiedAt");

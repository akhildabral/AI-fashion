ALTER TABLE "DailyBrief" ADD COLUMN "eventType" TEXT;
ALTER TABLE "DailyBrief" ADD COLUMN "rest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyBrief" ADD COLUMN "plannedAt" TIMESTAMP(3);
ALTER TABLE "DailyBrief" ADD COLUMN "weatherCheckedAt" TIMESTAMP(3);
ALTER TABLE "PushSubscription" ADD COLUMN "eveningPush" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PushSubscription" ADD COLUMN "lastEveningOn" TEXT;

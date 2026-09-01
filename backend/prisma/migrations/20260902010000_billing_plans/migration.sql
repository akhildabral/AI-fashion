-- User billing columns
ALTER TABLE "User" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN "planStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "User" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "gatewayCustomerId" TEXT;
ALTER TABLE "User" ADD COLUMN "gatewaySubscriptionId" TEXT;

-- Grandfather everyone approved before billing existed onto the founder plan
-- (Pro-level limits, no charge) so nothing changes for the waitlist cohort.
UPDATE "User" SET "plan" = 'founder' WHERE "status" = 'approved';

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "gateway" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingEvent_eventId_key" ON "BillingEvent"("eventId");
CREATE INDEX "BillingEvent_userId_createdAt_idx" ON "BillingEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingEvent" ADD CONSTRAINT "BillingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

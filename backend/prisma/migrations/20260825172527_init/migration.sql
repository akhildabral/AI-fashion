-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bodyType" TEXT,
    "heightCm" INTEGER,
    "sizes" JSONB,
    "skinTone" TEXT,
    "styleVibe" TEXT,
    "budgetBand" TEXT,
    "avoidColors" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Look" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occasion" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "outfit" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Look_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfile_userId_key" ON "StyleProfile"("userId");

-- CreateIndex
CREATE INDEX "Look_userId_idx" ON "Look"("userId");

-- AddForeignKey
ALTER TABLE "StyleProfile" ADD CONSTRAINT "StyleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Look" ADD CONSTRAINT "Look_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

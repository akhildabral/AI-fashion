-- Invalidate all issued JWTs at once (logout / password reset / suspension).
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'circle',
ADD COLUMN     "audienceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

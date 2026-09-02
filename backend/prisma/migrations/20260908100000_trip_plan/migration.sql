-- A trip keeps its plan and its checklist.
ALTER TABLE "Trip" ADD COLUMN "plan" JSONB;
ALTER TABLE "Trip" ADD COLUMN "checked" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- The Mirror's second look: the fidelity verdict stored with each render,
-- and whether a reflection is full-length, judged once and remembered.
-- Both optional; older rows stay null.

-- AlterTable
ALTER TABLE "TryOn" ADD COLUMN     "fidelity" JSONB;

-- AlterTable
ALTER TABLE "UserPhoto" ADD COLUMN     "fullLength" BOOLEAN;

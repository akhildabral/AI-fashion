-- Colour harmony (family and vividness derived from the stored LAB palette)
-- and the wearability second pass (pattern scale, sheer, dress code, needs a
-- layer, shoe type). All optional; older rows are derived on read.

-- AlterTable
ALTER TABLE "WardrobeItem" ADD COLUMN     "colourFamily" TEXT,
ADD COLUMN     "colourVividness" TEXT,
ADD COLUMN     "patternScale" TEXT,
ADD COLUMN     "sheer" BOOLEAN,
ADD COLUMN     "dressCode" TEXT,
ADD COLUMN     "needsLayer" BOOLEAN,
ADD COLUMN     "shoeType" TEXT;

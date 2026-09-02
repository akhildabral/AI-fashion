-- A piece cut from a group photo keeps its own crop as its original.
ALTER TABLE "WardrobeItem" ADD COLUMN "cropped" BOOLEAN NOT NULL DEFAULT false;

-- Recensioni in controllo prima della pubblicazione (collaudo P-01).
ALTER TABLE "reviews" ADD COLUMN "heldAt" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "heldReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "reviews_heldAt_idx" ON "reviews"("heldAt");

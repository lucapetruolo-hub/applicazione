-- Foto del cliente nelle recensioni della home, dopo il controllo con Claude Haiku
-- (docs/changelog/2026-11-19-foto-recensioni-in-home.md). Solo colonne nuove.
ALTER TABLE "reviews" ADD COLUMN "homePhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "reviews" ADD COLUMN "homePhotosCheckedAt" TIMESTAMP(3);

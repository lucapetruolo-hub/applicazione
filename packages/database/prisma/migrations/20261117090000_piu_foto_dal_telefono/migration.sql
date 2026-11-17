-- Più foto con lo stesso codice di "Scatta dal telefono"
-- (docs/changelog/2026-11-17-piu-foto-dal-telefono.md). Solo colonne e tabella nuove:
-- le colonne "photo" e "mediaType" di photo_handoffs restano, non più usate.
-- AlterTable
ALTER TABLE "photo_handoffs" ADD COLUMN "maxPhotos" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "sentCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "photo_handoff_photos" (
    "id" BIGSERIAL NOT NULL,
    "codeHash" TEXT NOT NULL,
    "photo" BYTEA NOT NULL,
    "mediaType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_handoff_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "photo_handoff_photos_codeHash_idx" ON "photo_handoff_photos"("codeHash");

-- CreateIndex
CREATE INDEX "photo_handoff_photos_createdAt_idx" ON "photo_handoff_photos"("createdAt");

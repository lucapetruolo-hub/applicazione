-- Foto dal telefono al computer col codice QR
-- (docs/changelog/2026-11-16-scatta-dal-telefono.md). Solo una tabella nuova.
-- CreateTable
CREATE TABLE "photo_handoffs" (
    "codeHash" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "photo" BYTEA,
    "mediaType" TEXT,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_handoffs_pkey" PRIMARY KEY ("codeHash")
);

-- CreateIndex
CREATE INDEX "photo_handoffs_expiresAt_idx" ON "photo_handoffs"("expiresAt");

-- La data di nascita nel profilo dell'account non la usa più nessuno
-- (minimizzazione, GDPR art. 5; collaudo del 29/10/2026, M-15): si cancella
-- quella già salvata. La colonna resta, vuota, per non toccare lo schema.
UPDATE "users" SET "birthDate" = NULL WHERE "birthDate" IS NOT NULL;

-- Avviso del cambio dei Termini, una volta per versione.
CREATE TABLE "terms_change_notices" (
    "version" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "lastUserId" TEXT,
    "sentCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "terms_change_notices_pkey" PRIMARY KEY ("version")
);

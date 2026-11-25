-- Limiti stretti al minuto condivisi tra le copie dell'API (docs/changelog/2026-11-25-correzioni-test-sicurezza.md).
CREATE TABLE "rate_limit_hits" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "rate_limit_hits_expiresAt_idx" ON "rate_limit_hits"("expiresAt");

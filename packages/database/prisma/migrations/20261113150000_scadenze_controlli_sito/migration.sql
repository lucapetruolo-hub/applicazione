-- Scadenze del sito e controllo notturno (docs/changelog/2026-11-13-admin-scadenze-controlli.md).
CREATE TABLE "site_deadlines" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "dueAt" DATE NOT NULL,
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_deadlines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "site_deadlines_doneAt_dueAt_idx" ON "site_deadlines"("doneAt", "dueAt");

CREATE TABLE "site_checks" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "problem" TEXT,
    "techNote" TEXT,
    "failingSince" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_checks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_checks_key_key" ON "site_checks"("key");

-- La prima scadenza già nota: il database gratuito su Render viene cancellato
-- il 5/12/2026 (scelta di Luca del 5/11/2026, piano da cambiare prima).
INSERT INTO "site_deadlines" ("id", "title", "note", "dueAt")
VALUES (
    'b6c1f6a2-3d4e-4f7a-9b2c-5d8e1f0a7c31',
    'Il database del sito scade: passalo al piano a pagamento',
    'Il piano gratuito cancella tutti i dati del sito il 5 dicembre. Il piano Basic costa circa 6 € al mese. Chiedi a Claude di aiutarti.',
    '2026-12-05'
);

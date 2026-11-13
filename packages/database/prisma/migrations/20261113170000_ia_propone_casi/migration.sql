-- L'IA propone la decisione nei casi di Da fare (docs/changelog/2026-11-13-admin-ia-propone.md).
ALTER TABLE "reviews" ADD COLUMN "correctionRequestedAt" TIMESTAMP(3);

CREATE TABLE "admin_case_advice" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ground" TEXT,
    "note" TEXT,
    "draft" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminDecision" TEXT,
    "adminDecidedAt" TIMESTAMP(3),
    "agrees" BOOLEAN,

    CONSTRAINT "admin_case_advice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_case_advice_kind_caseId_key" ON "admin_case_advice"("kind", "caseId");
CREATE INDEX "admin_case_advice_kind_adminDecidedAt_idx" ON "admin_case_advice"("kind", "adminDecidedAt");

-- Promemoria in Scadenze e controlli (decisione di Luca del 13/11/2026): dopo un mese si rileggono i casi in cui l'admin ha deciso diversamente dall'IA.
INSERT INTO "site_deadlines" ("id", "title", "note", "dueAt")
VALUES (
    'e3a9c7d1-5b2f-4e8a-a6d4-2c7f9b1e0d58',
    'Rileggi le proposte dell''IA che hai cambiato',
    'Apri Impostazioni, Proposte dell''IA: guarda le volte in cui hai deciso diversamente. Poi chiedi a Claude di migliorare le istruzioni dell''IA con quei casi.',
    '2026-12-13'
);

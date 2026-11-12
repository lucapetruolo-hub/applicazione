-- Tempo e esito della risposta dell'IA per ogni ricerca dubbia, per Admin › Mestieri richiesti
-- (docs/changelog/2026-11-12-attesa-ia-5-secondi.md).
ALTER TABLE "problem_descriptions" ADD COLUMN "aiMs" INTEGER;
ALTER TABLE "problem_descriptions" ADD COLUMN "aiOutcome" TEXT;

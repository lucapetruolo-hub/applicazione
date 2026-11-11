-- Mestiere che il sito non ha, scritto dall'IA quando nessun mestiere va bene
-- (docs/changelog/2026-11-11-mestieri-che-mancano.md).
ALTER TABLE "problem_descriptions" ADD COLUMN "missingTrade" TEXT;

-- Il cliente segnala la proposta dell'intelligenza artificiale (docs/changelog/2026-11-13-segnala-risposta-ia.md). Solo additiva.
ALTER TABLE "problem_descriptions" ADD COLUMN "reportedAt" TIMESTAMP(3);
ALTER TABLE "problem_descriptions" ADD COLUMN "reportReason" TEXT;
ALTER TABLE "problem_descriptions" ADD COLUMN "reportNote" TEXT;
CREATE INDEX "problem_descriptions_reportedAt_idx" ON "problem_descriptions"("reportedAt");

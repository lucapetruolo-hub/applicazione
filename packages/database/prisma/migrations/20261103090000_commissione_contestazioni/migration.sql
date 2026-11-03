-- Commissione di Stripe delle contestazioni presa dal saldo del professionista
-- (docs/changelog/2026-11-03-commissione-contestazioni.md).
ALTER TABLE "job_payments" ADD COLUMN "disputeFees" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "job_payments" ADD COLUMN "releaseDisputeFeeEurCents" INTEGER NOT NULL DEFAULT 0;

-- Pagamenti dei lavori addebitati direttamente sul conto del professionista (docs/CHANGELOG.md §261).
ALTER TABLE "job_payments" ADD COLUMN "stripeDirectCharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "professional_fiscal_profiles" ADD COLUMN "stripeNegativeDebitAt" TIMESTAMP(3);

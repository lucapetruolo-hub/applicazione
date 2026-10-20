-- Rimborso a livelli, contestazioni riprese subito dal professionista e costi
-- Stripe Connect a suo carico (docs/CHANGELOG.md §260).
ALTER TABLE "job_issues" ADD COLUMN "refundPercent" INTEGER;

ALTER TABLE "job_payments" ADD COLUMN "disputeRecoveredEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "disputeReturnTransferId" TEXT,
ADD COLUMN "professionalDebtEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "connectFeesEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "connectMonthlyFeeMonth" TEXT;

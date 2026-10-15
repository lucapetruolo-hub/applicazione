-- Soldi dei pagamenti online bloccati sul conto Stripe del professionista (docs/CHANGELOG.md §243).
ALTER TABLE "job_payments" ADD COLUMN "stripeDestinationAccountId" TEXT;
ALTER TABLE "job_payments" ADD COLUMN "applicationFeeEurCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "job_payments" ADD COLUMN "payoutPendingEurCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "job_payments" ADD COLUMN "payoutSentEurCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "job_payments" ADD COLUMN "stripePayoutId" TEXT;
ALTER TABLE "job_payments" ADD COLUMN "payoutSentAt" TIMESTAMP(3);
ALTER TABLE "job_payments" ADD COLUMN "payoutPaidAt" TIMESTAMP(3);
ALTER TABLE "job_payments" ADD COLUMN "payoutFailedAt" TIMESTAMP(3);
ALTER TABLE "job_payments" ADD COLUMN "payoutFailureMessage" TEXT;

ALTER TABLE "professional_fiscal_profiles" ADD COLUMN "stripeManualPayoutsAt" TIMESTAMP(3);

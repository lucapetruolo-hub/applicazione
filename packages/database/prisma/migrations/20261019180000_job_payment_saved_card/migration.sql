-- Saldo addebitato da solo sulla carta salvata con l'acconto (docs/CHANGELOG.md §260).
ALTER TABLE "job_payments" ADD COLUMN "clientStripeCustomerId" TEXT,
ADD COLUMN "savedPaymentMethodId" TEXT,
ADD COLUMN "balanceAutoChargedAt" TIMESTAMP(3),
ADD COLUMN "balanceAutoChargeFailedAt" TIMESTAMP(3);

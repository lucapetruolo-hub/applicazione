-- AlterEnum
ALTER TYPE "JobIssueStatus" ADD VALUE 'UNRESOLVED';

-- AlterTable
ALTER TABLE "job_payments" ADD COLUMN     "balancePaidAt" TIMESTAMP(3),
ADD COLUMN     "balancePaymentIntentId" TEXT,
ADD COLUMN     "balanceUnpaidAt" TIMESTAMP(3),
ADD COLUMN     "depositEurCents" INTEGER,
ADD COLUMN     "depositPaidAt" TIMESTAMP(3),
ADD COLUMN     "onlineStage" TEXT,
ADD COLUMN     "paidEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "releaseDueAt" TIMESTAMP(3),
ADD COLUMN     "releasedAt" TIMESTAMP(3),
ADD COLUMN     "stripeFeeEurCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_balancePaymentIntentId_key" ON "job_payments"("balancePaymentIntentId");

-- Commissione Manovia sui pagamenti online: 5% (decisione dell'utente,
-- docs/CHANGELOG.md §168), al posto del 10% di prova seminato all'inizio.
UPDATE "platform_fee_rules" SET "percentageBasisPoints" = 500 WHERE "name" = 'Commissione standard (default)' AND "percentageBasisPoints" = 1000;

-- AlterTable
ALTER TABLE "job_payments" ADD COLUMN     "stripeDisputeId" TEXT,
ADD COLUMN     "stripeDisputeStatus" TEXT,
ADD COLUMN     "stripeDisputedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_stripeDisputeId_key" ON "job_payments"("stripeDisputeId");


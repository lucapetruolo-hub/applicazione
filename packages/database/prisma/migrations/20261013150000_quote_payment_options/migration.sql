-- AlterTable
ALTER TABLE "job_payments" ADD COLUMN     "balanceDirect" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "depositPercent" INTEGER,
ADD COLUMN     "paymentOptions" TEXT[] DEFAULT ARRAY[]::TEXT[];


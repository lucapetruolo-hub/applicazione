-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3);

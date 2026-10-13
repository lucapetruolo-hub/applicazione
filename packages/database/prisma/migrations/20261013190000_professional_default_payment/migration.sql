-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "defaultDepositPercent" INTEGER,
ADD COLUMN     "defaultPaymentOptions" TEXT[] DEFAULT ARRAY[]::TEXT[];


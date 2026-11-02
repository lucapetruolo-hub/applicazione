-- AlterTable
ALTER TABLE "suspicious_accounts" ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedById" TEXT,
ADD COLUMN     "dismissedNote" TEXT,
ADD COLUMN     "dismissedSignals" JSONB;

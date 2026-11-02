-- AlterTable
ALTER TABLE "suspicious_accounts" ADD COLUMN     "archiveReason" TEXT,
ADD COLUMN     "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- I "Va bene così" già dati restano tali.
UPDATE "suspicious_accounts" SET "archiveReason" = 'OK' WHERE "dismissedAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signupEntityType" "ProfessionalEntityType",
ADD COLUMN     "emailCodeHash" TEXT,
ADD COLUMN     "emailCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailCodeSentAt" TIMESTAMP(3);

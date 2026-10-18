-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordResetCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passwordResetCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetCodeHash" TEXT;

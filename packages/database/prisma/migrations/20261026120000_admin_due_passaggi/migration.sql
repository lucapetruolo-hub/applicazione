-- Verifica in due passaggi per l'area admin (docs/CHANGELOG.md §351).
ALTER TABLE "users" ADD COLUMN "adminTotpSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "adminTotpEnabledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "adminTotpLastStep" INTEGER;
ALTER TABLE "users" ADD COLUMN "adminResetCodeHash" TEXT;
ALTER TABLE "users" ADD COLUMN "adminResetCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "adminResetCodeSentAt" TIMESTAMP(3);

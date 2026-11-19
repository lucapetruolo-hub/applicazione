-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('MATERIALS', 'VEHICLE', 'TOOLS', 'PHONE', 'INSURANCE', 'TRAINING', 'SOCIAL_SECURITY', 'OTHER');

-- CreateTable
CREATE TABLE "professional_expenses" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "receiptPhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_cashbook_settings" (
    "professionalProfileId" TEXT NOT NULL,
    "includeExternalJobs" BOOLEAN NOT NULL DEFAULT true,
    "taxCoefficient" TEXT,
    "taxRatePercent" INTEGER,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 22,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_cashbook_settings_pkey" PRIMARY KEY ("professionalProfileId")
);

-- CreateTable
CREATE TABLE "free_spreadsheet_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "free_spreadsheet_signups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "professional_expenses_professionalProfileId_spentOn_idx" ON "professional_expenses"("professionalProfileId", "spentOn");

-- CreateIndex
CREATE UNIQUE INDEX "free_spreadsheet_signups_email_key" ON "free_spreadsheet_signups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "free_spreadsheet_signups_token_key" ON "free_spreadsheet_signups"("token");

-- AddForeignKey
ALTER TABLE "professional_expenses" ADD CONSTRAINT "professional_expenses_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_cashbook_settings" ADD CONSTRAINT "professional_cashbook_settings_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

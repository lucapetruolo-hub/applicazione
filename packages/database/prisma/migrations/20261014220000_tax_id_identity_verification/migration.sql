-- CreateEnum
CREATE TYPE "TaxIdKind" AS ENUM ('CODICE_FISCALE', 'PARTITA_IVA');

-- CreateEnum
CREATE TYPE "TaxIdCheckStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'REVIEW');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('STARTED', 'PROCESSING', 'APPROVED', 'NEEDS_REVIEW', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "tax_id_checks" (
    "id" TEXT NOT NULL,
    "fiscalProfileId" TEXT NOT NULL,
    "kind" "TaxIdKind" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "TaxIdCheckStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "detail" TEXT,
    "officialName" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "checkedAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_id_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verifications" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSessionId" TEXT NOT NULL,
    "sessionUrl" TEXT,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'STARTED',
    "providerStatus" TEXT,
    "reason" TEXT,
    "biometricConsentAt" TIMESTAMP(3) NOT NULL,
    "biometricConsentVersion" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_id_checks_status_nextAttemptAt_idx" ON "tax_id_checks"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "tax_id_checks_fiscalProfileId_kind_key" ON "tax_id_checks"("fiscalProfileId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "identity_verifications_providerSessionId_key" ON "identity_verifications"("providerSessionId");

-- CreateIndex
CREATE INDEX "identity_verifications_professionalProfileId_createdAt_idx" ON "identity_verifications"("professionalProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "identity_verifications_status_idx" ON "identity_verifications"("status");

-- AddForeignKey
ALTER TABLE "tax_id_checks" ADD CONSTRAINT "tax_id_checks_fiscalProfileId_fkey" FOREIGN KEY ("fiscalProfileId") REFERENCES "professional_fiscal_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verifications" ADD CONSTRAINT "identity_verifications_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


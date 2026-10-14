-- AlterTable
ALTER TABLE "professional_fiscal_profiles" ADD COLUMN "fiscalDataCompleteAt" TIMESTAMP(3);

-- Profili già compilati: stesse regole di `fiscalDataMissing` (packages/shared/src/fiscalCompleteness.ts).
UPDATE "professional_fiscal_profiles"
SET "fiscalDataCompleteAt" = NOW()
WHERE "entityType" IS NOT NULL
  AND "fiscalDeclarationAcceptedAt" IS NOT NULL
  AND COALESCE(TRIM("registeredStreet"), '') <> ''
  AND COALESCE(TRIM("registeredCity"), '') <> ''
  AND COALESCE(TRIM("registeredPostalCode"), '') <> ''
  AND (
    ("entityType" = 'BUSINESS' AND COALESCE(TRIM("businessName"), '') <> '' AND COALESCE(TRIM("vatNumber"), '') <> '')
    OR (
      "entityType" IN ('PRIVATE_INDIVIDUAL', 'SOLE_PROPRIETOR')
      AND COALESCE(TRIM("fiscalFirstName"), '') <> ''
      AND COALESCE(TRIM("fiscalLastName"), '') <> ''
      AND (COALESCE(TRIM("fiscalCodiceFiscale"), '') <> '' OR COALESCE(TRIM("foreignTin"), '') <> '')
      AND "dateOfBirth" IS NOT NULL
      AND ("entityType" = 'PRIVATE_INDIVIDUAL' OR COALESCE(TRIM("vatNumber"), '') <> '')
    )
  );

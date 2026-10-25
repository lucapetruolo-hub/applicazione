-- Badge "Verificato" nel tempo (docs/CHANGELOG.md §336).
ALTER TABLE "identity_verifications" ADD COLUMN "sandbox" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "identity_verifications" ADD COLUMN "documentExpiresAt" TIMESTAMP(3);
ALTER TABLE "identity_verifications" ADD COLUMN "expiryRemindedAt" TIMESTAMP(3);
ALTER TABLE "professional_profiles" ADD COLUMN "identityExpiredAt" TIMESTAMP(3);

-- Fino a oggi Didit è stato usato solo con le chiavi di prova (DIDIT_SANDBOX=true
-- su Render dal 21/10/2026): tutte le verifiche già fatte sono prove.
UPDATE "identity_verifications" SET "sandbox" = true;

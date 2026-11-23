-- Abilitazioni DM 37/2008 dichiarate dal professionista (docs/changelog/2026-11-23-termoidraulico.md).
ALTER TABLE "professional_profiles" ADD COLUMN "installerQualifications" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- La specializzazione "caldaie" sotto Idraulico non esiste più (le caldaie
-- sono di "Climatizzazione e caldaie"): la si toglie dai profili che l'avevano.
UPDATE "professional_profiles" SET "subTags" = array_remove("subTags", 'caldaie') WHERE 'caldaie' = ANY("subTags");

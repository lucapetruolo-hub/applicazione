-- Copertina del profilo pubblico (docs/changelog/2026-11-13-copertina-profilo.md)
ALTER TABLE "professional_profiles" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "professional_profiles" ADD COLUMN "coverPreset" TEXT;

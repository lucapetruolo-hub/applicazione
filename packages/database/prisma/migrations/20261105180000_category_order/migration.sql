-- Ordine dei mestieri scelto dal professionista.
ALTER TABLE "professional_profiles" ADD COLUMN "categoryOrder" TEXT[] DEFAULT ARRAY[]::TEXT[];

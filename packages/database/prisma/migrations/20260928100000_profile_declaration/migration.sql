-- Dichiarazione di responsabilità sul profilo professionista (docs/CHANGELOG.md §158).
ALTER TABLE "professional_profiles" ADD COLUMN     "profileDeclarationAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "profileDeclarationVersion" TEXT;

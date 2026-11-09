-- Canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md)
ALTER TABLE "professional_profiles" ADD COLUMN "personalLinkCode" TEXT;
CREATE UNIQUE INDEX "professional_profiles_personalLinkCode_key" ON "professional_profiles"("personalLinkCode");
ALTER TABLE "guided_requests" ADD COLUMN "fromProfessionalLink" BOOLEAN NOT NULL DEFAULT false;

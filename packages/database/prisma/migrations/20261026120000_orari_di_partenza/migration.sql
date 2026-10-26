-- Orari di partenza dei nuovi profili (docs/CHANGELOG.md §356).
ALTER TABLE "professional_profiles" ADD COLUMN "agendaStarterHoursAt" TIMESTAMP(3);

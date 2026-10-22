-- Agenda (docs/CHANGELOG.md §279): "Sto arrivando", calendario collegato, settimana tipo.
ALTER TABLE "bookings" ADD COLUMN "onTheWayAt" TIMESTAMP(3);
ALTER TABLE "professional_profiles" ADD COLUMN "calendarFeedToken" TEXT;
ALTER TABLE "professional_profiles" ADD COLUMN "agendaWeekTemplate" JSONB;
CREATE UNIQUE INDEX "professional_profiles_calendarFeedToken_key" ON "professional_profiles"("calendarFeedToken");

-- Preavviso per annullare scelto dal professionista (docs/CHANGELOG.md §345).
ALTER TABLE "professional_profiles" ADD COLUMN "cancellationNoticeHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "bookings" ADD COLUMN "cancellationNoticeHours" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "canceledLate" BOOLEAN NOT NULL DEFAULT false;

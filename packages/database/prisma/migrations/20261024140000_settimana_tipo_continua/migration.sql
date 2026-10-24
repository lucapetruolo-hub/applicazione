-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "agendaTemplateFilledUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "availability_slots" ADD COLUMN     "fromWeekTemplate" BOOLEAN NOT NULL DEFAULT false;

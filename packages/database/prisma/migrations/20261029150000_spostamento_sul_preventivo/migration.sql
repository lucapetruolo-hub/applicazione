-- L'altra data proposta per un appuntamento fissato sta sul preventivo, come ogni proposta di data (docs/changelog/2026-10-28-promemoria-whatsapp.md): sul lavoro resta solo quando è stata chiesta.
-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "rescheduleNote",
DROP COLUMN "rescheduleProposedAt",
DROP COLUMN "rescheduleProposedEndAt";

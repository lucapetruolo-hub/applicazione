-- Chi propone l'altra data per un appuntamento fissato e promemoria dopo 12 ore senza risposta (docs/changelog/2026-10-28-promemoria-whatsapp.md).
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "rescheduleProposedBy" TEXT,
ADD COLUMN     "rescheduleReminderAt" TIMESTAMP(3);


-- Risposte dal promemoria email, email dell'acconto e proposta di un'altra data per un appuntamento fissato (docs/changelog/2026-10-28-promemoria-whatsapp.md).
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "clientDepositReminderAt" TIMESTAMP(3),
ADD COLUMN     "clientReplyChannel" TEXT,
ADD COLUMN     "rescheduleNote" TEXT,
ADD COLUMN     "rescheduleProposedAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleProposedEndAt" TIMESTAMP(3),
ADD COLUMN     "rescheduleRequestedAt" TIMESTAMP(3);

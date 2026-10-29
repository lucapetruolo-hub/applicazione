-- Risposta del cliente ai pulsanti del promemoria WhatsApp (docs/changelog/2026-10-28-promemoria-whatsapp.md).
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "clientCantComeAt" TIMESTAMP(3),
ADD COLUMN     "clientConfirmedAt" TIMESTAMP(3);

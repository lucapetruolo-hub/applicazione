-- Promemoria anti no-show (Booking.reminderSentAt): colonna aggiunta nello
-- stesso commit che ha introdotto le migrazioni, quindi mai arrivata sul
-- database Render di produzione via "db push". Separata dalla baseline
-- perché la baseline viene marcata come "già applicata" su quel database.
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);

-- Ora indicativa di arrivo dentro una fascia lunga (docs/changelog/2026-11-11-fasce-ampie.md).
ALTER TABLE "quotes" ADD COLUMN "arrivalTime" TEXT;
ALTER TABLE "bookings" ADD COLUMN "arrivalTime" TEXT;

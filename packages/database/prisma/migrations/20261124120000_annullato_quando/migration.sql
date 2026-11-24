-- Quando è stato annullato un appuntamento (docs/changelog/2026-11-24-chi-ha-annullato-e-quando.md).
ALTER TABLE "bookings" ADD COLUMN "canceledAt" TIMESTAMP(3);

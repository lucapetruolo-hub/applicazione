-- Scarti e mancate consegne dello SdI (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md).
ALTER TABLE "invoices" ADD COLUMN "sdiRejectedAt" TIMESTAMP(3),
ADD COLUMN "sdiRejectRemindedAt" TIMESTAMP(3),
ADD COLUMN "sdiUndeliveredAt" TIMESTAMP(3);

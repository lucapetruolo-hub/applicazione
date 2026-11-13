-- Saldo sulla carta dopo 48 ore se il prezzo finale è sopra il minimo (docs/changelog/2026-11-13-tutto-online-forbice.md).
ALTER TABLE "job_payments" ADD COLUMN "balanceAutoChargeAt" TIMESTAMP(3);

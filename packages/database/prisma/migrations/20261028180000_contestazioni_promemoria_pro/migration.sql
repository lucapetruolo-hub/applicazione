-- Promemoria al professionista sulla spiegazione della contestazione in banca (docs/changelog/2026-10-28-stripe-prova.md).
ALTER TABLE "job_payments" ADD COLUMN "disputeProReminderSentAt" TIMESTAMP(3);

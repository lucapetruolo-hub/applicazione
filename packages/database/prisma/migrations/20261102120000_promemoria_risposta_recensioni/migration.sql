-- Promemoria per le recensioni da 1-2 stelle senza risposta (docs/changelog/2026-10-30-collaudo-soldi-online.md).
ALTER TABLE "reviews" ADD COLUMN "replyReminderSentAt" TIMESTAMP(3);

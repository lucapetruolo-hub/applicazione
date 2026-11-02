-- Avviso "la pausa finisce domani" (docs/changelog/2026-11-02-iscrizione-verifica-professionisti.md).
ALTER TABLE "professional_profiles" ADD COLUMN "awayReminderSentAt" TIMESTAMP(3);

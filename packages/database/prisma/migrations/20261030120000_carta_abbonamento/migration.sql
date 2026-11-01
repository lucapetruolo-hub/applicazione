-- Carta data per l'abbonamento
-- (docs/changelog/2026-10-30-iscrizione-carta-solida.md).
ALTER TABLE "subscriptions" ADD COLUMN "cardAddedAt" TIMESTAMP(3);

-- Chi ha già un abbonamento di Stripe ha dato la carta: la data esatta non
-- c'è, vale l'ultimo aggiornamento della riga.
UPDATE "subscriptions" SET "cardAddedAt" = "updatedAt" WHERE "stripeSubscriptionId" IS NOT NULL;

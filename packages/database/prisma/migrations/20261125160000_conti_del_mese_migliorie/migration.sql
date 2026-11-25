-- Conti del mese, migliorie (docs/changelog/2026-11-25-conti-del-mese.md).
-- Solo additiva: data di fine abbonamento, email "Passa a Plus" già mandata,
-- traguardo di utile scritto dall'admin.
ALTER TABLE "subscriptions" ADD COLUMN "canceledAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "plusSuggestionEmailedAt" TIMESTAMP(3);

-- Abbonamenti già chiusi: la data migliore che abbiamo è l'ultima modifica.
UPDATE "subscriptions" SET "canceledAt" = "updatedAt" WHERE "status" = 'CANCELED';

CREATE TABLE "platform_accounts_settings" (
    "id" TEXT NOT NULL,
    "profitTargetYearEurCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "platform_accounts_settings_pkey" PRIMARY KEY ("id")
);

-- Abbonamenti a pagamento accesi dall'admin
-- (docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md).
CREATE TABLE "subscription_settings" (
    "id" TEXT NOT NULL,
    "paidFrom" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "subscription_settings_pkey" PRIMARY KEY ("id")
);

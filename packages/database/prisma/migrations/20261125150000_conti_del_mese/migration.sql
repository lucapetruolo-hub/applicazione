-- Costi fissi al mese della piattaforma (Admin → Conti del mese,
-- docs/changelog/2026-11-25-conti-del-mese.md). Solo additiva.
CREATE TABLE "platform_monthly_costs" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthlyEurCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_monthly_costs_pkey" PRIMARY KEY ("id")
);

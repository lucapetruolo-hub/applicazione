-- Rinnovo non pagato e quota di passaggio in corso (collaudo dell'8/11/2026, E3-02/E3-03).
ALTER TABLE "subscriptions" ADD COLUMN "pastDueSince" TIMESTAMP(3),
ADD COLUMN "upgradeInvoiceId" TEXT,
ADD COLUMN "upgradeStartedAt" TIMESTAMP(3);

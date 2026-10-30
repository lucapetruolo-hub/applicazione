-- Offerta mesi gratis decisa in Admin
-- (docs/changelog/2026-10-29-offerta-mesi-gratis.md).
ALTER TABLE "subscriptions" ADD COLUMN "freeMonthsGranted" INTEGER;
ALTER TABLE "subscriptions" ADD COLUMN "freeMonthsWaiting" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN "returnToBaseAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "offerId" TEXT;

CREATE TABLE "subscription_offers" (
    "id" TEXT NOT NULL,
    "freeMonths" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "stoppedByUserId" TEXT,

    CONSTRAINT "subscription_offers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_offers_stoppedAt_idx" ON "subscription_offers"("stoppedAt");

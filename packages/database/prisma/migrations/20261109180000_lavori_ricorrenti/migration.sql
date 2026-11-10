-- Lavori ricorrenti (docs/changelog/2026-11-09-lavori-ricorrenti.md): solo aggiunte.
ALTER TABLE "quotes" ADD COLUMN "repeatEvery" TEXT;

ALTER TABLE "bookings" ADD COLUMN "recurringJobId" TEXT,
ADD COLUMN "recurringNumber" INTEGER,
ADD COLUMN "skippedAt" TIMESTAMP(3);

CREATE TABLE "recurring_jobs" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL,
    "firstEndAt" TIMESTAMP(3),
    "paymentChoice" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 1,
    "stoppedAt" TIMESTAMP(3),
    "stoppedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recurring_jobs_quoteId_key" ON "recurring_jobs"("quoteId");
CREATE INDEX "recurring_jobs_stoppedAt_idx" ON "recurring_jobs"("stoppedAt");
CREATE INDEX "bookings_recurringJobId_idx" ON "bookings"("recurringJobId");

ALTER TABLE "recurring_jobs" ADD CONSTRAINT "recurring_jobs_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_recurringJobId_fkey" FOREIGN KEY ("recurringJobId") REFERENCES "recurring_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

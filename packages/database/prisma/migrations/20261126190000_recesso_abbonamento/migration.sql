-- Recesso dall'abbonamento entro 14 giorni (docs/changelog/2026-11-26-recesso-abbonamento.md). Solo additiva.
CREATE TABLE "subscription_withdrawals" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "tierLabel" TEXT NOT NULL,
    "paidEurCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "daysUsed" INTEGER NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "jobsUsed" INTEGER NOT NULL,
    "jobsLimit" INTEGER,
    "proposedRefundEurCents" INTEGER NOT NULL,
    "refundEurCents" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_withdrawals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_withdrawals_professionalProfileId_idx" ON "subscription_withdrawals"("professionalProfileId");
CREATE INDEX "subscription_withdrawals_status_createdAt_idx" ON "subscription_withdrawals"("status", "createdAt");

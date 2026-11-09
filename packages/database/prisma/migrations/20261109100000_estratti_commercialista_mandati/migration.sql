-- Estratti mandati al commercialista, una volta per mese (docs/changelog/2026-11-08-infrastruttura-lancio.md).
-- CreateTable
CREATE TABLE "accountant_statement_sends" (
    "professionalProfileId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountant_statement_sends_pkey" PRIMARY KEY ("professionalProfileId","month")
);

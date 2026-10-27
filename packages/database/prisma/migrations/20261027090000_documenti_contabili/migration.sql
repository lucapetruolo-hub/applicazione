-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('JOB_FEES', 'SUBSCRIPTION', 'UPGRADE_FEE', 'VISIBILITY_BOOST');

-- CreateEnum
CREATE TYPE "InvoiceSdiStatus" AS ENUM ('NOT_SENT', 'SENT', 'DELIVERED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlatformFeeEntryKind" AS ENUM ('HOLD', 'RETURN', 'COSTS');

-- AlterTable
ALTER TABLE "professional_fiscal_profiles" ADD COLUMN     "accountantEmail" TEXT,
ADD COLUMN     "accountantStatementsAt" TIMESTAMP(3),
ADD COLUMN     "chargesVat" BOOLEAN,
ADD COLUMN     "pecEmail" TEXT,
ADD COLUMN     "sdiRecipientCode" TEXT;

-- AlterTable
ALTER TABLE "job_payments" ADD COLUMN     "cardFeeEurCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "creditNote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "issuer" JSONB,
ADD COLUMN     "lines" JSONB,
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "periodMonth" TEXT,
ADD COLUMN     "recipient" JSONB,
ADD COLUMN     "relatedInvoiceId" TEXT,
ADD COLUMN     "roundingEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sdiAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sdiId" TEXT,
ADD COLUMN     "sdiMessage" TEXT,
ADD COLUMN     "sdiSentAt" TIMESTAMP(3),
ADD COLUMN     "sdiStatus" "InvoiceSdiStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "series" TEXT,
ADD COLUMN     "source" "InvoiceSource" NOT NULL DEFAULT 'JOB_FEES',
ADD COLUMN     "stripeInvoiceId" TEXT,
ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "taxableEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRateBasisPoints" INTEGER NOT NULL DEFAULT 2200,
ADD COLUMN     "xml" TEXT,
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "client_invoice_requests" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxCode" TEXT,
    "vatNumber" TEXT,
    "sdiRecipientCode" TEXT,
    "pecEmail" TEXT,
    "street" TEXT NOT NULL,
    "houseNumber" TEXT,
    "postalCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "professionalSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_invoice_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "series" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("series","year")
);

-- CreateTable
CREATE TABLE "platform_fee_entries" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "jobPaymentId" TEXT,
    "kind" "PlatformFeeEntryKind" NOT NULL,
    "grossEurCents" INTEGER NOT NULL,
    "taxableEurCents" INTEGER NOT NULL,
    "vatEurCents" INTEGER NOT NULL,
    "paymentEurCents" INTEGER NOT NULL DEFAULT 0,
    "cardFeeEurCents" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_fee_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoice_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT,
    "vatNumber" TEXT,
    "taxCode" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'IT',
    "taxRegime" TEXT NOT NULL DEFAULT 'RF01',
    "reaOffice" TEXT,
    "reaNumber" TEXT,
    "shareCapital" TEXT,
    "pecEmail" TEXT,
    "invoicesFrom" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_invoice_requests_quoteId_key" ON "client_invoice_requests"("quoteId");

-- CreateIndex
CREATE INDEX "client_invoice_requests_clientId_idx" ON "client_invoice_requests"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_fee_entries_dedupeKey_key" ON "platform_fee_entries"("dedupeKey");

-- CreateIndex
CREATE INDEX "platform_fee_entries_professionalProfileId_occurredAt_idx" ON "platform_fee_entries"("professionalProfileId", "occurredAt");

-- CreateIndex
CREATE INDEX "platform_fee_entries_invoiceId_idx" ON "platform_fee_entries"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_dedupeKey_key" ON "invoices"("dedupeKey");

-- CreateIndex
CREATE INDEX "invoices_professionalProfileId_issuedAt_idx" ON "invoices"("professionalProfileId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_series_year_number_key" ON "invoices"("series", "year", "number");

-- AddForeignKey
ALTER TABLE "client_invoice_requests" ADD CONSTRAINT "client_invoice_requests_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_entries" ADD CONSTRAINT "platform_fee_entries_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "job_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_entries" ADD CONSTRAINT "platform_fee_entries_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;


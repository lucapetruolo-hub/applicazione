-- Commercialista della nostra società: zip delle fatture del mese per email, con la spunta (docs/changelog/2026-11-24-fatture-del-mese-zip.md).
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantEmail" TEXT;
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantZipAt" TIMESTAMP(3);
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantZipMonth" TEXT;

-- Registro invii: prove d'invio allo SdI e zip al commercialista (Admin → Fisco e fatture → Registro invii).
CREATE TABLE "fiscal_send_logs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "month" TEXT,
    "recipient" TEXT,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "externalId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_send_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fiscal_send_logs_createdAt_idx" ON "fiscal_send_logs"("createdAt");

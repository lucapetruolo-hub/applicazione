-- Commercialista della nostra società: zip delle fatture del mese per email, con la spunta (docs/changelog/2026-11-24-fatture-del-mese-zip.md).
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantEmail" TEXT;
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantZipAt" TIMESTAMP(3);
ALTER TABLE "platform_invoice_settings" ADD COLUMN "accountantZipMonth" TEXT;

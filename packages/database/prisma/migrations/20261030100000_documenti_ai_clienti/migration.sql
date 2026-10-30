-- Documenti dati ai clienti dopo il collaudo del 29/10/2026 (docs/changelog/2026-10-30-documenti-fiscali.md):
-- data della fattura vera, nome e codice fiscale del cliente, aliquota IVA e ritenuta d'acconto.
ALTER TABLE "courtesy_documents" ADD COLUMN "ownDate" DATE;
ALTER TABLE "courtesy_documents" ADD COLUMN "customerName" TEXT;
ALTER TABLE "courtesy_documents" ADD COLUMN "customerTaxCode" TEXT;
ALTER TABLE "courtesy_documents" ADD COLUMN "vatRatePercent" INTEGER;
ALTER TABLE "courtesy_documents" ADD COLUMN "withholding" BOOLEAN;

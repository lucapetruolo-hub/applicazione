-- Ricevute date ai clienti dopo il collaudo del 29/10/2026 (docs/changelog/2026-10-30-documenti-fiscali.md
-- e docs/changelog/2026-10-30-documenti-snelli.md): nome e codice fiscale del cliente e ritenuta d'acconto.
ALTER TABLE "courtesy_documents" ADD COLUMN "customerName" TEXT;
ALTER TABLE "courtesy_documents" ADD COLUMN "customerTaxCode" TEXT;
ALTER TABLE "courtesy_documents" ADD COLUMN "withholding" BOOLEAN;

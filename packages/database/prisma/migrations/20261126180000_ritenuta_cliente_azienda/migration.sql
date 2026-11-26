-- Il cliente con partita IVA trattiene la ritenuta d'acconto (sostituto d'imposta)?
-- Solo additiva (docs/changelog/2026-11-26-ritenuta-cliente-azienda.md).
ALTER TABLE "client_invoice_requests" ADD COLUMN "withholdingAgent" BOOLEAN;

-- Carta del pagamento sulle nostre fatture (marca e ultime 4 cifre), per la
-- sezione "Pagamento" del PDF. Solo additiva (docs/changelog/2026-11-26-pdf-puliti.md).
ALTER TABLE "invoices" ADD COLUMN "paymentCardBrand" TEXT;
ALTER TABLE "invoices" ADD COLUMN "paymentCardLast4" TEXT;

-- Con la partita IVA nessuna copia della fattura (decisione di Luca del 30/10/2026,
-- docs/changelog/2026-10-30-documenti-snelli.md): restano solo le ricevute per prestazione occasionale.
DELETE FROM "courtesy_documents" WHERE "kind" <> 'RECEIPT';
ALTER TABLE "courtesy_documents" DROP COLUMN "ownNumber";

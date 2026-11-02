-- La ricevuta per prestazione occasionale diventa un modello che il professionista
-- numera e firma come documento suo (decisione di Luca del 02/11/2026,
-- docs/changelog/2026-11-02-ricevuta-modello.md): il numero lo scrive lui.
ALTER TABLE "courtesy_documents" ADD COLUMN "receiptNumber" TEXT;

-- Le ricevute già scaricate tengono il numero che il cliente ha in mano;
-- quelle mai scaricate restano senza, e il professionista scrive il suo.
UPDATE "courtesy_documents" SET "receiptNumber" = "number" || '/' || "year" WHERE "number" IS NOT NULL AND "pdfDownloadedAt" IS NOT NULL;

DROP INDEX "courtesy_documents_professionalProfileId_year_number_key";
ALTER TABLE "courtesy_documents" DROP COLUMN "number";

CREATE INDEX "courtesy_documents_professionalProfileId_year_idx" ON "courtesy_documents"("professionalProfileId", "year");

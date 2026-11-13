-- Testo su annullare e acconto letto dal cliente accettando (docs/changelog/2026-11-13-annullare-pagina-aperta.md). Solo additiva.
ALTER TABLE "bookings" ADD COLUMN "acceptedTerms" JSONB;

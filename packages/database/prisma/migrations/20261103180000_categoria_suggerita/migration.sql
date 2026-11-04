-- Categoria proposta dalla descrizione nel modulo di richiesta (docs/changelog/2026-11-03-preventivo-descrizione-per-prima.md).
ALTER TABLE "guided_requests" ADD COLUMN "suggestedCategorySlug" TEXT;

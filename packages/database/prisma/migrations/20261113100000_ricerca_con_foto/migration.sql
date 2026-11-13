-- Ricerca partita da una foto del problema (docs/changelog/2026-11-13-ricerca-con-foto.md).
ALTER TABLE "problem_descriptions" ADD COLUMN "withPhoto" BOOLEAN NOT NULL DEFAULT false;

-- Prestazione indicata dal dizionario o dall'IA per una descrizione, e
-- parola insegnata che porta anche a una prestazione
-- (docs/changelog/2026-11-06-dizionario-prestazioni.md).
ALTER TABLE "problem_descriptions" ADD COLUMN "service" TEXT;
ALTER TABLE "problem_words" ADD COLUMN "serviceName" TEXT;

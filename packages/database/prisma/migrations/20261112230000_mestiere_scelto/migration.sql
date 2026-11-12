-- Mestiere scelto dal cliente quando non è il primo proposto
-- (docs/changelog/2026-11-12-haiku-senza-ragionamento.md).
ALTER TABLE "problem_descriptions" ADD COLUMN "chosenCategory" TEXT;

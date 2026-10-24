-- Email degli account in minuscolo (docs/CHANGELOG.md §330): da ora il sito
-- le salva e le cerca così. Si cambiano solo quelle senza un altro account
-- con la stessa email scritta in modo diverso, per non violare l'unicità.
UPDATE "users" AS u
SET "email" = lower(trim(u."email"))
WHERE u."email" IS NOT NULL
  AND u."email" <> lower(trim(u."email"))
  AND (SELECT count(*) FROM "users" AS v WHERE lower(trim(v."email")) = lower(trim(u."email"))) = 1;

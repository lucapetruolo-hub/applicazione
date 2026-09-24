-- Ruoli admin combinabili (docs/CHANGELOG.md §146): da un solo ruolo a una
-- lista. I ruoli già assegnati vengono copiati prima di togliere la colonna.
ALTER TABLE "users" ADD COLUMN "adminRoles" "AdminRole"[] DEFAULT ARRAY[]::"AdminRole"[];

UPDATE "users" SET "adminRoles" = ARRAY["adminRole"] WHERE "adminRole" IS NOT NULL;

ALTER TABLE "users" DROP COLUMN "adminRole";

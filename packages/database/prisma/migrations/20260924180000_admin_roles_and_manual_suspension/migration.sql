-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER', 'MODERATOR', 'FINANCE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adminRole" "AdminRole",
ADD COLUMN     "suspensionNote" TEXT;


-- Gli admin esistenti restano con pieni poteri (docs/CHANGELOG.md §145).
UPDATE "users" SET "adminRole" = 'SUPER' WHERE "role" = 'ADMIN';

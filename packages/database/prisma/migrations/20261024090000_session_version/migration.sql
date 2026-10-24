-- Versione delle sessioni: cambiare o reimpostare la password chiude gli altri accessi (docs/CHANGELOG.md §292).
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

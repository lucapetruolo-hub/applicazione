-- Impronta dell'email degli account chiusi (docs/changelog/2026-10-30-admin-persone.md).
ALTER TABLE "users" ADD COLUMN "deletedEmailHash" TEXT;

CREATE INDEX "users_deletedEmailHash_idx" ON "users"("deletedEmailHash");

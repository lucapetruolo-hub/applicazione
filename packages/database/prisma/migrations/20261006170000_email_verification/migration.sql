-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "emailTokenHash" TEXT,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_emailTokenHash_key" ON "users"("emailTokenHash");

-- Gli account già esistenti restano utilizzabili: valgono come confermati.
UPDATE "users" SET "emailVerifiedAt" = "createdAt" WHERE "deletedAt" IS NULL;

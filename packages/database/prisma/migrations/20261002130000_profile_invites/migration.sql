-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "invitePendingAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "profile_invites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_invites_tokenHash_key" ON "profile_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "profile_invites_userId_idx" ON "profile_invites"("userId");

-- AddForeignKey
ALTER TABLE "profile_invites" ADD CONSTRAINT "profile_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

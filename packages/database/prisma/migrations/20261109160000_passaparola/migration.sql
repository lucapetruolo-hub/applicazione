-- AlterTable
ALTER TABLE "users" ADD COLUMN     "invitedByPartnerId" TEXT,
ADD COLUMN     "invitedByProfessionalId" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reviewReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "profile_view_days" ADD COLUMN     "linkCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "invite_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "invite_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invite_partners_code_key" ON "invite_partners"("code");

-- CreateIndex
CREATE INDEX "users_invitedByProfessionalId_idx" ON "users"("invitedByProfessionalId");

-- CreateIndex
CREATE INDEX "users_invitedByPartnerId_idx" ON "users"("invitedByPartnerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedByProfessionalId_fkey" FOREIGN KEY ("invitedByProfessionalId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invitedByPartnerId_fkey" FOREIGN KEY ("invitedByPartnerId") REFERENCES "invite_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;


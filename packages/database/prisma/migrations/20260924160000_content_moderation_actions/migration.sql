-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('WARN', 'REQUEST_CORRECTION', 'HIDE_CONTENT', 'SUSPEND_PROFILE', 'SUSPEND_USER');

-- AlterTable
ALTER TABLE "client_reviews" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "content_reports" ADD COLUMN     "action" "ModerationAction",
ADD COLUMN     "appealRejectNote" TEXT,
ADD COLUMN     "appealRejectedAt" TIMESTAMP(3),
ADD COLUMN     "appealText" TEXT,
ADD COLUMN     "appealedAt" TIMESTAMP(3),
ADD COLUMN     "authoritiesNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "contentOwnerId" TEXT,
ADD COLUMN     "revertNote" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "guided_requests" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "content_reports_contentOwnerId_idx" ON "content_reports"("contentOwnerId");


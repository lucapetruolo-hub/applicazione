-- AlterTable
ALTER TABLE "guided_requests" ADD COLUMN     "forwardIfNoReply" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "forwardedAt" TIMESTAMP(3);


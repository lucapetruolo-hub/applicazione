-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "demotedUntil" TIMESTAMP(3),
ADD COLUMN     "requestsBlockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "job_issues" ADD COLUMN     "appealDecision" TEXT,
ADD COLUMN     "appealNote" TEXT,
ADD COLUMN     "appealResolvedAt" TIMESTAMP(3),
ADD COLUMN     "appealResolvedByUserId" TEXT,
ADD COLUMN     "appealText" TEXT,
ADD COLUMN     "appealedAt" TIMESTAMP(3),
ADD COLUMN     "autoDecision" TEXT,
ADD COLUMN     "infoRequestText" TEXT,
ADD COLUMN     "infoRequestedAt" TIMESTAMP(3),
ADD COLUMN     "infoResponse" TEXT,
ADD COLUMN     "infoRespondedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationReason" TEXT,
ADD COLUMN     "redispatchedGuidedRequestId" TEXT,
ADD COLUMN     "sanction" TEXT;

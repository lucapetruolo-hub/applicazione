-- Segnalazioni di un problema sul lavoro (docs/CHANGELOG.md §164).
-- CreateEnum
CREATE TYPE "JobIssueType" AS ENUM ('NO_SHOW', 'BAD_WORK');

-- CreateEnum
CREATE TYPE "JobIssueStatus" AS ENUM ('OPEN', 'UPHELD', 'REJECTED');

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "professionalCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "job_issues" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "JobIssueType" NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "JobIssueStatus" NOT NULL DEFAULT 'OPEN',
    "professionalResponse" TEXT,
    "professionalRespondedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_issues_bookingId_key" ON "job_issues"("bookingId");

-- CreateIndex
CREATE INDEX "job_issues_status_idx" ON "job_issues"("status");

-- AddForeignKey
ALTER TABLE "job_issues" ADD CONSTRAINT "job_issues_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


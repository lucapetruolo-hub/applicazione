-- Segnalazioni secondo il DSA (docs/CHANGELOG.md §318).
ALTER TYPE "ContactMessageRole" ADD VALUE 'REPORT_ILLEGAL';

ALTER TABLE "content_reports" ADD COLUMN "claimsIllegal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "goodFaithAt" TIMESTAMP(3),
ADD COLUMN "ground" TEXT;

-- Bacheca "Lavori cercati" (docs/changelog/2026-11-17-bacheca-lavori-cercati.md).
-- Solo colonne nuove.
ALTER TABLE "guided_requests" ADD COLUMN "boardAt" TIMESTAMP(3);
ALTER TABLE "guided_requests" ADD COLUMN "boardTitle" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "boardSummary" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "boardPlace" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "boardProvince" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "boardTrade" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "boardOptOut" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "guided_requests_boardTrade_boardProvince_boardAt_idx" ON "guided_requests"("boardTrade", "boardProvince", "boardAt");

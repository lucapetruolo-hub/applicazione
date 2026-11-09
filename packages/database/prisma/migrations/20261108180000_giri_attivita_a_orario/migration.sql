-- Giri delle attività a orario (docs/changelog/2026-11-08-infrastruttura-lancio.md).
-- CreateTable
CREATE TABLE "cron_runs" (
    "name" TEXT NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("name","slot")
);

-- CreateIndex
CREATE INDEX "cron_runs_startedAt_idx" ON "cron_runs"("startedAt");

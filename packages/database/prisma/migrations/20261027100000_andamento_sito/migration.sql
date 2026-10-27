-- Andamento del sito (docs/CHANGELOG.md §372): contatori per giorno, note sul
-- grafico, provenienza dell'iscrizione.
ALTER TABLE "users" ADD COLUMN "signupSource" "TrafficSource";

CREATE TABLE "request_step_days" (
    "step" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "request_step_days_pkey" PRIMARY KEY ("step","categorySlug","day")
);
CREATE INDEX "request_step_days_day_idx" ON "request_step_days"("day");

CREATE TABLE "submit_failure_days" (
    "form" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "submit_failure_days_pkey" PRIMARY KEY ("form","kind","day")
);
CREATE INDEX "submit_failure_days_day_idx" ON "submit_failure_days"("day");

CREATE TABLE "unknown_job_search_days" (
    "termHash" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "unknown_job_search_days_pkey" PRIMARY KEY ("termHash","day")
);
CREATE INDEX "unknown_job_search_days_day_idx" ON "unknown_job_search_days"("day");

CREATE TABLE "unknown_job_terms" (
    "termHash" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "unknown_job_terms_pkey" PRIMARY KEY ("termHash")
);

CREATE TABLE "churn_reason_days" (
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "churn_reason_days_pkey" PRIMARY KEY ("kind","reason","day")
);
CREATE INDEX "churn_reason_days_day_idx" ON "churn_reason_days"("day");

CREATE TABLE "site_notes" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "site_notes_day_idx" ON "site_notes"("day");

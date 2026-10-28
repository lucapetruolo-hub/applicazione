-- CreateTable
CREATE TABLE "profile_request_source_days" (
    "event" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "profile_request_source_days_pkey" PRIMARY KEY ("event","source","device","day")
);

-- CreateIndex
CREATE INDEX "profile_request_source_days_day_idx" ON "profile_request_source_days"("day");

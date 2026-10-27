-- CreateTable
CREATE TABLE "service_search_days" (
    "categorySlug" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "service_search_days_pkey" PRIMARY KEY ("categorySlug","service","day")
);

-- CreateIndex
CREATE INDEX "service_search_days_day_idx" ON "service_search_days"("day");

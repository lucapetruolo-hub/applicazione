-- CreateTable
CREATE TABLE "popular_jobs" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "popular_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "popular_jobs_service_key" ON "popular_jobs"("service");

-- CreateIndex
CREATE INDEX "popular_jobs_position_idx" ON "popular_jobs"("position");

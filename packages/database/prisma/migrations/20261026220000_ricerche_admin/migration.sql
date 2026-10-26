-- AlterTable
ALTER TABLE "category_search_days" ADD COLUMN     "emptyCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "free_search_days" (
    "city" TEXT NOT NULL,
    "withText" BOOLEAN NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "emptyCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "free_search_days_pkey" PRIMARY KEY ("city","withText","day")
);

-- CreateIndex
CREATE INDEX "free_search_days_day_idx" ON "free_search_days"("day");


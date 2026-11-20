-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signupFromBoard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "board_use_days" (
    "action" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "board_use_days_pkey" PRIMARY KEY ("action","day")
);

-- CreateIndex
CREATE INDEX "board_use_days_day_idx" ON "board_use_days"("day");

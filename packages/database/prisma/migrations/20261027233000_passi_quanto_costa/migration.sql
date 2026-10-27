-- CreateTable
CREATE TABLE "price_tool_step_days" (
    "step" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "price_tool_step_days_pkey" PRIMARY KEY ("step","day")
);

-- CreateIndex
CREATE INDEX "price_tool_step_days_day_idx" ON "price_tool_step_days"("day");

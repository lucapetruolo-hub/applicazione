-- CreateTable
CREATE TABLE "general_request_settings" (
    "id" TEXT NOT NULL,
    "autoCloseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxWeeklyPerPro" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "minResponsePercent" INTEGER NOT NULL DEFAULT 33,
    "minMeasuredLeads" INTEGER NOT NULL DEFAULT 20,
    "keepOpenDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "general_request_settings_pkey" PRIMARY KEY ("id")
);


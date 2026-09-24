-- CreateTable
CREATE TABLE "profile_view_days" (
    "professionalProfileId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "profile_view_days_pkey" PRIMARY KEY ("professionalProfileId","day")
);

-- CreateIndex
CREATE INDEX "profile_view_days_day_idx" ON "profile_view_days"("day");

-- AddForeignKey
ALTER TABLE "profile_view_days" ADD CONSTRAINT "profile_view_days_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


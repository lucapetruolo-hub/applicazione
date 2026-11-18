-- Spostamento chiesto dal professionista e lavoro terminato in anticipo
-- (docs/changelog/2026-11-18-sposta-e-terminato-in-anticipo.md).
-- Solo una colonna e una tabella nuove.
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "earlyCompletionAskedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "booking_reschedules" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "proposedBy" TEXT NOT NULL,
    "late" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_reschedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_reschedules_professionalProfileId_createdAt_idx" ON "booking_reschedules"("professionalProfileId", "createdAt");

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "completionAutoClosedAt" TIMESTAMP(3),
ADD COLUMN     "completionReminderCount" INTEGER NOT NULL DEFAULT 0;

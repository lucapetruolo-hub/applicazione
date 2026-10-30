-- Chi ha annullato chiede di riaprire, l'altro accetta (collaudo F-08, docs/changelog/2026-10-30-collaudo-soldi-online.md).
-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "reopenRequestedAt" TIMESTAMP(3),
ADD COLUMN     "reopenRequestedBy" TEXT;

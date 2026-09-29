-- Note a lavoro terminato e motivo delle differenze dal preventivo (docs/CHANGELOG.md §163).
ALTER TABLE "bookings" ADD COLUMN     "clientCompletionNote" TEXT,
ADD COLUMN     "completionChangeReason" TEXT,
ADD COLUMN     "professionalCompletionNote" TEXT;

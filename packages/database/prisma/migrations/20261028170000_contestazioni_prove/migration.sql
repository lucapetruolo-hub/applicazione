-- Contestazioni in banca: scadenza delle prove, avviso al team e spiegazione del professionista (docs/changelog/2026-10-28-stripe-prova.md).
ALTER TABLE "job_payments" ADD COLUMN "stripeDisputeDueBy" TIMESTAMP(3),
ADD COLUMN "disputeReminderSentAt" TIMESTAMP(3),
ADD COLUMN "disputeProNote" TEXT,
ADD COLUMN "disputeProPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "disputeProNoteAt" TIMESTAMP(3);

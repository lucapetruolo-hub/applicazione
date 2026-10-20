-- Rimborsi in attesa di fondi sul conto Stripe del professionista (docs/CHANGELOG.md §270).
ALTER TABLE "job_payments" ADD COLUMN "refundWaitingEurCents" INTEGER NOT NULL DEFAULT 0;

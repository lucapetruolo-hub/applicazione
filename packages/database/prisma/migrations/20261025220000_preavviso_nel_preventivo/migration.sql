-- Preavviso per annullare e acconto trattenuto scelti a ogni preventivo (docs/CHANGELOG.md §348).
ALTER TABLE "quotes" ADD COLUMN "cancellationNoticeHours" INTEGER;
ALTER TABLE "quotes" ADD COLUMN "lateCancelKeepsDeposit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "job_payments" ADD COLUMN "depositKeptAt" TIMESTAMP(3);

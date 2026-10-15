-- Avviso al team Finanza sui pagamenti online bloccati da più di 80 giorni (docs/CHANGELOG.md §243).
ALTER TABLE "job_payments" ADD COLUMN "longHoldAlertedAt" TIMESTAMP(3);

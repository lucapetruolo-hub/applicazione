-- Cifre "Ti arriva in banca" (collaudo F-21, docs/changelog/2026-11-02-cifre-ti-arriva-in-banca.md).
ALTER TABLE "job_payments" ADD COLUMN "disputeFunds" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "job_payments" ADD COLUMN "releaseTakenByStripeEurCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "job_payments" ADD COLUMN "releaseDebtRecoveredEurCents" INTEGER NOT NULL DEFAULT 0;

-- Contestazioni già aperte: la cifra presa finora è della contestazione salvata.
UPDATE "job_payments"
SET "disputeFunds" = jsonb_build_object("stripeDisputeId", "disputeRecoveredEurCents")
WHERE "stripeDisputeId" IS NOT NULL AND "disputeRecoveredEurCents" > 0;

-- Sblocchi già fatti: le due voci erano scritte solo nel registro delle azioni.
UPDATE "job_payments" AS jp
SET "releaseTakenByStripeEurCents" = COALESCE((a."newValue"::jsonb ->> 'takenByStripe')::int, 0),
    "releaseDebtRecoveredEurCents" = COALESCE((a."newValue"::jsonb ->> 'debtRecovered')::int, 0)
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "newValue"
  FROM "audit_logs"
  WHERE "entityType" = 'JobPayment' AND "fieldName" = 'onlineStage' AND "newValue" LIKE '{"stage":"RELEASED"%'
  ORDER BY "entityId", "createdAt" DESC
) AS a
WHERE a."entityId" = jp."id";

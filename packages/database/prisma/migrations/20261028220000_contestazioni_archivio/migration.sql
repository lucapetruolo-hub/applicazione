-- Archivio delle contestazioni in banca (docs/changelog/2026-10-28-stripe-prova.md).
ALTER TABLE "job_payments" ADD COLUMN "stripeDisputeReason" TEXT,
ADD COLUMN "stripeDisputeClosedAt" TIMESTAMP(3),
ADD COLUMN "disputeEvidence" JSONB,
ADD COLUMN "disputeEvidenceSentAt" TIMESTAMP(3),
ADD COLUMN "disputeEvidenceSentById" TEXT,
ADD COLUMN "disputeEvidenceFileId" TEXT;

-- Contestazioni già chiuse: la data di chiusura più vicina che conosciamo.
UPDATE "job_payments" SET "stripeDisputeClosedAt" = "updatedAt"
WHERE "stripeDisputeStatus" IN ('won', 'lost', 'warning_closed', 'prevented') AND "stripeDisputeClosedAt" IS NULL;

-- L'IA propone la decisione nei casi di Da fare (docs/changelog/2026-11-13-admin-ia-propone.md).
ALTER TABLE "reviews" ADD COLUMN "correctionRequestedAt" TIMESTAMP(3);

CREATE TABLE "admin_case_advice" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ground" TEXT,
    "note" TEXT,
    "draft" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminDecision" TEXT,
    "adminDecidedAt" TIMESTAMP(3),
    "agrees" BOOLEAN,

    CONSTRAINT "admin_case_advice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_case_advice_kind_caseId_key" ON "admin_case_advice"("kind", "caseId");
CREATE INDEX "admin_case_advice_kind_adminDecidedAt_idx" ON "admin_case_advice"("kind", "adminDecidedAt");

-- Il sito impara (docs/changelog/2026-11-27-il-sito-impara.md): banco di prova
-- con gli errori veri dell'IA, giri del banco, regole approvate per l'IA
-- dell'Admin. Solo additiva.
ALTER TABLE "admin_case_advice" ADD COLUMN "caseText" TEXT;
ALTER TABLE "admin_case_advice" ADD COLUMN "allowed" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "ai_bank_cases" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "kind" TEXT,
    "input" TEXT NOT NULL,
    "withPhoto" BOOLEAN NOT NULL DEFAULT false,
    "allowed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiAnswer" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    CONSTRAINT "ai_bank_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_bank_cases_sourceKey_key" ON "ai_bank_cases"("sourceKey");
CREATE INDEX "ai_bank_cases_area_createdAt_idx" ON "ai_bank_cases"("area", "createdAt");

CREATE TABLE "ai_bank_runs" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "instructionsHash" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "correct" INTEGER NOT NULL,
    "wrongIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_bank_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_bank_runs_area_ranAt_idx" ON "ai_bank_runs"("area", "ranAt");

CREATE TABLE "ai_rules" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    CONSTRAINT "ai_rules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_rules_removedAt_idx" ON "ai_rules"("removedAt");

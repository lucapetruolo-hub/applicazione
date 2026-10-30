-- Coda "Da fare" dell'area admin: chi ha preso un caso.
CREATE TABLE "admin_case_claims" (
    "caseKey" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_case_claims_pkey" PRIMARY KEY ("caseKey")
);

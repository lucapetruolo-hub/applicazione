-- Account sospetti salvati dal controllo del mattino (docs/changelog/2026-10-30-admin-persone.md).
CREATE TABLE "suspicious_accounts" (
    "userId" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "suspicious_accounts_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "suspicious_accounts_checks" (
    "id" TEXT NOT NULL DEFAULT 'ultimo',
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suspicious_accounts_checks_pkey" PRIMARY KEY ("id")
);

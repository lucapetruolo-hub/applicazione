-- CreateTable
CREATE TABLE "revoked_sessions" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");

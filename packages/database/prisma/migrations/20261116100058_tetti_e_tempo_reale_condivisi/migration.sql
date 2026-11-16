-- Tetti giornalieri, biglietti e eventi del tempo reale condivisi tra le copie
-- dell'API (docs/changelog/2026-11-16-traffico-elevato.md). Solo tabelle nuove.
-- CreateTable
CREATE TABLE "daily_budget_usage" (
    "name" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_budget_usage_pkey" PRIMARY KEY ("name","day")
);

-- CreateTable
CREATE TABLE "realtime_tickets" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "jti" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "realtime_tickets_pkey" PRIMARY KEY ("codeHash")
);

-- CreateTable
CREATE TABLE "realtime_events" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "realtime_tickets_expiresAt_idx" ON "realtime_tickets"("expiresAt");

-- CreateIndex
CREATE INDEX "realtime_events_createdAt_idx" ON "realtime_events"("createdAt");

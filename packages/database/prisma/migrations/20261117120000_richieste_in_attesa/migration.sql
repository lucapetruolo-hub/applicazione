-- Richieste in attesa di un mestiere che nessuno fa ancora vicino al cliente
-- (docs/changelog/2026-11-17-richieste-in-attesa.md). Solo colonne nuove.
ALTER TABLE "guided_requests" ADD COLUMN "waitingTrade" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "waitingTradeKey" TEXT;
ALTER TABLE "guided_requests" ADD COLUMN "stillNeededAskedAt" TIMESTAMP(3);

CREATE INDEX "guided_requests_waitingTrade_status_idx" ON "guided_requests"("waitingTrade", "status");

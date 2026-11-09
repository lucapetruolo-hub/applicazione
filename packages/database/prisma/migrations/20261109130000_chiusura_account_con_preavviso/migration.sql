-- Sospensione con la regola violata e chiusura dell'account con preavviso
-- (controllo pre-lancio 08/11/2026, E4-03).
ALTER TABLE "users" ADD COLUMN "suspensionGround" TEXT;
ALTER TABLE "users" ADD COLUMN "closureScheduledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_closureScheduledAt_idx" ON "users"("closureScheduledAt");

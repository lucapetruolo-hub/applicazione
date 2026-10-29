-- Email delle notifiche rimandate al riassunto della sera o al mattino
-- (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md).
ALTER TABLE "notifications" ADD COLUMN "emailHoldUntil" TIMESTAMP(3);

CREATE INDEX "notifications_emailHoldUntil_idx" ON "notifications"("emailHoldUntil");

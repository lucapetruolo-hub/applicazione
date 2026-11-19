-- "Non serve risposta" sulle chat di "Ti stanno aspettando" (pagina Oggi).
CREATE TABLE "chat_reply_dismissals" (
    "guidedRequestId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_reply_dismissals_pkey" PRIMARY KEY ("guidedRequestId","professionalProfileId")
);

CREATE INDEX "chat_reply_dismissals_professionalProfileId_idx" ON "chat_reply_dismissals"("professionalProfileId");

ALTER TABLE "chat_reply_dismissals" ADD CONSTRAINT "chat_reply_dismissals_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_reply_dismissals" ADD CONSTRAINT "chat_reply_dismissals_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Promemoria la mattina dopo per i lavori non chiusi da nessuno (pagina Oggi).
ALTER TABLE "bookings" ADD COLUMN "closeReminderSentAt" TIMESTAMP(3);

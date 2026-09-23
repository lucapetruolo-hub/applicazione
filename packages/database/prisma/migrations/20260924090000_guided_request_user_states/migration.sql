-- Azioni del menu hamburger sulle schede richiesta (docs/CHANGELOG.md §130):
-- stato personale per (utente, richiesta) + segnalazione di una richiesta.
-- AlterEnum
ALTER TYPE "ContentReportTargetType" ADD VALUE 'GUIDED_REQUEST';

-- CreateTable
CREATE TABLE "guided_request_user_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guidedRequestId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "mutedAt" TIMESTAMP(3),
    "markedUnreadAt" TIMESTAMP(3),
    "remindAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guided_request_user_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guided_request_user_states_remindAt_idx" ON "guided_request_user_states"("remindAt");

-- CreateIndex
CREATE UNIQUE INDEX "guided_request_user_states_userId_guidedRequestId_key" ON "guided_request_user_states"("userId", "guidedRequestId");

-- AddForeignKey
ALTER TABLE "guided_request_user_states" ADD CONSTRAINT "guided_request_user_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_request_user_states" ADD CONSTRAINT "guided_request_user_states_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


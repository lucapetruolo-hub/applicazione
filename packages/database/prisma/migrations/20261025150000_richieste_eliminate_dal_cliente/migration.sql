-- "Elimina richiesta" del cliente (docs/CHANGELOG.md §337): la richiesta si
-- nasconde invece di sparire subito dal database.
CREATE TYPE "GuidedRequestWithdrawReason" AS ENUM ('FOUND_ELSEWHERE', 'NO_LONGER_NEEDED', 'MISTAKE');

ALTER TABLE "guided_requests" ADD COLUMN "deletedByClientAt" TIMESTAMP(3),
ADD COLUMN "withdrawReason" "GuidedRequestWithdrawReason",
ADD COLUMN "deletedWhileOpen" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "guided_requests_deletedByClientAt_idx" ON "guided_requests"("deletedByClientAt");

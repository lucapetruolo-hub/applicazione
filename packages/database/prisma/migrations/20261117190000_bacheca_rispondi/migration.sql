-- Bacheca "Lavori cercati", PR 2 (docs/changelog/2026-11-17-bacheca-rispondi.md).
-- Solo una colonna e due tabelle nuove.
-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "fromBoardAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "board_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guidedRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_alerts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "board_claims_guidedRequestId_idx" ON "board_claims"("guidedRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "board_claims_userId_guidedRequestId_key" ON "board_claims"("userId", "guidedRequestId");

-- CreateIndex
CREATE INDEX "board_alerts_trade_province_idx" ON "board_alerts"("trade", "province");

-- CreateIndex
CREATE UNIQUE INDEX "board_alerts_email_trade_province_key" ON "board_alerts"("email", "trade", "province");

-- AddForeignKey
ALTER TABLE "board_claims" ADD CONSTRAINT "board_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_claims" ADD CONSTRAINT "board_claims_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;


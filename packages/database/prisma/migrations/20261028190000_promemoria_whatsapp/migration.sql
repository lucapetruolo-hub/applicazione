-- Promemoria su WhatsApp con Meta (docs/changelog/2026-10-28-promemoria-whatsapp.md).
-- CreateEnum
CREATE TYPE "OutboundMessageChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phoneCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "phoneCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "phoneCodeHash" TEXT,
ADD COLUMN     "phoneCodeNumber" TEXT,
ADD COLUMN     "phoneCodeSentAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedNumber" TEXT,
ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptOutAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL,
    "channel" "OutboundMessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "params" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "bookingId" TEXT,
    "status" "OutboundMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "costMicroEur" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_idempotencyKey_key" ON "outbound_messages"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_providerMessageId_key" ON "outbound_messages"("providerMessageId");

-- CreateIndex
CREATE INDEX "outbound_messages_status_sendAfter_idx" ON "outbound_messages"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "outbound_messages_userId_createdAt_idx" ON "outbound_messages"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "outbound_messages_bookingId_idx" ON "outbound_messages"("bookingId");

-- CreateIndex
CREATE INDEX "outbound_messages_createdAt_idx" ON "outbound_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


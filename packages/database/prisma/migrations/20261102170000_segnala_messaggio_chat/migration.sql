-- AlterEnum
ALTER TYPE "ContentReportTargetType" ADD VALUE 'CHAT_MESSAGE';

-- AlterTable
ALTER TABLE "conversation_events" ADD COLUMN     "hiddenAt" TIMESTAMP(3);

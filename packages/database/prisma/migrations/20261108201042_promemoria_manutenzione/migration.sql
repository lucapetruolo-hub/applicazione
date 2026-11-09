-- AlterTable
ALTER TABLE "guided_request_user_states" ADD COLUMN     "rebookRemindAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "guided_request_user_states_rebookRemindAt_idx" ON "guided_request_user_states"("rebookRemindAt");

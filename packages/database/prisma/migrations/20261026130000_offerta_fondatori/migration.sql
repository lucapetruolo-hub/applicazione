-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "founderNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_founderNumber_key" ON "subscriptions"("founderNumber");

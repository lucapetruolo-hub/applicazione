-- AlterTable
ALTER TABLE "professional_profiles" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "professional_profiles_stripeCustomerId_key" ON "professional_profiles"("stripeCustomerId");


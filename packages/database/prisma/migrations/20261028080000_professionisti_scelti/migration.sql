-- AlterTable
ALTER TABLE "guided_requests" ADD COLUMN     "chosenProfileIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

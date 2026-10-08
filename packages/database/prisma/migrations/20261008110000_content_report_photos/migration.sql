-- AlterTable
ALTER TABLE "content_reports" ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

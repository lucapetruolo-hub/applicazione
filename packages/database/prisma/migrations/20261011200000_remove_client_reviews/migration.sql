-- Niente più recensioni del professionista al cliente (docs/CHANGELOG.md §215,
-- decisione dell'utente): si cancellano i dati, le segnalazioni su quelle
-- recensioni e le recensioni automatiche a 5 stelle generate dal vecchio
-- "doppio cieco".
DELETE FROM "content_reports" WHERE "targetType" = 'CLIENT_REVIEW';
DELETE FROM "reviews" WHERE "isAutomatic" = true;

-- AlterEnum
BEGIN;
CREATE TYPE "ContentReportTargetType_new" AS ENUM ('PROFESSIONAL_PROFILE', 'REVIEW', 'GUIDED_REQUEST');
ALTER TABLE "content_reports" ALTER COLUMN "targetType" TYPE "ContentReportTargetType_new" USING ("targetType"::text::"ContentReportTargetType_new");
ALTER TYPE "ContentReportTargetType" RENAME TO "ContentReportTargetType_old";
ALTER TYPE "ContentReportTargetType_new" RENAME TO "ContentReportTargetType";
DROP TYPE "ContentReportTargetType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "client_reviews" DROP CONSTRAINT "client_reviews_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "client_reviews" DROP CONSTRAINT "client_reviews_clientId_fkey";

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "isAutomatic";

-- DropTable
DROP TABLE "client_reviews";

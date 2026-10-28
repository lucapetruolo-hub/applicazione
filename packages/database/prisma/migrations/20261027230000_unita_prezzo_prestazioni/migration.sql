-- CreateEnum
CREATE TYPE "ServicePriceUnit" AS ENUM ('JOB', 'HOUR', 'DAY', 'SQUARE_METER');

-- AlterTable
ALTER TABLE "professional_services" ADD COLUMN "priceUnit" "ServicePriceUnit" NOT NULL DEFAULT 'JOB';

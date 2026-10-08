-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "clientNote" TEXT,
ADD COLUMN     "previousPriceMaxEurCents" INTEGER,
ADD COLUMN     "previousPriceMinEurCents" INTEGER;

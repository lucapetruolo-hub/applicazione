-- Carta usata per acconto e saldo (marca, ultime 4 cifre, portafoglio): solo colonne nuove.
ALTER TABLE "job_payments" ADD COLUMN "depositCardBrand" TEXT,
ADD COLUMN "depositCardLast4" TEXT,
ADD COLUMN "depositCardWallet" TEXT,
ADD COLUMN "balanceCardBrand" TEXT,
ADD COLUMN "balanceCardLast4" TEXT,
ADD COLUMN "balanceCardWallet" TEXT;

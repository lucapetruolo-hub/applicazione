-- Dichiarazione a "lavoro terminato" (docs/CHANGELOG.md §246)
ALTER TABLE "bookings" ADD COLUMN "completionDeclarationAcceptedAt" TIMESTAMP(3),
ADD COLUMN "completionDeclarationVersion" TEXT;

-- Colonne diretti / online e avviso annuale nel riepilogo DAC7
ALTER TABLE "dac7_records" ADD COLUMN "directConsiderationEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "onlineConsiderationEurCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sellerNotifiedAt" TIMESTAMP(3);

-- IBAN di chi incassa online, cifrato
CREATE TABLE "professional_payout_accounts" (
    "id" TEXT NOT NULL,
    "fiscalProfileId" TEXT NOT NULL,
    "ibanEncrypted" TEXT NOT NULL,
    "ibanCountry" TEXT NOT NULL,
    "ibanLast4" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "stripeCheck" TEXT,
    "stripeCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "professional_payout_accounts_fiscalProfileId_key" ON "professional_payout_accounts"("fiscalProfileId");

ALTER TABLE "professional_payout_accounts" ADD CONSTRAINT "professional_payout_accounts_fiscalProfileId_fkey" FOREIGN KEY ("fiscalProfileId") REFERENCES "professional_fiscal_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

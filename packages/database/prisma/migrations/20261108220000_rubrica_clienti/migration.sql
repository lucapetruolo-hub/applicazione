-- CreateTable
CREATE TABLE "professional_client_notes" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professional_client_notes_professionalProfileId_clientKey_key" ON "professional_client_notes"("professionalProfileId", "clientKey");

-- AddForeignKey
ALTER TABLE "professional_client_notes" ADD CONSTRAINT "professional_client_notes_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

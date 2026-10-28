-- CreateTable
CREATE TABLE "courtesy_documents" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER,
    "ownNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courtesy_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "courtesy_documents_bookingId_key" ON "courtesy_documents"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "courtesy_documents_professionalProfileId_year_number_key" ON "courtesy_documents"("professionalProfileId", "year", "number");

-- AddForeignKey
ALTER TABLE "courtesy_documents" ADD CONSTRAINT "courtesy_documents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


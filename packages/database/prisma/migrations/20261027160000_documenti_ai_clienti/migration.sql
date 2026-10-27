-- AlterTable
ALTER TABLE "courtesy_documents" ADD COLUMN     "pdfDownloadedAt" TIMESTAMP(3),
ADD COLUMN     "pdfTotalEurCents" INTEGER;

-- CreateIndex
CREATE INDEX "courtesy_documents_createdAt_idx" ON "courtesy_documents"("createdAt");

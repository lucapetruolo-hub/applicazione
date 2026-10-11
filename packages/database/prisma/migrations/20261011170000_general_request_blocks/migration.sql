-- CreateTable
CREATE TABLE "general_request_blocks" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "reopenedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "keepOpenUntil" TIMESTAMP(3),

    CONSTRAINT "general_request_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "general_request_blocks_categoryId_city_key" ON "general_request_blocks"("categoryId", "city");

-- AddForeignKey
ALTER TABLE "general_request_blocks" ADD CONSTRAINT "general_request_blocks_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;


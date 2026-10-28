-- CreateTable
CREATE TABLE "standard_service_names" (
    "id" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_service_names_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "standard_service_names_categorySlug_name_key" ON "standard_service_names"("categorySlug", "name");

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "signupCategorySlugs" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "_ProfessionalExtraCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_ProfessionalExtraCategories_AB_unique" ON "_ProfessionalExtraCategories"("A", "B");

-- CreateIndex
CREATE INDEX "_ProfessionalExtraCategories_B_index" ON "_ProfessionalExtraCategories"("B");

-- AddForeignKey
ALTER TABLE "_ProfessionalExtraCategories" ADD CONSTRAINT "_ProfessionalExtraCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfessionalExtraCategories" ADD CONSTRAINT "_ProfessionalExtraCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


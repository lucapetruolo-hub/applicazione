-- Prisma 6 (docs/CHANGELOG.md §300): le tabelle delle relazioni molti-a-molti
-- implicite usano una chiave primaria invece di un indice unico. Stessi dati,
-- nessuna riga toccata.

-- AlterTable
ALTER TABLE "_ProfessionalExtraCategories" ADD CONSTRAINT "_ProfessionalExtraCategories_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ProfessionalExtraCategories_AB_unique";

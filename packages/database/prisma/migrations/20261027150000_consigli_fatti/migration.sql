-- Andamento del sito (docs/CHANGELOG.md §372): passi della richiesta divisi per
-- provenienza (generale o dalla pagina di un professionista) e consigli segnati come fatti.
-- AlterTable
ALTER TABLE "request_step_days" DROP CONSTRAINT "request_step_days_pkey",
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'GENERAL',
ADD CONSTRAINT "request_step_days_pkey" PRIMARY KEY ("step", "categorySlug", "origin", "day");

-- CreateTable
CREATE TABLE "site_advice_done" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT,

    CONSTRAINT "site_advice_done_pkey" PRIMARY KEY ("key")
);


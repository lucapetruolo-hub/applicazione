-- Ricerche per categoria, contate per giorno e città (docs/CHANGELOG.md §281).
CREATE TABLE "category_search_days" (
    "categoryId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "category_search_days_pkey" PRIMARY KEY ("categoryId","city","day")
);

CREATE INDEX "category_search_days_day_idx" ON "category_search_days"("day");

ALTER TABLE "category_search_days" ADD CONSTRAINT "category_search_days_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

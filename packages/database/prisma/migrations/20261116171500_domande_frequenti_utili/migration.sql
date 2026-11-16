-- "Ti è stata utile?" sotto le domande frequenti (docs/changelog/2026-11-16-domande-frequenti.md).
CREATE TABLE "faq_feedback_days" (
    "faqId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "yes" INTEGER NOT NULL DEFAULT 0,
    "no" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "faq_feedback_days_pkey" PRIMARY KEY ("faqId","day")
);
CREATE INDEX "faq_feedback_days_day_idx" ON "faq_feedback_days"("day");

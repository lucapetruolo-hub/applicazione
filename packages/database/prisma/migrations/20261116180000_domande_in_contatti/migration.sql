-- Le tre domande frequenti sotto "Chi sei?" in Contatti (docs/changelog/2026-11-16-domande-frequenti.md).
CREATE TABLE "contact_faq_picks" (
    "audience" TEXT NOT NULL,
    "faqIds" TEXT[],
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_faq_picks_pkey" PRIMARY KEY ("audience")
);

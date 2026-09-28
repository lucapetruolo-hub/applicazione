-- Account in pausa, rinnovo automatico e annullamento (docs/CHANGELOG.md §162).
ALTER TABLE "professional_profiles" ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedReason" TEXT;

ALTER TABLE "subscriptions" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "periodNoticeFor" TIMESTAMP(3);

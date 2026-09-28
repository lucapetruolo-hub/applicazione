-- Abbonamento unico a livelli e prova gratuita (docs/CHANGELOG.md §161).
ALTER TYPE "SubscriptionPlan" ADD VALUE 'BASE';
ALTER TYPE "SubscriptionPlan" ADD VALUE 'PLUS';

ALTER TYPE "SubscriptionStatus" ADD VALUE 'TRIALING';

ALTER TABLE "subscriptions" ADD COLUMN     "bonusMonthGrantedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndingNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "usageNoticeKey" TEXT;

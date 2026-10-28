-- Email "limite tolto" ai pagamenti online (docs/changelog/2026-10-28-tetto-pagamenti-online.md).
ALTER TABLE "professional_profiles" ADD COLUMN "onlineLimitLiftNotifiedAt" TIMESTAMP(3);

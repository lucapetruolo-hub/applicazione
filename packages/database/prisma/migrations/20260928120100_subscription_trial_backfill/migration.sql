-- Primo mese gratis anche per i professionisti già iscritti (docs/CHANGELOG.md
-- §161): il mese parte da oggi. Migrazione separata dalla precedente perché
-- un valore di enum appena aggiunto ('TRIALING') si può usare solo dopo che
-- la sua migrazione è stata applicata.
INSERT INTO "subscriptions" ("id", "professionalProfileId", "plan", "status", "trialEndsAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, p."id", 'FREE', 'TRIALING', NOW() + INTERVAL '30 days', NOW(), NOW()
FROM "professional_profiles" p
WHERE p."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."professionalProfileId" = p."id");

UPDATE "subscriptions"
SET "status" = 'TRIALING', "trialEndsAt" = NOW() + INTERVAL '30 days', "updatedAt" = NOW()
WHERE "plan" = 'FREE' AND "stripeSubscriptionId" IS NULL;

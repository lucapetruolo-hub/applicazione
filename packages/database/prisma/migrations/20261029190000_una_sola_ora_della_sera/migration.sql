-- Una sola ora della sera per sito, email e WhatsApp (Luca, 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md):
-- chi aveva scelto un'ora per il riepilogo su WhatsApp la ritrova in notificationPrefs.digestHour,
-- se non ne aveva già scelta una lì. La colonna whatsappDigestHour resta, non più usata.
UPDATE "users"
SET "notificationPrefs" = jsonb_set(COALESCE("notificationPrefs"::jsonb, '{}'::jsonb), '{digestHour}', to_jsonb("whatsappDigestHour"))
WHERE "whatsappDigestHour" BETWEEN 18 AND 21
  AND ("notificationPrefs" IS NULL OR NOT ("notificationPrefs"::jsonb ? 'digestHour'));

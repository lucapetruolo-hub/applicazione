-- Colonne non più usate dal 17/11 (le foto stanno in photo_handoff_photos,
-- docs/changelog/2026-11-17-piu-foto-dal-telefono.md). Tolte in una PR a parte,
-- dopo il deploy del codice che non le usa più (docs/ops/rollback.md).
-- Dentro ci sono al massimo foto di 10 minuti, già scadute: nessun dato da tenere.
ALTER TABLE "photo_handoffs" DROP COLUMN "photo",
DROP COLUMN "mediaType";

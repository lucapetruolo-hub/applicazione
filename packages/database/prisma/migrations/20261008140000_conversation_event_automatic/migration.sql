-- Messaggi automatici della chat (docs/CHANGELOG.md §198): da ora li segna
-- TimelineService.log. Per quelli già salvati, stessi inizi di frase che
-- usa solo il sistema (gli aggiornamenti scritti a mano restano false).
ALTER TABLE "conversation_events" ADD COLUMN "automatic" BOOLEAN NOT NULL DEFAULT false;

UPDATE "conversation_events"
SET "automatic" = true
WHERE "message" LIKE 'Il cliente %'
   OR "message" LIKE 'Il professionista %'
   OR "message" LIKE 'La richiesta %'
   OR "message" LIKE 'Richiesta inoltrata a te%'
   OR "message" LIKE 'Nessun professionista%';

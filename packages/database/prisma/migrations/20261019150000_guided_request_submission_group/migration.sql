-- Richieste nate dallo stesso invio con più categorie (docs/CHANGELOG.md §259):
-- stesso identificativo, per mostrare "Inviata insieme a …" al cliente.
ALTER TABLE "guided_requests" ADD COLUMN "submissionGroupId" TEXT;

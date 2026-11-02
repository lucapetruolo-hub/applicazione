-- Risposta del professionista alle recensioni e aggiornamento del cliente dopo una segnalazione a lavoro chiuso.
ALTER TABLE "reviews" ADD COLUMN "professionalReply" TEXT;
ALTER TABLE "reviews" ADD COLUMN "professionalRepliedAt" TIMESTAMP(3);
ALTER TABLE "reviews" ADD COLUMN "updatedAfterIssueAt" TIMESTAMP(3);

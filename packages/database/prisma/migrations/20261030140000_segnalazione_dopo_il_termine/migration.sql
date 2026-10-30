-- Segnalazione dopo il termine: senza rimborso, resta tra cliente e professionista.
ALTER TABLE "job_issues" ADD COLUMN "late" BOOLEAN NOT NULL DEFAULT false;

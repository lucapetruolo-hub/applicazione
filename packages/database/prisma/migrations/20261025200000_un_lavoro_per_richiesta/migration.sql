-- Un solo lavoro attivo per richiesta (docs/CHANGELOG.md §344): accettare un
-- secondo preventivo della stessa richiesta creava un secondo lavoro.
ALTER TABLE "bookings" ADD COLUMN "guidedRequestId" TEXT;

UPDATE "bookings" b
SET "guidedRequestId" = q."guidedRequestId"
FROM "quotes" q
WHERE b."quoteId" = q."id";

-- La richiesta si ricava sempre dal preventivo: nessun percorso del codice
-- può dimenticarla.
CREATE FUNCTION "bookings_set_guided_request_id"() RETURNS trigger AS $$
BEGIN
  IF NEW."quoteId" IS NULL THEN
    NEW."guidedRequestId" := NULL;
  ELSE
    SELECT q."guidedRequestId" INTO NEW."guidedRequestId" FROM "quotes" q WHERE q."id" = NEW."quoteId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bookings_set_guided_request_id"
BEFORE INSERT OR UPDATE OF "quoteId", "guidedRequestId" ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "bookings_set_guided_request_id"();

-- Se in produzione esistesse già una richiesta con due lavori attivi questa
-- riga fallisce e il deploy si ferma: va prima deciso a mano quale tenere
-- (query 1 di analisi/preventivo-accettato/query-dati-veri.sql).
CREATE UNIQUE INDEX "bookings_one_active_job_per_request"
ON "bookings"("guidedRequestId")
WHERE "status" <> 'CANCELED';

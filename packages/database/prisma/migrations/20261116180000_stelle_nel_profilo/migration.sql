-- Stelle e numero di recensioni salvati nel profilo
-- (docs/changelog/2026-11-16-stelle-nel-profilo.md). La ricerca ordina e
-- divide in pagine nel database senza contare ogni volta le recensioni di
-- tutti i trovati.
ALTER TABLE "professional_profiles" ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "professional_profiles" ADD COLUMN "reviewRating" DOUBLE PRECISION;

-- Ricalcolo per un professionista. Stesse regole di loadReviewStats
-- (apps/api/src/professionals/review-stats.ts): contano le recensioni non
-- nascoste e la media si arrotonda a un decimale con gli stessi conti del
-- codice: Math.round(media * 10) / 10 su un double. Math.round(x) è
-- floor(x + 0.5); round() di Postgres su un double arrotonda il mezzo al pari
-- (42,5 → 42) e darebbe 4,2 dove il sito ha sempre mostrato 4,3.
CREATE FUNCTION "professional_review_stats_refresh"(profile_id TEXT) RETURNS void AS $$
  UPDATE "professional_profiles" p
  SET "reviewCount" = s.count,
      "reviewRating" = CASE WHEN s.count = 0 THEN NULL ELSE floor(s.average * 10 + 0.5) / 10 END
  FROM (
    SELECT COUNT(r."id")::int AS count, AVG(r."rating")::float8 AS average
    FROM "reviews" r
    JOIN "bookings" b ON b."id" = r."bookingId"
    WHERE r."hiddenAt" IS NULL AND b."professionalProfileId" = profile_id
  ) s
  WHERE p."id" = profile_id;
$$ LANGUAGE sql;

-- Ogni recensione nuova, cambiata (voto, nascosta, ripubblicata) o cancellata
-- aggiorna il professionista: nessun percorso del codice può dimenticarlo.
CREATE FUNCTION "reviews_refresh_professional_stats"() RETURNS trigger AS $$
DECLARE
  profile_id TEXT;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    SELECT b."professionalProfileId" INTO profile_id FROM "bookings" b WHERE b."id" = NEW."bookingId";
    IF profile_id IS NOT NULL THEN PERFORM "professional_review_stats_refresh"(profile_id); END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    SELECT b."professionalProfileId" INTO profile_id FROM "bookings" b WHERE b."id" = OLD."bookingId";
    IF profile_id IS NOT NULL THEN PERFORM "professional_review_stats_refresh"(profile_id); END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reviews_refresh_professional_stats"
AFTER INSERT OR DELETE OR UPDATE OF "rating", "hiddenAt", "bookingId" ON "reviews"
FOR EACH ROW EXECUTE FUNCTION "reviews_refresh_professional_stats"();

-- Un lavoro cancellato si porta via la sua recensione (ON DELETE CASCADE):
-- quando questo trigger parte la recensione non c'è più e il conto torna giusto.
CREATE FUNCTION "bookings_refresh_professional_stats"() RETURNS trigger AS $$
BEGIN
  PERFORM "professional_review_stats_refresh"(OLD."professionalProfileId");
  IF TG_OP = 'UPDATE' THEN PERFORM "professional_review_stats_refresh"(NEW."professionalProfileId"); END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bookings_refresh_professional_stats"
AFTER DELETE OR UPDATE OF "professionalProfileId" ON "bookings"
FOR EACH ROW EXECUTE FUNCTION "bookings_refresh_professional_stats"();

-- I professionisti che hanno già recensioni.
SELECT "professional_review_stats_refresh"(p."id") FROM "professional_profiles" p;

import Link from "next/link";
import { Rating, Text, brand } from "@professionisti/ui";
import type { ProfessionalReviewSummary } from "@professionisti/api-client";
import { formatRating } from "@professionisti/shared";

/**
 * Stelle e numero di recensioni sotto il nome del professionista nelle
 * schede del cliente (/le-mie-richieste), per scegliere tra più preventivi
 * (docs/CHANGELOG.md §340). Senza recensioni la stessa scritta del profilo
 * pubblico; niente per un profilo eliminato.
 */
export function ProfessionalReviewsSummary({ reviews }: { reviews: ProfessionalReviewSummary | null }) {
  if (!reviews) return null;
  if (reviews.rating === null) {
    return (
      <Text fontSize={13} color={brand.grafite70}>
        Nessuna recensione ancora
      </Text>
    );
  }
  return <Rating value={reviews.rating} count={reviews.count} size={13} textSize={13} />;
}

/** Come sopra, con il link alle recensioni del profilo pubblico (dove la riga non è già un link). */
export function ProfessionalReviewsLink({ professionalProfileId, reviews }: { professionalProfileId: string; reviews: ProfessionalReviewSummary | null }) {
  if (!reviews || reviews.rating === null) return <ProfessionalReviewsSummary reviews={reviews} />;
  const label = `Valutazione ${formatRating(reviews.rating)} su 5, ${reviews.count} recension${reviews.count === 1 ? "e" : "i"}: vedi le recensioni`;
  return (
    <Link href={`/professionista/${professionalProfileId}#recensioni`} aria-label={label} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
      <ProfessionalReviewsSummary reviews={reviews} />
    </Link>
  );
}

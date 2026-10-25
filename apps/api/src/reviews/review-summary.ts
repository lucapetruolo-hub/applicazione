import type { PrismaClient } from "@professionisti/database";

/** Media (una cifra decimale) e numero delle recensioni visibili di un professionista. */
export type ReviewSummary = { rating: number | null; count: number };

/** Stesso calcolo del profilo pubblico e della ricerca: recensioni nascoste da un admin escluse (§144). */
export function summarizeReviews(ratings: number[]): ReviewSummary {
  const count = ratings.length;
  if (count === 0) return { rating: null, count: 0 };
  return { rating: Math.round((ratings.reduce((sum, value) => sum + value, 0) / count) * 10) / 10, count };
}

/**
 * Valutazione di più professionisti con una sola query, per le schede del
 * cliente in /le-mie-richieste (docs/CHANGELOG.md §342): un professionista
 * senza recensioni ha `{ rating: null, count: 0 }`.
 */
export async function reviewSummariesFor(prisma: PrismaClient, professionalProfileIds: string[]): Promise<Map<string, ReviewSummary>> {
  const ids = [...new Set(professionalProfileIds)];
  const ratingsById = new Map<string, number[]>(ids.map((id) => [id, []]));
  if (ids.length > 0) {
    const reviews = await prisma.review.findMany({
      where: { hiddenAt: null, booking: { professionalProfileId: { in: ids } } },
      select: { rating: true, booking: { select: { professionalProfileId: true } } },
    });
    for (const review of reviews) ratingsById.get(review.booking.professionalProfileId)?.push(review.rating);
  }
  return new Map([...ratingsById].map(([id, ratings]) => [id, summarizeReviews(ratings)]));
}

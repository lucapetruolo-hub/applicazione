import { Prisma, type PrismaClient } from "@professionisti/database";

/**
 * Stelle, numero di recensioni e lavori finiti nel mese contati dal database
 * (docs/changelog/2026-11-16-traffico-elevato.md). Prima la ricerca caricava
 * ogni lavoro con la sua recensione per ogni professionista e li contava qui:
 * con qualche migliaio di professionisti l'API finiva la memoria. Stesse
 * regole di prima: contano le recensioni non nascoste, la media è
 * arrotondata a un decimale.
 */
export type ReviewStats = { reviewCount: number; rating: number | null; lastReviewAt: Date | null; completedThisMonth: number };

const EMPTY: ReviewStats = { reviewCount: 0, rating: null, lastReviewAt: null, completedThisMonth: 0 };

export function emptyReviewStats(): ReviewStats {
  return { ...EMPTY };
}

/** Media arrotondata a un decimale, come la scheda ha sempre mostrato. */
export function roundRating(average: number | null, count: number): number | null {
  if (count === 0 || average === null) return null;
  return Math.round(average * 10) / 10;
}

export async function loadReviewStats(
  prisma: Pick<PrismaClient, "$queryRaw" | "booking">,
  profileIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ReviewStats>> {
  const stats = new Map<string, ReviewStats>();
  if (profileIds.length === 0) return stats;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [reviewRows, completedRows] = await Promise.all([
    prisma.$queryRaw<{ profileId: string; count: bigint; average: number | null; last: Date | null }[]>(Prisma.sql`
      SELECT b."professionalProfileId" AS "profileId", COUNT(r.id) AS count, AVG(r.rating)::float8 AS average, MAX(r."createdAt") AS last
      FROM reviews r
      JOIN bookings b ON b.id = r."bookingId"
      WHERE r."hiddenAt" IS NULL AND b."professionalProfileId" IN (${Prisma.join(profileIds)})
      GROUP BY b."professionalProfileId"
    `),
    prisma.booking.groupBy({
      by: ["professionalProfileId"],
      where: { professionalProfileId: { in: profileIds }, status: "COMPLETED", updatedAt: { gte: monthStart, lt: nextMonthStart } },
      _count: { _all: true },
    }),
  ]);
  for (const id of profileIds) stats.set(id, emptyReviewStats());
  for (const row of reviewRows) {
    const count = Number(row.count);
    stats.set(row.profileId, { ...stats.get(row.profileId)!, reviewCount: count, rating: roundRating(row.average, count), lastReviewAt: row.last });
  }
  for (const row of completedRows) {
    const current = stats.get(row.professionalProfileId);
    if (current) current.completedThisMonth = row._count._all;
  }
  return stats;
}

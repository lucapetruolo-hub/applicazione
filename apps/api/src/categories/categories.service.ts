import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

/** Richieste dell'ultimo anno: abbastanza per un ordine stabile, non vecchie di anni. */
const POPULARITY_WINDOW_DAYS = 365;
/** Sotto queste richieste in città l'ordine della sola città non dice nulla: si usa tutta Italia. */
export const MIN_CITY_REQUESTS = 5;

export type CategoryPopularity = {
  /** "CITY" se i conteggi sono della città chiesta, "ALL" se di tutta la piattaforma. */
  scope: "CITY" | "ALL";
  counts: { slug: string; count: number }[];
};

@Injectable()
export class CategoriesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Quante richieste di preventivo ha ricevuto ogni categoria (docs/CHANGELOG.md
   * §273, richiesta dell'utente: "i lavori più cercati prima" nella scelta dei
   * lavori). Con una città conta solo quella, se ha almeno
   * `MIN_CITY_REQUESTS` richieste; altrimenti tutta la piattaforma. Solo
   * numeri aggregati, nessun dato delle richieste.
   */
  async getPopularity(city?: string): Promise<CategoryPopularity> {
    const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const trimmedCity = city?.trim();
    const count = async (byCity: boolean) =>
      this.prisma.guidedRequest.groupBy({
        by: ["categoryId"],
        where: {
          createdAt: { gte: since },
          ...(byCity && trimmedCity ? { city: { equals: trimmedCity, mode: "insensitive" as const } } : {}),
        },
        _count: { _all: true },
      });

    let scope: CategoryPopularity["scope"] = "ALL";
    let groups = trimmedCity ? await count(true) : [];
    if (trimmedCity && groups.reduce((sum, group) => sum + group._count._all, 0) >= MIN_CITY_REQUESTS) {
      scope = "CITY";
    } else {
      groups = await count(false);
    }

    const categories = await this.prisma.category.findMany({
      where: { id: { in: groups.map((group) => group.categoryId) } },
      select: { id: true, slug: true },
    });
    const slugById = new Map(categories.map((category) => [category.id, category.slug]));
    const counts = groups
      .map((group) => ({ slug: slugById.get(group.categoryId), count: group._count._all }))
      .filter((item): item is { slug: string; count: number } => Boolean(item.slug))
      .sort((a, b) => b.count - a.count);
    return { scope, counts };
  }
}

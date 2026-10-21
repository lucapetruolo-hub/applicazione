import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

/** Richieste e ricerche dell'ultimo anno: abbastanza per un ordine stabile, non vecchie di anni. */
const POPULARITY_WINDOW_DAYS = 365;
/**
 * Una richiesta di preventivo pesa come 3 ricerche (docs/CHANGELOG.md §281):
 * chi chiede un preventivo vuole davvero quel lavoro, chi cerca a volte guarda
 * soltanto (e ricaricare la pagina conta di nuovo).
 */
export const REQUEST_WEIGHT = 3;
/** Sotto questo punteggio in città (5 richieste, o 15 ricerche) l'ordine della sola città non dice nulla: si usa tutta Italia. */
export const MIN_CITY_SCORE = 5 * REQUEST_WEIGHT;

export type CategoryPopularity = {
  /** "CITY" se i conteggi sono della città chiesta, "ALL" se di tutta la piattaforma. */
  scope: "CITY" | "ALL";
  /** `count`: richieste × `REQUEST_WEIGHT` + ricerche. */
  counts: { slug: string; count: number }[];
};

function normalizeCity(city?: string): string {
  return city?.trim().toLowerCase().slice(0, 100) ?? "";
}

@Injectable()
export class CategoriesService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Una ricerca per categoria (docs/CHANGELOG.md §281): contatore per giorno
   * e città, mai la singola ricerca né chi cerca. Una categoria sconosciuta
   * non conta.
   */
  async recordSearch(categorySlug: string, city?: string): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { slug: categorySlug }, select: { id: true } });
    if (!category) return;
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const normalizedCity = normalizeCity(city);
    await this.prisma.categorySearchDay.upsert({
      where: { categoryId_city_day: { categoryId: category.id, city: normalizedCity, day } },
      create: { categoryId: category.id, city: normalizedCity, day, count: 1 },
      update: { count: { increment: 1 } },
    });
  }

  /**
   * Quanto è cercata ogni categoria (docs/CHANGELOG.md §280-§281, richiesta
   * dell'utente: "i lavori più cercati prima" nella scelta dei lavori):
   * richieste di preventivo × `REQUEST_WEIGHT` + ricerche. Con una città
   * conta solo quella, se arriva a `MIN_CITY_SCORE`; altrimenti tutta la
   * piattaforma. Solo numeri aggregati, nessun dato delle richieste.
   */
  async getPopularity(city?: string): Promise<CategoryPopularity> {
    const since = new Date(Date.now() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const trimmedCity = city?.trim();
    const scores = async (byCity: boolean) => {
      const [requests, searches] = await Promise.all([
        this.prisma.guidedRequest.groupBy({
          by: ["categoryId"],
          where: {
            createdAt: { gte: since },
            ...(byCity && trimmedCity ? { city: { equals: trimmedCity, mode: "insensitive" as const } } : {}),
          },
          _count: { _all: true },
        }),
        this.prisma.categorySearchDay.groupBy({
          by: ["categoryId"],
          where: { day: { gte: since }, ...(byCity && trimmedCity ? { city: normalizeCity(trimmedCity) } : {}) },
          _sum: { count: true },
        }),
      ]);
      const byCategory = new Map<string, number>();
      for (const group of requests) byCategory.set(group.categoryId, (byCategory.get(group.categoryId) ?? 0) + group._count._all * REQUEST_WEIGHT);
      for (const group of searches) byCategory.set(group.categoryId, (byCategory.get(group.categoryId) ?? 0) + (group._sum.count ?? 0));
      return byCategory;
    };

    let scope: CategoryPopularity["scope"] = "ALL";
    let byCategory = trimmedCity ? await scores(true) : new Map<string, number>();
    if (trimmedCity && [...byCategory.values()].reduce((sum, score) => sum + score, 0) >= MIN_CITY_SCORE) {
      scope = "CITY";
    } else {
      byCategory = await scores(false);
    }

    const categories = await this.prisma.category.findMany({
      where: { id: { in: [...byCategory.keys()] } },
      select: { id: true, slug: true },
    });
    const slugById = new Map(categories.map((category) => [category.id, category.slug]));
    const counts = [...byCategory.entries()]
      .map(([categoryId, count]) => ({ slug: slugById.get(categoryId), count }))
      .filter((item): item is { slug: string; count: number } => Boolean(item.slug))
      .sort((a, b) => b.count - a.count);
    return { scope, counts };
  }
}

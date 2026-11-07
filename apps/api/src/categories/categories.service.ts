import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { orderPopularJobs, type PopularJobsResponse } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { countingFrom, daySinceLaunch } from "../site-counts/counted";

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

/** "Lavori più cercati" in home: le ricerche degli ultimi 90 giorni, ricalcolate al massimo ogni 10 minuti. */
const POPULAR_JOBS_WINDOW_DAYS = 90;
const POPULAR_JOBS_CACHE_MS = 10 * 60_000;

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
  private popularJobsCache: { at: number; value: PopularJobsResponse } | null = null;

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * "Lavori più cercati" in home (docs/changelog/2026-11-07-lavori-piu-cercati-home.md):
   * le prestazioni dell'elenco suggerito più cercate sul sito negli ultimi 90
   * giorni, dal lancio (`ServiceSearchDay`, solo contatori per giorno). Con
   * poche ricerche, l'elenco di partenza (`orderPopularJobs`).
   */
  async getPopularJobs(now: Date = new Date()): Promise<PopularJobsResponse> {
    if (this.popularJobsCache && now.getTime() - this.popularJobsCache.at < POPULAR_JOBS_CACHE_MS) return this.popularJobsCache.value;
    const since = new Date(now.getTime() - POPULAR_JOBS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.serviceSearchDay.groupBy({
      by: ["categorySlug", "service"],
      where: { day: { gte: daySinceLaunch(since, countingFrom(now)) } },
      _sum: { count: true },
    });
    const value = orderPopularJobs(rows.map((row) => ({ categorySlug: row.categorySlug, service: row.service, searches: row._sum.count ?? 0 })));
    this.popularJobsCache = { at: now.getTime(), value };
    return value;
  }

  /**
   * Una ricerca per categoria (docs/CHANGELOG.md §281): contatore per giorno
   * e città, mai la singola ricerca né chi cerca. Una categoria sconosciuta
   * non conta. `empty`: nessun professionista entro il raggio (§370).
   */
  async recordSearch(categorySlug: string, city?: string, empty = false): Promise<void> {
    const category = await this.prisma.category.findUnique({ where: { slug: categorySlug }, select: { id: true } });
    if (!category) return;
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const normalizedCity = normalizeCity(city);
    const emptyCount = empty ? 1 : 0;
    await this.prisma.categorySearchDay.upsert({
      where: { categoryId_city_day: { categoryId: category.id, city: normalizedCity, day } },
      create: { categoryId: category.id, city: normalizedCity, day, count: 1, emptyCount },
      update: { count: { increment: 1 }, emptyCount: { increment: emptyCount } },
    });
  }

  /**
   * Una ricerca senza lavoro scelto (§370): solo città, o con una parola
   * scritta. Si conta solo che c'era una parola, mai la parola.
   */
  async recordFreeSearch(city: string | undefined, withText: boolean, empty: boolean): Promise<void> {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const normalizedCity = normalizeCity(city);
    const emptyCount = empty ? 1 : 0;
    await this.prisma.freeSearchDay.upsert({
      where: { city_withText_day: { city: normalizedCity, withText, day } },
      create: { city: normalizedCity, withText, day, count: 1, emptyCount },
      update: { count: { increment: 1 }, emptyCount: { increment: emptyCount } },
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

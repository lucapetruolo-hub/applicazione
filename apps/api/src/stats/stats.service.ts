import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class StatsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Numeri reali della piattaforma (richiesta esplicita dell'utente, "social
   * proof" in homepage) — mai un numero finto, stesso principio già seguito
   * per il conteggio "N professionisti" nelle categorie e per la soglia di
   * ProfessionalsShowcase (CLAUDE.md §10). Account eliminati (soft-delete,
   * `deletedAt`) esclusi da entrambi i conteggi: non sono più utenti attivi
   * della piattaforma. Professionisti demo (`isDemo`, dati di seed) esclusi
   * dal conteggio professionisti per lo stesso motivo per cui sono già
   * esclusi dalla vetrina "Sulla piattaforma" e dal conteggio categorie.
   */
  async getPlatformStats(): Promise<{
    totalUsers: number;
    totalProfessionals: number;
    reviewCount: number;
    averageRating: number | null;
  }> {
    const [totalUsers, totalProfessionals, reviews] = await Promise.all([
      this.prisma.user.count({ where: { role: "CLIENT", deletedAt: null } }),
      this.prisma.professionalProfile.count({ where: { isDemo: false, deletedAt: null, suspendedAt: null } }),
      // Media di tutte le recensioni pubbliche, anche quelle da 1 e 2 stelle
      // che la home non mostra (docs/CHANGELOG.md §229): il numero deve
      // essere quello vero, non la media delle sole recensioni scelte.
      this.prisma.review.aggregate({
        where: {
          hiddenAt: null,
          booking: { professionalProfile: { isDemo: false, deletedAt: null, suspendedAt: null } },
        },
        _count: { _all: true },
        _avg: { rating: true },
      }),
    ]);
    return {
      totalUsers,
      totalProfessionals,
      reviewCount: reviews._count._all,
      averageRating: reviews._avg.rating,
    };
  }
}

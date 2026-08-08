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
  async getPlatformStats(): Promise<{ totalUsers: number; totalProfessionals: number }> {
    const [totalUsers, totalProfessionals] = await Promise.all([
      this.prisma.user.count({ where: { role: "CLIENT", deletedAt: null } }),
      this.prisma.professionalProfile.count({ where: { isDemo: false, deletedAt: null } }),
    ]);
    return { totalUsers, totalProfessionals };
  }
}

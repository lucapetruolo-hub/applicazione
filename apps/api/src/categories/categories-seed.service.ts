import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Popola la tabella `categories` all'avvio (upsert, idempotente) invece di
 * richiedere un comando `prisma db seed` manuale separato — lo start script
 * di produzione esegue solo `prisma db push` (sincronizza lo schema, non i
 * dati), quindi senza questo le categorie restano assenti sul DB di
 * produzione e ogni registrazione profilo professionista fallisce con
 * "Categoria non valida" (`ProfessionalsService.upsertMyProfile`).
 */
@Injectable()
export class CategoriesSeedService implements OnModuleInit {
  private readonly logger = new Logger(CategoriesSeedService.name);

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    for (const category of PROFESSIONAL_CATEGORIES) {
      await this.prisma.category.upsert({
        where: { slug: category.slug },
        update: { label: category.label, subTags: [...category.subTags] },
        create: { slug: category.slug, label: category.label, subTags: [...category.subTags] },
      });
    }
    this.logger.log(`Categorie sincronizzate nel database (${PROFESSIONAL_CATEGORIES.length}).`);

    // Categorie tolte dal sito (es. OSS e Badanti, docs/CHANGELOG.md §214):
    // si cancellano solo se nessun profilo, richiesta o regola commissioni le
    // usa ancora, altrimenti restano e lo si segnala nei log.
    const obsolete = await this.prisma.category.findMany({
      where: { slug: { notIn: PROFESSIONAL_CATEGORIES.map((category) => category.slug) } },
      select: { id: true, slug: true, _count: { select: { professionalProfiles: true, guidedRequests: true, feeRules: true } } },
    });
    for (const category of obsolete) {
      const { professionalProfiles, guidedRequests, feeRules } = category._count;
      if (professionalProfiles + guidedRequests + feeRules === 0) {
        await this.prisma.category.delete({ where: { id: category.id } });
        this.logger.log(`Categoria tolta dal sito e cancellata: ${category.slug}.`);
      } else {
        this.logger.warn(
          `Categoria tolta dal sito ma ancora in uso (${professionalProfiles} profili, ${guidedRequests} richieste, ${feeRules} regole): ${category.slug}.`,
        );
      }
    }
  }
}

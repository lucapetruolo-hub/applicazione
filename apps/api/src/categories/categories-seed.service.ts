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
  }
}

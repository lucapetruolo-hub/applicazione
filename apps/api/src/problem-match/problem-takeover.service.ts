import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { OUT_OF_SERVICE_LABELS, type ProblemTakeoverInput } from "@professionisti/shared";
import { opsAlert } from "../common/ops-alert";
import { PRISMA } from "../prisma/prisma.module";

/**
 * "Ce ne occupiamo noi" (docs/CHANGELOG.md §387, decisione di Luca): il
 * cliente chiede alla piattaforma di trovare chi fa un lavoro che nessun
 * professionista del sito dichiara. Nessuna scadenza: compare in admin
 * "Richieste da seguire" finché non è segnata come fatta.
 */
@Injectable()
export class ProblemTakeoverService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(userId: string, input: ProblemTakeoverInput) {
    // La stessa richiesta mandata due volte (doppio clic, pagina ricaricata) resta una.
    const existing = await this.prisma.problemTakeover.findFirst({
      where: { userId, description: input.description, status: "OPEN" },
      select: { id: true },
    });
    if (existing) return { id: existing.id };
    const outOfService = input.outOfService && input.outOfService in OUT_OF_SERVICE_LABELS ? input.outOfService : null;
    const saved = await this.prisma.problemTakeover.create({
      data: { userId, description: input.description, city: input.city || null, outOfService },
    });
    opsAlert(`problem-takeover-${saved.id}`, "Nuova richiesta da seguire in admin (Ce ne occupiamo noi).");
    return { id: saved.id };
  }
}

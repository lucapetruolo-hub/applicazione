import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { CreateContentReportInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

/**
 * Segnalazione contenuti (richiesta esplicita dell'utente, "Verbale di
 * Conformità" — notice-and-action, Reg. (UE) 2022/2065 art. 16). Punto unico
 * di scrittura, richiamato dal controller — nessuna verifica di titolarità
 * sul target: chiunque sia autenticato può segnalare qualunque profilo o
 * recensione (a differenza di altre azioni del prodotto, qui non ha senso
 * restringere a "solo i propri", il punto è proprio segnalare i contenuti
 * altrui).
 */
@Injectable()
export class ContentReportsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async create(reporterId: string, input: CreateContentReportInput) {
    return this.prisma.contentReport.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details?.trim() || null,
      },
    });
  }
}

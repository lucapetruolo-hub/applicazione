import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { contactFaqOrDefault, type ContactFaqPicks, type FaqAudience } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { countingFrom, daySinceLaunch } from "./counted";

const DAY_MS = 24 * 60 * 60_000;
/** Giorni di "Ti è stata utile?" guardati per scegliere le domande. */
export const CONTACT_FAQ_VOTE_DAYS = 90;

/**
 * Le tre domande frequenti sotto "Chi sei?" in Contatti
 * (docs/changelog/2026-11-16-domande-frequenti.md). Le legge la pagina
 * Contatti; si cambiano solo approvando una proposta in Admin.
 */
@Injectable()
export class ContactFaqService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async picks(): Promise<ContactFaqPicks> {
    const rows = await this.prisma.contactFaqPick.findMany();
    const saved = new Map(rows.map((row) => [row.audience, row.faqIds]));
    return {
      cliente: contactFaqOrDefault("cliente", saved.get("cliente")),
      professionista: contactFaqOrDefault("professionista", saved.get("professionista")),
    };
  }

  async save(audience: FaqAudience, faqIds: string[], updatedById: string): Promise<void> {
    await this.prisma.contactFaqPick.upsert({
      where: { audience },
      create: { audience, faqIds, updatedById },
      update: { faqIds, updatedById },
    });
  }

  /** Sì e No per domanda negli ultimi CONTACT_FAQ_VOTE_DAYS giorni, dal lancio. */
  async votes(now: Date = new Date()): Promise<{ faqId: string; yes: number; no: number }[]> {
    const start = new Date(now.getTime() - CONTACT_FAQ_VOTE_DAYS * DAY_MS);
    const day = daySinceLaunch(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())), countingFrom(now));
    const rows = await this.prisma.faqFeedbackDay.groupBy({ by: ["faqId"], where: { day: { gte: day } }, _sum: { yes: true, no: true } });
    return rows.map((row) => ({ faqId: row.faqId, yes: row._sum.yes ?? 0, no: row._sum.no ?? 0 }));
  }
}

import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class NotificationsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Punto unico di creazione di una notifica in-app (badge nell'header,
   * CLAUDE.md §13) — usato sia dal fan-out lead (NEW_LEAD) sia dagli eventi
   * del ciclo di vita del preventivo (NEW_QUOTE, QUOTE_DATE_PROPOSED,
   * QUOTE_DATE_CONFIRMED, QUOTE_DATE_REJECTED). Canale sempre PUSH: nessun
   * invio reale (Expo Push/Resend/Twilio sono ancora rimandati, CLAUDE.md
   * §9), solo la riga in tabella che alimenta il conteggio non letti.
   */
  async notify(userId: string, type: string, payload: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.notification.create({ data: { userId, channel: "PUSH", type, payload } });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }
}

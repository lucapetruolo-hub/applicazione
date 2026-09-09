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

  /**
   * Notifiche non lette più recenti, con tipo/payload — a differenza di
   * `unreadCount` (solo il numero per il badge), serve al popup "toast"
   * lato client (richiesta esplicita dell'utente: "Fantastico, hai
   * ricevuto un nuovo preventivo") per sapere COSA è successo, non solo
   * quante cose. Limitate a 20: qui non serve uno storico completo, solo
   * abbastanza per rilevare gli eventi arrivati dall'ultimo controllo.
   */
  async listUnread(userId: string): Promise<{ id: string; type: string; payload: Prisma.JsonValue; createdAt: string }[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return notifications.map((n) => ({ id: n.id, type: n.type, payload: n.payload, createdAt: n.createdAt.toISOString() }));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /**
   * Cronologia completa (lette + non lette), per il pulsante a campanella
   * nell'header — a differenza di `listUnread` (solo non lette, per il
   * popup "toast") qui serve vedere anche gli eventi già letti, come
   * cronologia navigabile. Limitata a 30: stessa scala di lancio già
   * seguita ovunque nel progetto (CLAUDE.md §7), nessuna paginazione.
   */
  async history(userId: string): Promise<{ id: string; type: string; payload: Prisma.JsonValue; createdAt: string; readAt: string | null }[]> {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return notifications.map((n) => ({
      id: n.id,
      type: n.type,
      payload: n.payload,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt ? n.readAt.toISOString() : null,
    }));
  }
}

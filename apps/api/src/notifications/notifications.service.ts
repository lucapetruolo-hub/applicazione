import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { RealtimeService } from "../realtime/realtime.service";
import { EmailService } from "../email/email.service";

function payloadGuidedRequestId(payload: Prisma.InputJsonValue): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).guidedRequestId;
    if (typeof value === "string") return value;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type NewLeadEmailPayload = { category: string; city: string | null; isUrgent: boolean };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly realtimeService: RealtimeService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Punto unico di creazione di una notifica in-app (badge nell'header,
   * CLAUDE.md §13) — usato sia dal fan-out lead (NEW_LEAD) sia dagli eventi
   * del ciclo di vita del preventivo (NEW_QUOTE, QUOTE_DATE_PROPOSED,
   * QUOTE_DATE_CONFIRMED, QUOTE_DATE_REJECTED). Canale sempre PUSH: la riga
   * in tabella alimenta il conteggio non letti; solo NEW_LEAD parte anche
   * via email (emailNewLead). Expo Push/Twilio restano rimandati.
   *
   * Pubblica anche un push SSE (CTO — real-time): la riga DB resta l'unica
   * fonte di verità (il push è un acceleratore, mai l'unico modo di sapere
   * di una notifica — un client senza connessione SSE aperta la trova
   * comunque al prossimo poll, invariato) ma dimezza la latenza percepita
   * di badge/toast rispetto al solo poll da 15-45s già esistente.
   */
  async notify(userId: string, type: string, payload: Prisma.InputJsonValue): Promise<void> {
    // Richiesta silenziata dall'utente (menu hamburger della scheda,
    // docs/CHANGELOG.md §130): la notifica resta nella cronologia della
    // campanella ma nasce già letta, niente badge/toast/push SSE. Mai per
    // un promemoria, che l'utente stesso ha chiesto.
    const guidedRequestId = type !== "REQUEST_REMINDER" ? payloadGuidedRequestId(payload) : null;
    const muted = guidedRequestId
      ? await this.prisma.guidedRequestUserState.findFirst({ where: { userId, guidedRequestId, mutedAt: { not: null } }, select: { id: true } })
      : null;
    if (muted) {
      await this.prisma.notification.create({ data: { userId, channel: "PUSH", type, payload, readAt: new Date() } });
      return;
    }

    const created = await this.prisma.notification.create({ data: { userId, channel: "PUSH", type, payload } });
    this.realtimeService.publish(userId, {
      kind: "notification",
      notification: { id: created.id, type: created.type, payload: created.payload, createdAt: created.createdAt.toISOString() },
    });
    if (type === "NEW_LEAD") {
      const { category, city, isUrgent } = payload as Record<string, unknown>;
      this.emailNewLead([userId], {
        category: typeof category === "string" ? category : "Richiesta",
        city: typeof city === "string" ? city : null,
        isUrgent: isUrgent === true,
      });
    }
  }

  /**
   * Email al professionista per ogni nuovo lead (CEO, tattico — lacuna
   * competitiva n.1 rispetto a ProntoPro/Cronoshare): la campanella e il
   * push SSE arrivano solo a chi ha il sito aperto, ma in un mercato locale
   * vince chi risponde per primo (CLAUDE.md §8). Non attesa dal chiamante:
   * l'invio a più professionisti non deve rallentare la risposta al
   * cliente, ed `EmailService.send` non lancia mai (senza RESEND_API_KEY
   * logga e basta).
   */
  emailNewLead(userIds: string[], lead: NewLeadEmailPayload): void {
    void this.sendNewLeadEmails(userIds, lead).catch((err: unknown) => {
      this.logger.error(`Email nuovo lead non inviate: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async sendNewLeadEmails(userIds: string[], lead: NewLeadEmailPayload): Promise<void> {
    if (userIds.length === 0) return;
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { email: true, name: true } });
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    const where = lead.city ? ` a ${lead.city}` : "";
    const subject = `${lead.isUrgent ? "URGENTE — " : ""}Nuova richiesta: ${lead.category}${where}`;
    const intro = lead.isUrgent
      ? "<p><strong>È una richiesta urgente</strong>: il cliente cerca qualcuno disponibile subito.</p>"
      : "";
    const html =
      `<p>Hai ricevuto una nuova richiesta di preventivo per <strong>${escapeHtml(lead.category)}</strong>${escapeHtml(where)}.</p>` +
      intro +
      `<p>Chi risponde per primo ha più probabilità di aggiudicarsi il lavoro: <a href="${frontendUrl}/dashboard">apri la richiesta e invia il tuo preventivo</a>.</p>`;
    await Promise.all(
      users.flatMap((user) => (user.email ? [this.emailService.send({ to: user.email, subject, html })] : [])),
    );
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

  /**
   * Elimina una singola notifica dalla cronologia (richiesta esplicita
   * dell'utente: "dai la possibilità di eliminare quelle notifiche...
   * sia tramite slide sulla notifica che con un piccolo pulsante") — solo
   * la propria, mai quella di un altro utente. Nessuna doppia conferma:
   * a differenza delle azioni distruttive su dati di business (richieste,
   * preventivi), qui si tratta di un record di stato di lettura effimero,
   * non di un dato che documenta un lavoro reale.
   */
  async delete(userId: string, notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException("Notifica non trovata.");
    if (notification.userId !== userId) throw new ForbiddenException("Questa notifica non è tua.");
    await this.prisma.notification.delete({ where: { id: notificationId } });
  }

  /** Elimina tutte le notifiche dell'utente in un colpo (richiesta esplicita dell'utente). */
  async deleteAll(userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId } });
  }
}

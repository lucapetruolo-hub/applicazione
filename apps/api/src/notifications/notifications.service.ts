import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { RealtimeService } from "../realtime/realtime.service";
import { EmailService } from "../email/email.service";
import {
  CONTENT_REPORT_TARGET_LABEL,
  notificationChannelEnabled,
  resolveNotificationPreferences,
  type ContentReportTargetType,
  type NotificationPreferences,
} from "@professionisti/shared";
import { renderEmail } from "../email/email-layout";
import { BOOKING_CALENDAR_INCLUDE, bookingCalendar, withCalendar, type BookingCalendar } from "../email/booking-calendar";
import { adminNewReportEmail, contactReportReceivedEmail, requestSentEmail } from "../email/templates/job-emails";
import { frontendUrl } from "../email/email-brand";
import {
  EMPTY_EMAIL_CONTEXT,
  NOTIFICATION_EMAIL_TYPES,
  chatMessageEmail,
  notificationEmail,
  type NotificationEmailContext,
} from "../email/templates/notification-emails";

function isChatMessageType(type: string): type is "TIMELINE_MESSAGE_FROM_CLIENT" | "TIMELINE_MESSAGE_FROM_PROFESSIONAL" {
  return type === "TIMELINE_MESSAGE_FROM_CLIENT" || type === "TIMELINE_MESSAGE_FROM_PROFESSIONAL";
}

function payloadThread(payload: Prisma.InputJsonValue): { guidedRequestId: string; professionalProfileId: string } | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const { guidedRequestId, professionalProfileId } = payload as Record<string, unknown>;
  return typeof guidedRequestId === "string" && typeof professionalProfileId === "string" ? { guidedRequestId, professionalProfileId } : null;
}

function payloadGuidedRequestId(payload: Prisma.InputJsonValue): string | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const value = (payload as Record<string, unknown>).guidedRequestId;
    if (typeof value === "string") return value;
  }
  return null;
}

/** Notifiche che aggiungono o tolgono l'appuntamento dal calendario (docs/CHANGELOG.md §235). */
const CALENDAR_NOTIFICATION_TYPES: Record<string, "add" | "cancel"> = {
  QUOTE_ACCEPTED: "add",
  BOOKING_REOPENED_BY_CLIENT: "add",
  BOOKING_REOPENED_BY_PROFESSIONAL: "add",
  BOOKING_CANCELED_BY_PROFESSIONAL: "cancel",
  BOOKING_CANCELED_BY_CLIENT: "cancel",
};

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
   * in tabella alimenta il conteggio non letti; i tipi elencati in
   * `email/templates/notification-emails.ts` partono anche via email
   * (docs/CHANGELOG.md §185). Expo Push/Twilio restano rimandati.
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
    // Argomento spento sul canale "sito" nelle preferenze (docs/CHANGELOG.md
    // §152): stesso trattamento di una richiesta silenziata, la notifica
    // resta nella cronologia ma nasce letta.
    const prefs = await this.preferencesOf(userId);
    // Email (docs/CHANGELOG.md §185): parte se il tipo ne ha una e il canale
    // email dell'argomento è acceso, anche con il sito spento. Mai per una
    // richiesta silenziata.
    if (!muted && NOTIFICATION_EMAIL_TYPES.has(type) && notificationChannelEnabled(prefs, type, "email")) {
      this.emailNotification(userId, type, payload);
    }
    if (muted || !notificationChannelEnabled(prefs, type, "inApp")) {
      await this.prisma.notification.create({ data: { userId, channel: "PUSH", type, payload, readAt: new Date() } });
      // Messaggio in chat con il sito spento ma l'email accesa: non c'è
      // nulla da "non leggere" per l'email ritardata (§331), parte subito.
      if (!muted && isChatMessageType(type) && notificationChannelEnabled(prefs, type, "email")) {
        const thread = payloadThread(payload);
        if (thread) {
          void this.emailChatMessages(userId, { type, ...thread, count: 1 }).catch((err: unknown) => {
            this.logger.error(`Email del messaggio in chat non inviata: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      }
      return;
    }

    const created = await this.prisma.notification.create({ data: { userId, channel: "PUSH", type, payload } });
    this.realtimeService.publish(userId, {
      kind: "notification",
      notification: { id: created.id, type: created.type, payload: created.payload, createdAt: created.createdAt.toISOString() },
    });
  }

  /** Preferenze di notifica dell'utente, con i valori predefiniti per ciò che non ha scelto (docs/CHANGELOG.md §152). */
  async preferencesOf(userId: string): Promise<NotificationPreferences> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    return resolveNotificationPreferences(user?.notificationPrefs ?? null);
  }

  async updatePreferences(userId: string, prefs: NotificationPreferences): Promise<NotificationPreferences> {
    const resolved = resolveNotificationPreferences(prefs);
    await this.prisma.user.update({ where: { id: userId }, data: { notificationPrefs: resolved } });
    return resolved;
  }

  /**
   * Email che accompagna una notifica (docs/CHANGELOG.md §185): testi in
   * `email/templates/notification-emails.ts`, dati del lavoro caricati qui.
   * Non attesa dal chiamante (un fan-out a più professionisti non deve
   * rallentare la risposta) e mai bloccante: `EmailService.send` non lancia,
   * e senza RESEND_API_KEY logga e basta.
   */
  private emailNotification(userId: string, type: string, payload: Prisma.InputJsonValue): void {
    void (async () => {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, deletedAt: true } });
      if (!user?.email || user.deletedAt) return;
      const data = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
      const context = { ...(await this.emailContext(data)), name: user.name };
      const content = notificationEmail(type, data, context);
      if (!content) return;
      const calendar = await this.bookingCalendarFor(userId, type, data);
      await this.emailService.send({
        to: user.email,
        ...renderEmail(calendar ? withCalendar(content, calendar) : content),
        ...(calendar ? { attachments: [calendar.attachment] } : {}),
      });
    })().catch((err: unknown) => {
      this.logger.error(`Email della notifica ${type} non inviata: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Calendario nelle email di un appuntamento (docs/CHANGELOG.md §235):
   * aggiunge l'evento quando nasce o torna valido, lo toglie quando viene
   * annullato. Solo per chi è davvero cliente o professionista della prenotazione.
   */
  private async bookingCalendarFor(userId: string, type: string, payload: Record<string, unknown>): Promise<BookingCalendar | null> {
    const action = CALENDAR_NOTIFICATION_TYPES[type];
    const bookingId = typeof payload.bookingId === "string" ? payload.bookingId : null;
    if (!action || !bookingId) return null;
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_CALENDAR_INCLUDE });
    if (!booking) return null;
    const role = booking.clientId === userId ? "client" : booking.professionalProfile.userId === userId ? "professional" : null;
    if (!role) return null;
    if (action === "add" && booking.status !== "CONFIRMED" && booking.status !== "PENDING") return null;
    return bookingCalendar(booking, role, { canceled: action === "cancel" });
  }

  /** Categoria, città, attività e data del lavoro a cui si riferisce il payload. */
  private async emailContext(payload: Record<string, unknown>): Promise<NotificationEmailContext> {
    const id = (key: string) => (typeof payload[key] === "string" ? (payload[key] as string) : null);
    const bookingId = id("bookingId");
    const quoteId = id("quoteId");
    const guidedRequestId = id("guidedRequestId");
    const request = { select: { city: true, description: true, category: { select: { label: true } } } } as const;
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { scheduledAt: true, professionalProfile: { select: { businessName: true } }, quote: { select: { guidedRequest: request } } },
      });
      if (booking) {
        return {
          ...EMPTY_EMAIL_CONTEXT,
          category: booking.quote?.guidedRequest.category.label ?? null,
          city: booking.quote?.guidedRequest.city ?? null,
          businessName: booking.professionalProfile.businessName,
          description: booking.quote?.guidedRequest.description ?? null,
          when: booking.scheduledAt,
        };
      }
    }
    if (quoteId) {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        select: { estimatedStartDate: true, clientProposedDate: true, professionalProfile: { select: { businessName: true } }, guidedRequest: request },
      });
      if (quote) {
        return {
          ...EMPTY_EMAIL_CONTEXT,
          category: quote.guidedRequest.category.label,
          city: quote.guidedRequest.city,
          businessName: quote.professionalProfile.businessName,
          description: quote.guidedRequest.description,
          when: quote.estimatedStartDate,
          proposedWhen: quote.clientProposedDate,
        };
      }
    }
    if (guidedRequestId) {
      const guidedRequest = await this.prisma.guidedRequest.findUnique({ where: { id: guidedRequestId }, ...request });
      const professionalProfileId = id("professionalProfileId");
      const professional = professionalProfileId
        ? await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { businessName: true } })
        : null;
      if (guidedRequest) {
        return {
          ...EMPTY_EMAIL_CONTEXT,
          category: guidedRequest.category.label,
          city: guidedRequest.city,
          description: guidedRequest.description,
          businessName: professional?.businessName ?? null,
        };
      }
    }
    return EMPTY_EMAIL_CONTEXT;
  }

  /**
   * Email dei messaggi in chat non letti (docs/CHANGELOG.md §331), una per
   * conversazione: la manda `ChatMessageEmailsService`, che ha già
   * controllato preferenze e notifiche lette. Il link apre la chat giusta.
   */
  async emailChatMessages(
    userId: string,
    input: { type: "TIMELINE_MESSAGE_FROM_CLIENT" | "TIMELINE_MESSAGE_FROM_PROFESSIONAL"; guidedRequestId: string; professionalProfileId: string; count: number },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, deletedAt: true } });
    if (!user?.email || user.deletedAt) return;
    const context = { ...(await this.emailContext({ guidedRequestId: input.guidedRequestId, professionalProfileId: input.professionalProfileId })), name: user.name };
    const query = `open=${input.guidedRequestId}&chat=${input.professionalProfileId}`;
    const url =
      input.type === "TIMELINE_MESSAGE_FROM_CLIENT"
        ? `${frontendUrl()}/dashboard/richieste?${query}`
        : `${frontendUrl()}/le-mie-richieste?tab=richieste&${query}`;
    await this.emailService.send({ to: user.email, ...renderEmail(chatMessageEmail(input.type, input.count, context, url)) });
  }

  /**
   * Conferma al cliente che la richiesta è partita (docs/CHANGELOG.md §185),
   * nell'argomento "Le tue richieste" delle preferenze.
   */
  emailRequestSent(clientId: string, input: { category: string; requestsCount?: number; city: string | null; isUrgent: boolean; sentTo: number; direct: boolean; description?: string | null }): void {
    void (async () => {
      const user = await this.prisma.user.findUnique({ where: { id: clientId }, select: { email: true, name: true, deletedAt: true } });
      if (!user?.email || user.deletedAt) return;
      if (!notificationChannelEnabled(await this.preferencesOf(clientId), "REQUEST_SENT", "email")) return;
      await this.emailService.send({ to: user.email, ...requestSentEmail({ name: user.name, ...input }) });
    })().catch((err: unknown) => {
      this.logger.error(`Email richiesta inviata non spedita: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Avviso agli admin che moderano (SUPER e MODERATOR) per ogni nuova
   * segnalazione (docs/CHANGELOG.md §145): per un caso grave (minacce,
   * sicurezza) aspettare che qualcuno apra /admin è troppo.
   */
  emailAdminsNewReport(report: { targetType: ContentReportTargetType | "CONTACT_FORM"; reason: string }): void {
    void (async () => {
      const admins = await this.prisma.user.findMany({
        where: { role: "ADMIN", suspendedAt: null, OR: [{ adminRoles: { isEmpty: true } }, { adminRoles: { hasSome: ["SUPER", "MODERATOR"] } }] },
        select: { email: true },
      });
      const fromContactForm = report.targetType === "CONTACT_FORM";
      const what = report.targetType === "CONTACT_FORM" ? "Contenuto illegale, dal modulo Contatti" : CONTENT_REPORT_TARGET_LABEL[report.targetType];
      const email = adminNewReportEmail({ what, reason: report.reason, fromContactForm });
      await Promise.all(admins.flatMap((admin) => (admin.email ? [this.emailService.send({ to: admin.email, ...email })] : [])));
    })().catch((err: unknown) => {
      this.logger.error(`Email admin nuova segnalazione non inviata: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /**
   * Segnalazione di contenuto illegale dal modulo Contatti, senza account
   * (DSA art. 16 c. 1 e 4, docs/CHANGELOG.md §319): presa in carico a chi
   * scrive e avviso agli admin che moderano.
   */
  emailContactReportReceived(senderEmail: string): void {
    void this.emailService.send({ to: senderEmail, ...contactReportReceivedEmail() }).catch((err: unknown) => {
      this.logger.error(`Email presa in carico segnalazione non inviata: ${err instanceof Error ? err.message : String(err)}`);
    });
    this.emailAdminsNewReport({ targetType: "CONTACT_FORM", reason: "Segnalazione di un contenuto illegale da chi non ha un account" });
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

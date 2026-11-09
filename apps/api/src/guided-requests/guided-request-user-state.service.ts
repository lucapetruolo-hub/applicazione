import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { rebookReminderDate, type GuidedRequestMyState, type GuidedRequestUserStateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";

// Un promemoria oltre questo orizzonte è più probabilmente un errore che
// un'intenzione reale ("ricordamelo domani", non "tra un anno").
const MAX_REMINDER_DAYS_AHEAD = 60;

type StateRow = { archivedAt: Date | null; mutedAt: Date | null; markedUnreadAt: Date | null; remindAt: Date | null; rebookRemindAt?: Date | null };

/** Forma pubblica dello stato personale (vedi `GuidedRequestMyState`), `null` ovunque se la riga non esiste ancora. */
export function toMyState(row: StateRow | undefined | null): GuidedRequestMyState {
  return {
    archivedAt: row?.archivedAt?.toISOString() ?? null,
    mutedAt: row?.mutedAt?.toISOString() ?? null,
    markedUnreadAt: row?.markedUnreadAt?.toISOString() ?? null,
    remindAt: row?.remindAt?.toISOString() ?? null,
    rebookRemindAt: row?.rebookRemindAt?.toISOString() ?? null,
  };
}

/**
 * Stato personale di una scheda richiesta — azioni del menu hamburger su
 * /le-mie-richieste e /dashboard/richieste (docs/CHANGELOG.md §130,
 * richiesta esplicita dell'utente): archivia, silenzia notifiche, segna
 * come letta/da leggere, promemoria. Vale per il cliente della richiesta e
 * per ogni professionista che ha un Lead su di essa, ognuno per sé: mai un
 * effetto visibile all'altra parte.
 */
@Injectable()
export class GuidedRequestUserStateService {
  private readonly logger = new Logger(GuidedRequestUserStateService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Cliente della richiesta o professionista che l'ha ricevuta — chiunque altro 403. */
  async requireParticipant(userId: string, guidedRequestId: string): Promise<{ audience: "CLIENT" | "PROFESSIONAL" }> {
    const request = await this.prisma.guidedRequest.findUnique({ where: { id: guidedRequestId }, select: { clientId: true } });
    if (!request) throw new NotFoundException("Richiesta non trovata.");
    if (request.clientId === userId) return { audience: "CLIENT" };
    const lead = await this.prisma.lead.findFirst({
      where: { guidedRequestId, professionalProfile: { userId } },
      select: { id: true },
    });
    if (!lead) throw new ForbiddenException("Questa richiesta non è tua.");
    return { audience: "PROFESSIONAL" };
  }

  async update(userId: string, guidedRequestId: string, input: GuidedRequestUserStateInput): Promise<GuidedRequestMyState> {
    const { audience } = await this.requireParticipant(userId, guidedRequestId);
    const now = new Date();

    // "Ricordamelo tra…" (docs/changelog/2026-11-08-promemoria-manutenzione.md):
    // solo il cliente, solo con un lavoro terminato su questa richiesta, con
    // un professionista ancora sul sito. La data la calcola il server.
    let rebookRemindAt: Date | null | undefined;
    if (input.rebookReminder !== undefined) {
      if (audience !== "CLIENT") throw new ForbiddenException("Questo promemoria è solo per il cliente.");
      if (input.rebookReminder === null) {
        rebookRemindAt = null;
      } else {
        const done = await this.prisma.booking.findFirst({
          where: { guidedRequestId, clientId: userId, status: "COMPLETED", professionalProfile: { user: { deletedAt: null } } },
          select: { id: true },
        });
        if (!done) throw new BadRequestException("Il promemoria si imposta a lavoro terminato.");
        rebookRemindAt = rebookReminderDate(input.rebookReminder, now);
      }
    }

    let remindAt: Date | null | undefined;
    if (input.remindAt !== undefined) {
      remindAt = input.remindAt === null ? null : new Date(input.remindAt);
      if (remindAt && remindAt.getTime() <= now.getTime()) {
        throw new BadRequestException("Il promemoria deve essere nel futuro.");
      }
      if (remindAt && remindAt.getTime() > now.getTime() + MAX_REMINDER_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
        throw new BadRequestException(`Il promemoria può essere al massimo tra ${MAX_REMINDER_DAYS_AHEAD} giorni.`);
      }
    }

    const data = {
      ...(input.archived !== undefined ? { archivedAt: input.archived ? now : null } : {}),
      ...(input.muted !== undefined ? { mutedAt: input.muted ? now : null } : {}),
      ...(input.markedUnread !== undefined ? { markedUnreadAt: input.markedUnread ? now : null } : {}),
      ...(remindAt !== undefined ? { remindAt } : {}),
      ...(rebookRemindAt !== undefined ? { rebookRemindAt } : {}),
    };
    const row = await this.prisma.guidedRequestUserState.upsert({
      where: { userId_guidedRequestId: { userId, guidedRequestId } },
      create: { userId, guidedRequestId, ...data },
      update: data,
    });

    // "Segna come letta": oltre al flag manuale azzera anche le notifiche
    // non lette di questa richiesta (badge "Nuovo", pallini, contatore
    // campanella) — altrimenti la scheda resterebbe "nuova" comunque.
    if (input.markedUnread === false) {
      await this.prisma.notification.updateMany({
        where: { userId, readAt: null, payload: { path: ["guidedRequestId"], equals: guidedRequestId } },
        data: { readAt: now },
      });
    }

    return toMyState(row);
  }

  /**
   * Promemoria scaduti → notifica REQUEST_REMINDER e campo azzerato. Ogni 5
   * minuti come `runExpiryCheck` (stesso limite noto del free tier Render:
   * mentre il servizio dorme non gira, il promemoria parte al risveglio).
   * Il campo è azzerato prima di notificare: mai due notifiche per lo
   * stesso promemoria anche se la notify fallisse.
   */
  @ScheduledJob(CronExpression.EVERY_5_MINUTES)
  async runDueReminders(): Promise<void> {
    const due = await this.prisma.guidedRequestUserState.findMany({
      where: { remindAt: { lte: new Date() } },
      include: { guidedRequest: { select: { clientId: true, category: { select: { label: true } } } } },
    });
    for (const state of due) {
      const cleared = await this.prisma.guidedRequestUserState.updateMany({
        where: { id: state.id, remindAt: state.remindAt },
        data: { remindAt: null },
      });
      if (cleared.count === 0) continue;
      await this.notificationsService.notify(state.userId, "REQUEST_REMINDER", {
        guidedRequestId: state.guidedRequestId,
        audience: state.guidedRequest.clientId === state.userId ? "CLIENT" : "PROFESSIONAL",
        categoryLabel: state.guidedRequest.category.label,
      });
    }
    if (due.length > 0) {
      this.logger.log(`Inviati ${due.length} promemoria su richieste.`);
    }
  }

  /**
   * "Ricordamelo tra…" arrivati alla data (docs/changelog/2026-11-08-promemoria-manutenzione.md):
   * notifica REBOOK_REMINDER, che parte anche via email con "Prenota di
   * nuovo" se il cliente non l'ha spenta. Il campo si azzera prima, come
   * sopra: mai due avvisi. Se nel frattempo il professionista ha chiuso
   * l'account o il cliente ha eliminato il suo, non parte nulla.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async runDueRebookReminders(): Promise<void> {
    const due = await this.prisma.guidedRequestUserState.findMany({
      where: { rebookRemindAt: { lte: new Date() } },
      select: { id: true, userId: true, guidedRequestId: true, rebookRemindAt: true, user: { select: { deletedAt: true } } },
    });
    let sent = 0;
    for (const state of due) {
      const cleared = await this.prisma.guidedRequestUserState.updateMany({
        where: { id: state.id, rebookRemindAt: state.rebookRemindAt },
        data: { rebookRemindAt: null },
      });
      if (cleared.count === 0 || state.user.deletedAt) continue;
      const booking = await this.prisma.booking.findFirst({
        where: { guidedRequestId: state.guidedRequestId, clientId: state.userId, status: "COMPLETED", professionalProfile: { user: { deletedAt: null } } },
        orderBy: { scheduledAt: "desc" },
        select: { id: true },
      });
      if (!booking) continue;
      await this.notificationsService.notify(state.userId, "REBOOK_REMINDER", { guidedRequestId: state.guidedRequestId, bookingId: booking.id });
      sent++;
    }
    if (sent > 0) this.logger.log(`Inviati ${sent} promemoria per rifare un lavoro.`);
  }
}

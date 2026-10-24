import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { contentReportReason, type CreateContentReportInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

const DUPLICATE_REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Segnalazione contenuti (richiesta esplicita dell'utente, "Verbale di
 * Conformità" — notice-and-action, Reg. (UE) 2022/2065 art. 16). Punto unico
 * di scrittura, richiamato dal controller — nessuna verifica di titolarità
 * sul target: chiunque sia autenticato può segnalare qualunque profilo o
 * recensione (a differenza di altre azioni del prodotto, qui non ha senso
 * restringere a "solo i propri", il punto è proprio segnalare i contenuti
 * altrui).
 *
 * Anti-abuso (richiesta esplicita dell'utente): lo stesso account non può
 * segnalare lo stesso contenuto una seconda volta prima che siano passate
 * 24 ore dalla segnalazione precedente — a prescindere dal suo stato
 * (`OPEN`/`RESOLVED`/`DISMISSED`, mai filtrato per stato qui: anche una
 * segnalazione già archiviata conta ai fini della finestra anti-spam,
 * altrimenti risolverla in fretta lato admin riaprirebbe subito la
 * possibilità di ri-segnalare). Verifica lato server, mai solo lato
 * client: stesso principio già seguito per "una recensione per
 * prenotazione" in `ReviewsService.create` (`ConflictException`, stesso
 * codice HTTP 409 qui per coerenza).
 */
@Injectable()
export class ContentReportsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(reporterId: string, input: CreateContentReportInput) {
    // Una richiesta non è un contenuto pubblico: può segnalarla solo il
    // professionista che l'ha ricevuta (docs/CHANGELOG.md §130).
    if (input.targetType === "GUIDED_REQUEST") {
      const lead = await this.prisma.lead.findFirst({
        where: { guidedRequestId: input.targetId, professionalProfile: { userId: reporterId } },
        select: { id: true },
      });
      if (!lead) {
        throw new ForbiddenException("Puoi segnalare solo una richiesta che hai ricevuto.");
      }
    }

    const recentDuplicate = await this.prisma.contentReport.findFirst({
      where: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        createdAt: { gte: new Date(Date.now() - DUPLICATE_REPORT_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (recentDuplicate) {
      throw new ConflictException("Hai già segnalato questo contenuto nelle ultime 24 ore.");
    }

    const reason = contentReportReason(input.reason);
    const claimsIllegal = reason?.illegal ?? false;
    const created = await this.prisma.contentReport.create({
      data: {
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: reason?.label ?? input.reason,
        details: input.details?.trim() || null,
        claimsIllegal,
        goodFaithAt: claimsIllegal && input.goodFaith ? new Date() : null,
      },
      select: { id: true },
    });
    // Conferma di presa in carico a chi segnala (DSA art. 16 c. 4, docs/CHANGELOG.md §312).
    await this.notificationsService.notify(reporterId, "CONTENT_REPORT_RECEIVED", { contentReportId: created.id, targetType: input.targetType });
    this.notificationsService.emailAdminsNewReport({ targetType: input.targetType, reason: claimsIllegal ? `${reason?.label} (contenuto illegale)` : (reason?.label ?? input.reason) });
    return created;
  }

  /**
   * Pagina /segnalazioni, aperta dall'email della decisione (docs/CHANGELOG.md
   * §144, §312): solo le decisioni sui contenuti dell'utente, con misura,
   * regola violata, motivazione e stato della contestazione (DSA art. 17).
   * Chi segnala non vede più l'esito qui: riceve la presa in carico e, solo
   * per un contenuto illegale, una riga di esito per email (art. 16 c. 4-5).
   * Mai il nome di chi ha segnalato.
   */
  async listMine(userId: string) {
    const received = await this.prisma.contentReport.findMany({ where: { contentOwnerId: userId, status: "RESOLVED" }, orderBy: { resolvedAt: "desc" } });
    return {
      received: received.map((r) => ({
        id: r.id,
        targetType: r.targetType,
        action: r.action,
        ground: r.ground,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolutionNote: r.resolutionNote,
        revertedAt: r.revertedAt?.toISOString() ?? null,
        revertNote: r.revertNote,
        appealText: r.appealText,
        appealedAt: r.appealedAt?.toISOString() ?? null,
        appealRejectedAt: r.appealRejectedAt?.toISOString() ?? null,
        appealRejectNote: r.appealRejectNote,
      })),
    };
  }

  /** Contestazione della decisione da parte dell'autore del contenuto (reclamo interno, DSA art. 20). */
  async appeal(userId: string, reportId: string, text: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report || report.contentOwnerId !== userId || report.status !== "RESOLVED") {
      throw new NotFoundException("Decisione non trovata.");
    }
    if (report.revertedAt) {
      throw new BadRequestException("La misura è già stata annullata.");
    }
    if (report.appealedAt) {
      throw new BadRequestException("Hai già contestato questa decisione.");
    }
    const now = new Date();
    await this.prisma.contentReport.update({ where: { id: reportId }, data: { appealText: text.trim(), appealedAt: now } });
    return { id: reportId, appealedAt: now.toISOString() };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  JOB_ISSUE_AUTO_DECISION_NOTE,
  JOB_ISSUE_SANCTION_DAYS,
  JOB_ISSUE_SANCTION_WINDOW_DAYS,
  jobIssueAutoDecision,
  jobIssueAutoEscalation,
  jobIssueCanAppeal,
  jobIssueEvidenceDueAt,
  jobIssueOutcomeText,
  jobIssueSanctionFor,
  type JobIssueAutoDecision,
  type JobIssueSanction,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { TimelineService } from "../timeline/timeline.service";
import { GuidedRequestsService } from "../guided-requests/guided-requests.service";
import { OnlineMoneyService } from "../job-payments/online-money.service";

const DAY_MS = 24 * 60 * 60 * 1000;

const issueInclude = {
  booking: {
    select: {
      id: true,
      clientId: true,
      status: true,
      professionalProfileId: true,
      professionalProfile: { select: { userId: true, demotedUntil: true, requestsBlockedUntil: true } },
      quote: { select: { guidedRequestId: true } },
      jobPayment: { select: { id: true, paymentMethod: true, status: true, grossAmountEurCents: true } },
    },
  },
} as const;

/**
 * Controversie standard sul modello Amazon A-Z (docs/CHANGELOG.md §167):
 * esiti, misure progressive, rimborso per i lavori pagati sul sito,
 * scadenze automatiche, ricorso e rinvio della richiesta ad altri.
 * Regole pure in packages/shared/src/jobIssues.ts.
 */
@Injectable()
export class JobIssueOutcomeService {
  private readonly logger = new Logger(JobIssueOutcomeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly auditLogService: AuditLogService,
    private readonly timelineService: TimelineService,
    private readonly guidedRequestsService: GuidedRequestsService,
    private readonly onlineMoneyService: OnlineMoneyService,
  ) {}

  /** Primo messaggio del professionista in chat dopo la segnalazione, per ogni segnalazione indicata. */
  async proChatReplies(
    issues: { id: string; createdAt: Date; professionalRespondedAt: Date | null; guidedRequestId: string | null; professionalProfileId: string }[],
  ): Promise<Map<string, Date | null>> {
    const out = new Map<string, Date | null>();
    for (const issue of issues) {
      if (issue.professionalRespondedAt || !issue.guidedRequestId) {
        out.set(issue.id, issue.professionalRespondedAt);
        continue;
      }
      const first = await this.prisma.conversationEvent.findFirst({
        where: {
          guidedRequestId: issue.guidedRequestId,
          professionalProfileId: issue.professionalProfileId,
          actor: "PROFESSIONAL",
          createdAt: { gt: issue.createdAt },
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      });
      out.set(issue.id, first?.createdAt ?? null);
    }
    return out;
  }

  /**
   * Decisione su una segnalazione in esame, da un admin o automatica
   * (`byUserId` null) se il professionista non risponde in tempo.
   */
  async decide(
    issueId: string,
    input: { decision: "UPHELD" | "REJECTED"; note: string; byUserId: string | null; autoDecision?: JobIssueAutoDecision },
  ): Promise<{ id: string; status: string; sanction: JobIssueSanction | null }> {
    const issue = await this.prisma.jobIssue.findUnique({ where: { id: issueId }, include: issueInclude });
    if (!issue) throw new NotFoundException("Segnalazione non trovata.");
    // Update condizionato: una decisione automatica e una dell'admin nello
    // stesso istante non si sovrappongono.
    const claimed = await this.prisma.jobIssue.updateMany({
      where: { id: issueId, status: "OPEN" },
      data: {
        status: input.decision,
        resolutionNote: input.note,
        resolvedAt: new Date(),
        resolvedByUserId: input.byUserId,
        autoDecision: input.autoDecision ?? null,
      },
    });
    if (claimed.count === 0) throw new BadRequestException("La segnalazione è già stata decisa.");

    const booking = issue.booking;
    let sanction: JobIssueSanction | null = null;
    if (input.decision === "UPHELD") {
      // Mancata presentazione e lavoro fatto male abbassano entrambi
      // l'affidabilità nello smistamento (decisione dell'utente).
      await this.professionalMetricsService.recordNoShowConfirmed(booking.professionalProfileId, booking.status === "COMPLETED");
      sanction = await this.applySanction(issueId, booking.professionalProfileId, booking.professionalProfile.userId);
      await this.requestRefundIfPaidOnline(issueId, booking);
    }
    await this.auditLogService.record({
      entityType: "JobIssue",
      entityId: issueId,
      fieldName: "status",
      oldValue: "OPEN",
      newValue: { decision: input.decision, sanction, autoDecision: input.autoDecision ?? null },
      changedByUserId: input.byUserId,
      reason: input.note,
    });

    const online = booking.jobPayment?.paymentMethod === "MANOVIA";
    const payload = {
      bookingId: booking.id,
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      issueType: issue.type,
      decision: input.decision,
      note: input.note,
      paidOnline: online,
    };
    await this.notificationsService.notify(booking.clientId, "JOB_ISSUE_RESOLVED", {
      ...payload,
      audience: "CLIENT",
      text: jobIssueOutcomeText({ type: issue.type, decision: input.decision, note: input.note, audience: "client", paidOnline: online }),
    });
    await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_ISSUE_RESOLVED", {
      ...payload,
      audience: "PROFESSIONAL",
      sanction,
      text: jobIssueOutcomeText({ type: issue.type, decision: input.decision, note: input.note, audience: "professional", paidOnline: online }),
    });
    return { id: issueId, status: input.decision, sanction };
  }

  /**
   * Misure progressive (decisione dell'utente): conta le segnalazioni
   * accolte negli ultimi 30 giorni, questa inclusa. 1ª avvertimento, 2ª
   * profilo più in basso per 14 giorni, 3ª niente nuove richieste per 14
   * giorni.
   */
  private async applySanction(issueId: string, professionalProfileId: string, professionalUserId: string): Promise<JobIssueSanction> {
    const since = new Date(Date.now() - JOB_ISSUE_SANCTION_WINDOW_DAYS * DAY_MS);
    const count = await this.prisma.jobIssue.count({
      where: { status: "UPHELD", resolvedAt: { gte: since }, booking: { professionalProfileId } },
    });
    const sanction = jobIssueSanctionFor(count);
    const until = new Date(Date.now() + JOB_ISSUE_SANCTION_DAYS * DAY_MS);
    if (sanction === "DEMOTED") {
      await this.prisma.professionalProfile.update({ where: { id: professionalProfileId }, data: { demotedUntil: until } });
    } else if (sanction === "BLOCKED") {
      await this.prisma.professionalProfile.update({ where: { id: professionalProfileId }, data: { requestsBlockedUntil: until } });
    }
    await this.prisma.jobIssue.update({ where: { id: issueId }, data: { sanction } });
    await this.auditLogService.record({
      entityType: "ProfessionalProfile",
      entityId: professionalProfileId,
      fieldName: "jobIssueSanction",
      newValue: { sanction, upheldInLast30Days: count, until: sanction === "WARNING" ? null : until.toISOString() },
      reason: `Segnalazione accolta ${issueId}`,
    });
    await this.notificationsService.notify(professionalUserId, "JOB_ISSUE_SANCTION", {
      sanction,
      count,
      until: sanction === "WARNING" ? null : until.toISOString(),
    });
    return sanction;
  }

  /**
   * Garanzia del pagamento online (decisione dell'utente, §167-§168): se il
   * lavoro è pagato sul sito con Stripe e la segnalazione è accolta, il
   * cliente riceve subito il rimborso di quanto pagato (se i soldi erano già
   * passati al professionista, la sua quota viene ripresa dal suo conto
   * Stripe). Se Stripe non risponde, la richiesta resta alla Finanza in
   * "Rimborsi e contestazioni". Con il pagamento diretto nessun rimborso.
   */
  private async requestRefundIfPaidOnline(
    issueId: string,
    booking: { clientId: string; jobPayment: { id: string; paymentMethod: string; status: string; grossAmountEurCents: number } | null },
  ): Promise<void> {
    const payment = booking.jobPayment;
    if (!payment || payment.paymentMethod !== "MANOVIA") return;
    try {
      await this.onlineMoneyService.refundOnline(payment.id, "ALL", `Segnalazione accolta (${issueId}): rimborso garantito del pagamento online.`, null);
      return;
    } catch (err) {
      this.logger.warn(`Rimborso automatico non riuscito per ${issueId}: ${(err as Error).message}`);
    }
    const existing = await this.prisma.refund.findFirst({ where: { jobPaymentId: payment.id, status: { in: ["REQUESTED", "APPROVED"] } } });
    if (existing) return;
    const jp = await this.prisma.jobPayment.findUniqueOrThrow({ where: { id: payment.id } });
    const amount = jp.paidEurCents - jp.refundedEurCents;
    if (amount <= 0) return;
    const refund = await this.prisma.refund.create({
      data: {
        jobPaymentId: payment.id,
        amountEurCents: amount,
        reason: `Segnalazione accolta (${issueId}): rimborso garantito del pagamento online.`,
        requestedById: booking.clientId,
      },
    });
    await this.auditLogService.record({
      entityType: "Refund",
      entityId: refund.id,
      newValue: { amountEurCents: amount, jobPaymentId: payment.id, jobIssueId: issueId },
      reason: "Rimborso automatico non riuscito: richiesta passata alla Finanza.",
    });
  }

  /** L'admin chiede altre informazioni al professionista: 72 ore per rispondere. */
  async requestInfo(adminUserId: string, issueId: string, text: string): Promise<{ id: string }> {
    const issue = await this.prisma.jobIssue.findUnique({ where: { id: issueId }, include: issueInclude });
    if (!issue) throw new NotFoundException("Segnalazione non trovata.");
    if (issue.status !== "OPEN") throw new BadRequestException("La segnalazione non è in esame.");
    await this.prisma.jobIssue.update({
      where: { id: issueId },
      data: { infoRequestText: text, infoRequestedAt: new Date(), infoResponse: null, infoRespondedAt: null },
    });
    await this.auditLogService.record({ entityType: "JobIssue", entityId: issueId, fieldName: "infoRequest", newValue: text, changedByUserId: adminUserId });
    await this.notificationsService.notify(issue.booking.professionalProfile.userId, "JOB_ISSUE_INFO_REQUESTED", {
      bookingId: issue.booking.id,
      guidedRequestId: issue.booking.quote?.guidedRequestId ?? null,
      audience: "PROFESSIONAL",
    });
    return { id: issueId };
  }

  /** Il professionista risponde alla richiesta di informazioni. */
  async answerInfo(professionalUserId: string, bookingId: string, response: string): Promise<{ bookingId: string }> {
    const issue = await this.prisma.jobIssue.findUnique({ where: { bookingId }, include: issueInclude });
    if (!issue || issue.booking.professionalProfile.userId !== professionalUserId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (issue.status !== "OPEN" || !issue.infoRequestedAt) throw new BadRequestException("Non ci sono informazioni da inviare.");
    await this.prisma.jobIssue.update({ where: { id: issue.id }, data: { infoResponse: response, infoRespondedAt: new Date() } });
    return { bookingId };
  }

  /** Ricorso del professionista entro 30 giorni da una decisione accolta. */
  async appeal(professionalUserId: string, bookingId: string, text: string): Promise<{ bookingId: string }> {
    const issue = await this.prisma.jobIssue.findUnique({ where: { bookingId }, include: issueInclude });
    if (!issue || issue.booking.professionalProfile.userId !== professionalUserId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (!jobIssueCanAppeal(issue, new Date())) {
      throw new BadRequestException("Il ricorso si può presentare una volta sola, entro 30 giorni da una decisione accolta.");
    }
    await this.prisma.jobIssue.update({ where: { id: issue.id }, data: { appealText: text, appealedAt: new Date() } });
    await this.auditLogService.record({ entityType: "JobIssue", entityId: issue.id, fieldName: "appeal", newValue: text, changedByUserId: professionalUserId });
    return { bookingId };
  }

  /**
   * Decisione sul ricorso, sempre da un admin diverso da chi ha deciso la
   * segnalazione. Accolto: la segnalazione diventa respinta, l'affidabilità
   * torna com'era e la misura presa per questa segnalazione viene tolta.
   */
  async decideAppeal(adminUserId: string, issueId: string, input: { decision: "ACCEPTED" | "REJECTED"; note: string }) {
    const issue = await this.prisma.jobIssue.findUnique({ where: { id: issueId }, include: issueInclude });
    if (!issue) throw new NotFoundException("Segnalazione non trovata.");
    if (!issue.appealedAt || issue.appealDecision) throw new BadRequestException("Nessun ricorso da decidere su questa segnalazione.");
    if (issue.resolvedByUserId && issue.resolvedByUserId === adminUserId) {
      throw new ForbiddenException("Il ricorso deve essere esaminato da un admin diverso da chi ha deciso la segnalazione.");
    }
    const accepted = input.decision === "ACCEPTED";
    await this.prisma.jobIssue.update({
      where: { id: issueId },
      data: {
        appealDecision: input.decision,
        appealNote: input.note,
        appealResolvedAt: new Date(),
        appealResolvedByUserId: adminUserId,
        ...(accepted ? { status: "REJECTED" } : {}),
      },
    });
    const booking = issue.booking;
    if (accepted) {
      await this.professionalMetricsService.revertNoShowConfirmed(booking.professionalProfileId);
      if (issue.sanction === "DEMOTED") {
        await this.prisma.professionalProfile.update({ where: { id: booking.professionalProfileId }, data: { demotedUntil: null } });
      } else if (issue.sanction === "BLOCKED") {
        await this.prisma.professionalProfile.update({ where: { id: booking.professionalProfileId }, data: { requestsBlockedUntil: null } });
      }
      // Un rimborso non ancora eseguito non parte più; uno già eseguito resta.
      if (booking.jobPayment) {
        await this.prisma.refund.updateMany({ where: { jobPaymentId: booking.jobPayment.id, status: "REQUESTED" }, data: { status: "REJECTED" } });
      }
    }
    await this.auditLogService.record({
      entityType: "JobIssue",
      entityId: issueId,
      fieldName: "appealDecision",
      newValue: input.decision,
      changedByUserId: adminUserId,
      reason: input.note,
    });
    const payload = { bookingId: booking.id, guidedRequestId: booking.quote?.guidedRequestId ?? null, decision: input.decision, note: input.note };
    await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_ISSUE_APPEAL_DECIDED", { ...payload, audience: "PROFESSIONAL" });
    if (accepted) {
      await this.notificationsService.notify(booking.clientId, "JOB_ISSUE_APPEAL_DECIDED", { ...payload, audience: "CLIENT" });
    }
    return { id: issueId, appealDecision: input.decision };
  }

  /**
   * Pulsante del cliente dopo una mancata presentazione accolta (decisione
   * dell'utente): una nuova richiesta uguale all'originale, smistata ad altri
   * professionisti, escluso quello che non si è presentato.
   */
  async redispatch(clientId: string, bookingId: string): Promise<{ guidedRequestId: string }> {
    const issue = await this.prisma.jobIssue.findUnique({
      where: { bookingId },
      include: {
        booking: {
          select: {
            clientId: true,
            professionalProfileId: true,
            quote: { select: { guidedRequest: { include: { category: { select: { slug: true } } } } } },
          },
        },
      },
    });
    if (!issue || issue.booking.clientId !== clientId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (issue.type !== "NO_SHOW" || issue.status !== "UPHELD") {
      throw new BadRequestException("Puoi inviare la richiesta ad altri solo dopo una mancata presentazione accolta.");
    }
    if (issue.redispatchedGuidedRequestId) throw new ConflictException("Hai già inviato questa richiesta ad altri professionisti.");
    const original = issue.booking.quote?.guidedRequest;
    if (!original) throw new BadRequestException("Questo lavoro non è partito da una richiesta: cercane un altro dalla ricerca.");

    const created = await this.guidedRequestsService.create(
      clientId,
      {
        categorySlug: original.category.slug as never,
        description: original.description,
        photoUrls: original.photoUrls,
        city: original.city || undefined,
        address: original.address ?? undefined,
        recipientName: original.recipientName ?? undefined,
        recipientSurname: original.recipientSurname ?? undefined,
        recipientPhone: original.recipientPhone ?? undefined,
        houseNumber: original.houseNumber ?? undefined,
        addressExtra: original.addressExtra ?? undefined,
        postalCode: original.postalCode ?? undefined,
        province: original.province ?? undefined,
        isUrgent: original.isUrgent,
        serviceMode: original.serviceMode ?? "HOME",
        forwardIfNoReply: false,
      },
      { excludeProfileId: issue.booking.professionalProfileId },
    );
    const guidedRequestId = created.guidedRequestId;
    await this.prisma.jobIssue.update({ where: { id: issue.id }, data: { redispatchedGuidedRequestId: guidedRequestId } });
    return { guidedRequestId };
  }

  /**
   * Scadenze automatiche, ogni ora: in chat senza risposta del professionista
   * entro 48 ore la segnalazione passa al nostro team; in esame senza la
   * versione del professionista entro 72 ore (o senza le informazioni
   * richieste entro 72 ore) è accolta automaticamente.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async runDeadlines(now: Date = new Date()): Promise<{ escalated: number; decided: number }> {
    let escalated = 0;
    let decided = 0;
    const chats = await this.prisma.jobIssue.findMany({ where: { status: "CHAT" }, include: issueInclude });
    const replies = await this.proChatReplies(
      chats.map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        professionalRespondedAt: i.professionalRespondedAt,
        guidedRequestId: i.booking.quote?.guidedRequestId ?? null,
        professionalProfileId: i.booking.professionalProfileId,
      })),
    );
    for (const issue of chats) {
      // Pagamento diretto (§168): resta tra cliente e professionista, mai al nostro team.
      const assisted = issue.booking.jobPayment?.paymentMethod !== "DIRECT";
      const reason = jobIssueAutoEscalation({ status: issue.status, createdAt: issue.createdAt, proRepliedAt: replies.get(issue.id) ?? null, assisted }, now);
      if (!reason) continue;
      const moved = await this.prisma.jobIssue.updateMany({
        where: { id: issue.id, status: "CHAT" },
        data: { status: "OPEN", escalatedAt: now, escalationReason: reason },
      });
      if (moved.count === 0) continue;
      escalated += 1;
      const payload = {
        bookingId: issue.booking.id,
        guidedRequestId: issue.booking.quote?.guidedRequestId ?? null,
        issueType: issue.type,
        evidenceDueAt: jobIssueEvidenceDueAt(now).toISOString(),
      };
      await this.notificationsService.notify(issue.booking.professionalProfile.userId, "JOB_ISSUE_AUTO_ESCALATED", { ...payload, audience: "PROFESSIONAL" });
      await this.notificationsService.notify(issue.booking.clientId, "JOB_ISSUE_TEAM_REVIEW", { ...payload, audience: "CLIENT" });
      if (issue.booking.quote) {
        await this.timelineService.log(
          issue.booking.quote.guidedRequestId,
          issue.booking.professionalProfileId,
          "SYSTEM",
          "Il professionista non ha risposto in chat entro 48 ore: la segnalazione passa al nostro team. Il professionista ha 72 ore per inviare la sua versione.",
        );
      }
    }

    const open = await this.prisma.jobIssue.findMany({
      where: { status: "OPEN" },
      select: { id: true, status: true, createdAt: true, escalatedAt: true, professionalRespondedAt: true, infoRequestedAt: true, infoRespondedAt: true },
    });
    for (const issue of open) {
      const auto = jobIssueAutoDecision({ ...issue, escalatedAt: issue.escalatedAt ?? issue.createdAt }, now);
      if (!auto) continue;
      try {
        await this.decide(issue.id, { decision: "UPHELD", note: JOB_ISSUE_AUTO_DECISION_NOTE[auto], byUserId: null, autoDecision: auto });
        decided += 1;
      } catch (err) {
        this.logger.warn(`Decisione automatica non applicata su ${issue.id}: ${(err as Error).message}`);
      }
    }
    return { escalated, decided };
  }
}

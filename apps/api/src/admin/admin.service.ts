import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ContentReportTargetType, ModerationAction, Prisma, PrismaClient } from "@professionisti/database";
import { MODERATION_ACTIONS_BY_TARGET, type ResolveContentReportInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";

export type AdminUserRow = {
  id: string;
  email: string | null;
  name: string | null;
  surname: string | null;
  role: string;
  businessName: string | null;
  professionalProfileId: string | null;
  profileSuspended: boolean;
  createdAt: string;
  deletedAt: string | null;
  suspendedAt: string | null;
};

export type AdminUsersPage = { total: number; page: number; pageSize: number; rows: AdminUserRow[] };

export type AdminOverview = {
  openReports: number;
  pendingAppeals: number;
  openMessages: number;
  pendingRefunds: number;
  openDisputes: number;
  newUsers7d: number;
  clients: number;
  professionals: number;
  suspendedUsers: number;
  hiddenLeads: number;
  waitlist: number;
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
  ) {}

  /**
   * Utenti con ricerca, filtri e paginazione (docs/CHANGELOG.md §144): prima
   * arrivavano tutti insieme, senza id, ricerca né stato (un account
   * eliminato sembrava attivo). Ricerca su email, nome, cognome e nome
   * attività, senza distinzione tra maiuscole e minuscole.
   */
  async listUsers(params: { q?: string; role?: string; status?: string; page?: number }): Promise<AdminUsersPage> {
    const pageSize = 50;
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const q = params.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(params.role === "CLIENT" || params.role === "PROFESSIONAL" || params.role === "ADMIN" ? { role: params.role } : {}),
      ...(params.status === "active" ? { deletedAt: null, suspendedAt: null } : {}),
      ...(params.status === "suspended" ? { suspendedAt: { not: null } } : {}),
      ...(params.status === "deleted" ? { deletedAt: { not: null } } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { surname: { contains: q, mode: "insensitive" } },
              { professionalProfile: { businessName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          surname: true,
          role: true,
          createdAt: true,
          deletedAt: true,
          suspendedAt: true,
          professionalProfile: { select: { id: true, businessName: true, suspendedAt: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      rows: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        surname: u.surname,
        role: u.role,
        businessName: u.professionalProfile?.businessName ?? null,
        professionalProfileId: u.professionalProfile?.id ?? null,
        profileSuspended: u.professionalProfile?.suspendedAt != null,
        createdAt: u.createdAt.toISOString(),
        deletedAt: u.deletedAt?.toISOString() ?? null,
        suspendedAt: u.suspendedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Contatori della home admin (docs/CHANGELOG.md §144): cosa c'è da fare
   * oggi, come la Home di Shopify o l'Overview di Vercel.
   */
  async getOverview(): Promise<AdminOverview> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [openReports, pendingAppeals, openMessages, pendingRefunds, openDisputes, newUsers7d, clients, professionals, suspendedUsers, hiddenLeads, waitlist] =
      await Promise.all([
        this.prisma.contentReport.count({ where: { status: "OPEN" } }),
        this.prisma.contentReport.count({ where: { appealedAt: { not: null }, appealRejectedAt: null, revertedAt: null } }),
        this.prisma.contactMessage.count({ where: { resolved: false } }),
        this.prisma.refund.count({ where: { status: "REQUESTED" } }),
        this.prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
        this.prisma.user.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null } }),
        this.prisma.user.count({ where: { role: "CLIENT", deletedAt: null } }),
        this.prisma.user.count({ where: { role: "PROFESSIONAL", deletedAt: null } }),
        this.prisma.user.count({ where: { suspendedAt: { not: null } } }),
        this.prisma.lead.count({ where: { hiddenByProfessionalAt: { not: null } } }),
        this.prisma.waitlistSignup.count(),
      ]);
    return { openReports, pendingAppeals, openMessages, pendingRefunds, openDisputes, newUsers7d, clients, professionals, suspendedUsers, hiddenLeads, waitlist };
  }

  /**
   * Email raccolte dal riquadro "Arriviamo presto nella tua zona"
   * (homepage, sotto la soglia di professionisti reali per mostrare la
   * vetrina — CLAUDE.md §10 Fase 4) — richiesta esplicita dell'utente:
   * "salvale in un elenco visualizzabile dai profili admin". Erano già
   * scritte su `WaitlistSignup` da `WaitlistService.signup`, mai lette da
   * nessun endpoint prima d'ora.
   */
  async listWaitlist(): Promise<{ email: string; createdAt: string }[]> {
    const signups = await this.prisma.waitlistSignup.findMany({ orderBy: { createdAt: "desc" } });
    return signups.map((s) => ({ email: s.email, createdAt: s.createdAt.toISOString() }));
  }

  async promoteToAdmin(email: string): Promise<{ email: string; role: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException("Nessun utente registrato con questa email.");
    }
    const updated = await this.prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    return { email: updated.email as string, role: updated.role };
  }

  /**
   * Segnalazioni contenuti (richiesta esplicita dell'utente, "Verbale di
   * Conformità" — DSA art. 16): elenco per gestione admin, con un'etichetta
   * leggibile del target (nome attività o autore della recensione) invece
   * del solo id, così l'admin non deve andare a cercarlo a mano prima di
   * poter decidere. `targetLabel` è "best effort": `null` se il contenuto
   * segnalato è nel frattempo sparito (es. account eliminato).
   */
  async listContentReports(status?: "OPEN" | "RESOLVED" | "DISMISSED") {
    const reports = await this.prisma.contentReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: { reporter: { select: { email: true, name: true, surname: true } } },
    });

    // `linkedProfessionalProfileId` alimenta il bottone "Vai alla
    // segnalazione" lato admin (richiesta esplicita dell'utente): per un
    // profilo segnalato è il target stesso, per una recensione è il
    // profilo su cui vive (serve a costruire il link pubblico
    // `/professionista/{id}#recensione-{reviewId}`) — per una recensione
    // sul cliente resta `null` di proposito: quel contenuto non ha una
    // pagina pubblica raggiungibile (nessun profilo pubblico del
    // cliente in questo marketplace, CLAUDE.md §40/§45), un link lì
    // sarebbe stato un bottone che non porta da nessuna parte.
    const targetInfo = await Promise.all(
      reports.map(async (report): Promise<{ label: string | null; linkedProfessionalProfileId: string | null; excerpt?: string | null }> => {
        if (report.targetType === "PROFESSIONAL_PROFILE") {
          const profile = await this.prisma.professionalProfile.findUnique({
            where: { id: report.targetId },
            select: { businessName: true, bio: true },
          });
          return { label: profile?.businessName ?? null, linkedProfessionalProfileId: profile ? report.targetId : null, excerpt: profile?.bio ?? null };
        }
        if (report.targetType === "REVIEW") {
          const review = await this.prisma.review.findUnique({
            where: { id: report.targetId },
            select: { comment: true, booking: { select: { professionalProfile: { select: { id: true, businessName: true } } } } },
          });
          return {
            label: review ? `Recensione su ${review.booking.professionalProfile.businessName}` : null,
            linkedProfessionalProfileId: review?.booking.professionalProfile.id ?? null,
            excerpt: review?.comment ?? null,
          };
        }
        if (report.targetType === "GUIDED_REQUEST") {
          const request = await this.prisma.guidedRequest.findUnique({
            where: { id: report.targetId },
            select: { city: true, description: true, category: { select: { label: true } }, client: { select: { name: true, surname: true } } },
          });
          const clientName = request ? [request.client.name, request.client.surname].filter(Boolean).join(" ") || "cliente" : null;
          return {
            label: request ? `Richiesta ${request.category.label}${request.city ? ` a ${request.city}` : ""} di ${clientName}` : null,
            linkedProfessionalProfileId: null,
            excerpt: request?.description ?? null,
          };
        }
        const clientReview = await this.prisma.clientReview.findUnique({
          where: { id: report.targetId },
          select: { comment: true, client: { select: { name: true, surname: true } } },
        });
        return {
          label: clientReview ? `Recensione su ${[clientReview.client.name, clientReview.client.surname].filter(Boolean).join(" ") || "cliente"}` : null,
          linkedProfessionalProfileId: null,
          excerpt: clientReview?.comment ?? null,
        };
      }),
    );

    return reports.map((report, index) => ({
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      targetLabel: targetInfo[index]?.label ?? null,
      linkedProfessionalProfileId: targetInfo[index]?.linkedProfessionalProfileId ?? null,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      resolutionNote: report.resolutionNote,
      targetExcerpt: targetInfo[index]?.excerpt ?? null,
      action: report.action,
      authoritiesNotifiedAt: report.authoritiesNotifiedAt?.toISOString() ?? null,
      revertedAt: report.revertedAt?.toISOString() ?? null,
      revertNote: report.revertNote,
      appealText: report.appealText,
      appealedAt: report.appealedAt?.toISOString() ?? null,
      appealRejectedAt: report.appealRejectedAt?.toISOString() ?? null,
      appealRejectNote: report.appealRejectNote,
      reporterEmail: report.reporter.email,
      reporterName: [report.reporter.name, report.reporter.surname].filter(Boolean).join(" ") || null,
    }));
  }

  /**
   * Risolve una segnalazione (DSA artt. 16/17, docs/CHANGELOG.md §144).
   * - DISMISSED: nessuna misura, il segnalante viene informato.
   * - RESOLVED: applica davvero la misura scelta (`action`, compatibile col
   *   tipo di contenuto — `MODERATION_ACTIONS_BY_TARGET`), poi manda al
   *   segnalante l'esito e all'autore la motivazione con misura presa e
   *   possibilità di contestare (pagina /segnalazioni).
   * Prima di §144 "Risolvi" cambiava solo lo stato: il contenuto restava
   * online mentre la motivazione descriveva una limitazione mai avvenuta.
   */
  async resolveContentReport(id: string, input: ResolveContentReportInput) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException("Segnalazione non trovata.");
    }
    if (report.status !== "OPEN") {
      throw new BadRequestException("Questa segnalazione è già stata decisa.");
    }
    const note = input.resolutionNote?.trim() || null;
    const status = input.status;
    const action = status === "RESOLVED" ? (input.action ?? null) : null;
    if (status === "RESOLVED" && !note) {
      // Stessa regola già applicata da `resolveContentReportSchema` lato
      // Zod — riverificata qui perché questo metodo non deve mai fidarsi
      // solo della validazione a monte per un vincolo che alimenta un
      // obbligo di trasparenza reale.
      throw new BadRequestException("Indica il motivo della decisione prima di risolvere la segnalazione.");
    }
    if (status === "RESOLVED" && (!action || !MODERATION_ACTIONS_BY_TARGET[report.targetType].includes(action))) {
      throw new BadRequestException("Misura non valida per questo tipo di contenuto.");
    }

    const ownerUserId = await this.resolveContentOwnerUserId(report.targetType, report.targetId);
    if (action && action !== "WARN" && action !== "REQUEST_CORRECTION" && !(await this.targetExists(report.targetType, report.targetId))) {
      throw new BadRequestException("Il contenuto segnalato non esiste più: scegli \"Avvisa l'autore\" oppure ignora la segnalazione.");
    }
    if (action === "SUSPEND_USER" && !ownerUserId) {
      throw new BadRequestException("Impossibile risalire all'autore del contenuto.");
    }

    const now = new Date();
    const affectedProfileIds = await this.prisma.$transaction(async (tx) => {
      const profileIds = action ? await this.applyModeration(tx, report.targetType, report.targetId, action, ownerUserId, now) : [];
      await tx.contentReport.update({
        where: { id },
        data: {
          status,
          resolvedAt: now,
          resolutionNote: note,
          action,
          contentOwnerId: status === "RESOLVED" ? ownerUserId : null,
          authoritiesNotifiedAt: input.authoritiesNotified ? now : null,
        },
      });
      return profileIds;
    });
    await Promise.all(affectedProfileIds.map((profileId) => this.professionalMetricsService.recomputeReviews(profileId)));

    await this.notificationsService.notify(report.reporterId, "CONTENT_REPORT_DECISION", {
      contentReportId: report.id,
      targetType: report.targetType,
      status,
      note,
    });

    if (status === "RESOLVED" && ownerUserId) {
      await this.notificationsService.notify(ownerUserId, "CONTENT_REPORT_UPHELD", {
        contentReportId: report.id,
        targetType: report.targetType,
        action,
        note,
      });
    }

    return { id: report.id, status, action, resolutionNote: note };
  }

  /**
   * "Annulla misura" (ricorso accolto o errore dell'admin, DSA art. 20):
   * toglie la misura applicata, la segnalazione resta in archivio con la
   * motivazione dell'annullamento, l'autore viene avvisato.
   */
  async revertContentReport(id: string, note: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Segnalazione non trovata.");
    if (report.status !== "RESOLVED") throw new BadRequestException("Solo una segnalazione accolta ha una misura da annullare.");
    if (report.revertedAt) throw new BadRequestException("La misura è già stata annullata.");

    const now = new Date();
    const affectedProfileIds = await this.prisma.$transaction(async (tx) => {
      const profileIds = report.action ? await this.undoModeration(tx, report.targetType, report.targetId, report.action, report.contentOwnerId) : [];
      await tx.contentReport.update({ where: { id }, data: { revertedAt: now, revertNote: note.trim() } });
      return profileIds;
    });
    await Promise.all(affectedProfileIds.map((profileId) => this.professionalMetricsService.recomputeReviews(profileId)));

    if (report.contentOwnerId) {
      await this.notificationsService.notify(report.contentOwnerId, "CONTENT_REPORT_REVERTED", {
        contentReportId: report.id,
        targetType: report.targetType,
        note: note.trim(),
      });
    }
    return { id: report.id, revertedAt: now.toISOString() };
  }

  /** Ricorso dell'autore respinto: la misura resta, l'autore riceve la motivazione. */
  async rejectAppeal(id: string, note: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Segnalazione non trovata.");
    if (!report.appealedAt || report.appealRejectedAt || report.revertedAt) {
      throw new BadRequestException("Non c'è un ricorso in attesa su questa segnalazione.");
    }
    const now = new Date();
    await this.prisma.contentReport.update({ where: { id }, data: { appealRejectedAt: now, appealRejectNote: note.trim() } });
    if (report.contentOwnerId) {
      await this.notificationsService.notify(report.contentOwnerId, "CONTENT_REPORT_APPEAL_REJECTED", {
        contentReportId: report.id,
        targetType: report.targetType,
        note: note.trim(),
      });
    }
    return { id: report.id, appealRejectedAt: now.toISOString() };
  }

  private async targetExists(targetType: ContentReportTargetType, targetId: string): Promise<boolean> {
    if (targetType === "PROFESSIONAL_PROFILE") return (await this.prisma.professionalProfile.count({ where: { id: targetId } })) > 0;
    if (targetType === "REVIEW") return (await this.prisma.review.count({ where: { id: targetId } })) > 0;
    if (targetType === "CLIENT_REVIEW") return (await this.prisma.clientReview.count({ where: { id: targetId } })) > 0;
    return (await this.prisma.guidedRequest.count({ where: { id: targetId } })) > 0;
  }

  /**
   * Applica la misura. "Sospendi account" include anche la misura più lieve
   * sul contenuto segnalato (recensione/richiesta nascosta, profilo tolto
   * dalla ricerca): sospendere l'autore lasciando online proprio il
   * contenuto segnalato non avrebbe senso. Restituisce i profili la cui
   * media voti va ricalcolata.
   */
  private async applyModeration(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    action: ModerationAction,
    ownerUserId: string | null,
    now: Date,
  ): Promise<string[]> {
    const hideContent = action === "HIDE_CONTENT" || (action === "SUSPEND_USER" && targetType !== "PROFESSIONAL_PROFILE");
    const profileIds: string[] = [];
    if (hideContent) profileIds.push(...(await this.setContentHidden(tx, targetType, targetId, now)));
    if (action === "SUSPEND_PROFILE" || (action === "SUSPEND_USER" && targetType === "PROFESSIONAL_PROFILE")) {
      await tx.professionalProfile.update({ where: { id: targetId }, data: { suspendedAt: now } });
    }
    if (action === "SUSPEND_USER" && ownerUserId) {
      await tx.user.update({ where: { id: ownerUserId }, data: { suspendedAt: now } });
      // Un professionista sospeso sparisce anche da ricerca e fan-out.
      await tx.professionalProfile.updateMany({ where: { userId: ownerUserId, suspendedAt: null }, data: { suspendedAt: now } });
    }
    return profileIds;
  }

  private async undoModeration(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    action: ModerationAction,
    ownerUserId: string | null,
  ): Promise<string[]> {
    const contentWasHidden = action === "HIDE_CONTENT" || (action === "SUSPEND_USER" && targetType !== "PROFESSIONAL_PROFILE");
    const profileIds: string[] = [];
    if (contentWasHidden) profileIds.push(...(await this.setContentHidden(tx, targetType, targetId, null)));
    if (action === "SUSPEND_PROFILE" || (action === "SUSPEND_USER" && targetType === "PROFESSIONAL_PROFILE")) {
      await tx.professionalProfile.updateMany({ where: { id: targetId }, data: { suspendedAt: null } });
    }
    if (action === "SUSPEND_USER" && ownerUserId) {
      await tx.user.updateMany({ where: { id: ownerUserId }, data: { suspendedAt: null } });
      await tx.professionalProfile.updateMany({ where: { userId: ownerUserId }, data: { suspendedAt: null } });
    }
    return profileIds;
  }

  /** Nasconde (o ripristina, con `null`) il contenuto; per una richiesta aperta la chiude anche. */
  private async setContentHidden(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
    hiddenAt: Date | null,
  ): Promise<string[]> {
    if (targetType === "REVIEW") {
      const review = await tx.review.update({
        where: { id: targetId },
        data: { hiddenAt },
        select: { booking: { select: { professionalProfileId: true } } },
      });
      return [review.booking.professionalProfileId];
    }
    if (targetType === "CLIENT_REVIEW") {
      await tx.clientReview.update({ where: { id: targetId }, data: { hiddenAt } });
      return [];
    }
    if (targetType === "GUIDED_REQUEST") {
      const request = await tx.guidedRequest.findUnique({ where: { id: targetId }, select: { status: true } });
      // Ripristinarla non la riapre: una richiesta chiusa per moderazione
      // resta chiusa, torna solo visibile ai professionisti che l'avevano.
      const closeIt = hiddenAt !== null && request?.status === "OPEN";
      await tx.guidedRequest.update({ where: { id: targetId }, data: { hiddenAt, ...(closeIt ? { status: "CLOSED" } : {}) } });
    }
    return [];
  }

  /**
   * Chi ha scritto/possiede il contenuto segnalato — il destinatario dello
   * "statement of reasons" quando una segnalazione viene accolta. Stessa
   * distinzione per `targetType` già usata in `listContentReports` per
   * risolvere `targetLabel`: per una `CLIENT_REVIEW` l'autore è il
   * professionista (che l'ha scritta sul cliente), non il cliente stesso.
   */
  private async resolveContentOwnerUserId(targetType: ContentReportTargetType, targetId: string): Promise<string | null> {
    if (targetType === "PROFESSIONAL_PROFILE") {
      const profile = await this.prisma.professionalProfile.findUnique({ where: { id: targetId }, select: { userId: true } });
      return profile?.userId ?? null;
    }
    if (targetType === "REVIEW") {
      const review = await this.prisma.review.findUnique({ where: { id: targetId }, select: { booking: { select: { clientId: true } } } });
      return review?.booking.clientId ?? null;
    }
    if (targetType === "GUIDED_REQUEST") {
      const request = await this.prisma.guidedRequest.findUnique({ where: { id: targetId }, select: { clientId: true } });
      return request?.clientId ?? null;
    }
    const clientReview = await this.prisma.clientReview.findUnique({
      where: { id: targetId },
      select: { booking: { select: { professionalProfile: { select: { userId: true } } } } },
    });
    return clientReview?.booking.professionalProfile.userId ?? null;
  }

  /**
   * Messaggi dal form "Contatti" (footer, richiesta esplicita dell'utente al
   * posto dell'elenco categorie "Servizi") — solo quelli non ancora gestiti,
   * stesso principio già seguito per le segnalazioni contenuti (§ sopra).
   */
  async listContactMessages(resolved = false): Promise<
    { id: string; role: string; email: string; content: string; resolved: boolean; createdAt: string }[]
  > {
    const messages = await this.prisma.contactMessage.findMany({
      // Archivio dei messaggi gestiti (docs/CHANGELOG.md §144): prima un
      // messaggio segnato come gestito spariva del tutto.
      where: { resolved },
      orderBy: { createdAt: "desc" },
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      email: m.email,
      content: m.content,
      resolved: m.resolved,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async resolveContactMessage(id: string): Promise<{ id: string; resolved: boolean }> {
    const message = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!message) {
      throw new NotFoundException("Messaggio non trovato.");
    }
    const updated = await this.prisma.contactMessage.update({ where: { id }, data: { resolved: true } });
    return { id: updated.id, resolved: updated.resolved };
  }

  /**
   * Richieste che un professionista ha "eliminato" dalla propria lista
   * (`ProfessionalsService.deleteLead`, docs/CHANGELOG.md §143): richiesta
   * esplicita dell'utente, "nascondile, in modo che un admin possa vederle".
   * Solo i dati per capire cosa è stato tolto e perché — mai telefono,
   * email o indirizzo del cliente.
   */
  async listHiddenLeads(): Promise<AdminHiddenLeadRow[]> {
    const leads = await this.prisma.lead.findMany({
      where: { hiddenByProfessionalAt: { not: null } },
      orderBy: { hiddenByProfessionalAt: "desc" },
      include: {
        professionalProfile: { select: { id: true, businessName: true } },
        guidedRequest: {
          select: {
            id: true,
            description: true,
            city: true,
            createdAt: true,
            category: { select: { label: true } },
            client: { select: { name: true, surname: true, deletedAt: true } },
            quotes: { select: { professionalProfileId: true, status: true } },
          },
        },
      },
    });
    return leads.map((lead) => {
      const quote = lead.guidedRequest.quotes.find((q) => q.professionalProfileId === lead.professionalProfileId);
      const client = lead.guidedRequest.client;
      return {
        leadId: lead.id,
        guidedRequestId: lead.guidedRequest.id,
        professionalProfileId: lead.professionalProfile.id,
        businessName: lead.professionalProfile.businessName,
        clientName: client.deletedAt ? null : [client.name, client.surname].filter(Boolean).join(" ") || null,
        clientAccountDeleted: client.deletedAt !== null,
        categoryLabel: lead.guidedRequest.category.label,
        city: lead.guidedRequest.city,
        description: lead.guidedRequest.description,
        reason: hiddenLeadReason(lead.status, quote?.status ?? null, client.deletedAt !== null),
        requestCreatedAt: lead.guidedRequest.createdAt.toISOString(),
        hiddenAt: (lead.hiddenByProfessionalAt as Date).toISOString(),
      };
    });
  }
}

export type AdminHiddenLeadRow = {
  leadId: string;
  guidedRequestId: string;
  professionalProfileId: string;
  businessName: string;
  clientName: string | null;
  clientAccountDeleted: boolean;
  categoryLabel: string;
  city: string;
  description: string;
  reason: string;
  requestCreatedAt: string;
  hiddenAt: string;
};

/** Stato della scheda al momento in cui è stata eliminata, in parole. */
function hiddenLeadReason(leadStatus: string, quoteStatus: string | null, clientAccountDeleted: boolean): string {
  if (leadStatus === "EXPIRED") return "Scaduta";
  if (leadStatus === "DECLINED") return "Rifiutata dal professionista";
  if (quoteStatus === "WITHDRAWN") return "Preventivo ritirato";
  if (quoteStatus === "REJECTED") return "Preventivo rifiutato dal cliente";
  if (clientAccountDeleted) return "Account cliente eliminato";
  return "Chiusa";
}

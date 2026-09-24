import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ContentReportTargetType, PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

export type AdminUserRow = {
  email: string | null;
  name: string | null;
  surname: string | null;
  businessName: string | null;
  createdAt: string;
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listUsersByRole(): Promise<{ clients: AdminUserRow[]; professionals: AdminUserRow[]; admins: AdminUserRow[] }> {
    // Tutti i ruoli, ADMIN incluso: prima venivano lette solo CLIENT/PROFESSIONAL,
    // quindi un'email appena promossa via /admin/bootstrap spariva del tutto da
    // questa pagina invece di comparire come admin — sembrava che la
    // promozione non fosse stata salvata (bug reale segnalato dall'utente),
    // mentre in realtà era salvata sul DB ma semplicemente mai mostrata qui.
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        email: true,
        name: true,
        surname: true,
        role: true,
        createdAt: true,
        professionalProfile: { select: { businessName: true } },
      },
    });

    const toRow = (u: (typeof users)[number]): AdminUserRow => ({
      email: u.email,
      name: u.name,
      surname: u.surname,
      businessName: u.professionalProfile?.businessName ?? null,
      createdAt: u.createdAt.toISOString(),
    });

    return {
      clients: users.filter((u) => u.role === "CLIENT").map(toRow),
      professionals: users.filter((u) => u.role === "PROFESSIONAL").map(toRow),
      admins: users.filter((u) => u.role === "ADMIN").map(toRow),
    };
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
      reports.map(async (report): Promise<{ label: string | null; linkedProfessionalProfileId: string | null }> => {
        if (report.targetType === "PROFESSIONAL_PROFILE") {
          const profile = await this.prisma.professionalProfile.findUnique({ where: { id: report.targetId }, select: { businessName: true } });
          return { label: profile?.businessName ?? null, linkedProfessionalProfileId: profile ? report.targetId : null };
        }
        if (report.targetType === "REVIEW") {
          const review = await this.prisma.review.findUnique({
            where: { id: report.targetId },
            select: { comment: true, booking: { select: { professionalProfile: { select: { id: true, businessName: true } } } } },
          });
          return {
            label: review ? `Recensione su ${review.booking.professionalProfile.businessName}` : null,
            linkedProfessionalProfileId: review?.booking.professionalProfile.id ?? null,
          };
        }
        if (report.targetType === "GUIDED_REQUEST") {
          const request = await this.prisma.guidedRequest.findUnique({
            where: { id: report.targetId },
            select: { city: true, category: { select: { label: true } }, client: { select: { name: true, surname: true } } },
          });
          const clientName = request ? [request.client.name, request.client.surname].filter(Boolean).join(" ") || "cliente" : null;
          return {
            label: request ? `Richiesta ${request.category.label}${request.city ? ` a ${request.city}` : ""} di ${clientName}` : null,
            linkedProfessionalProfileId: null,
          };
        }
        const clientReview = await this.prisma.clientReview.findUnique({
          where: { id: report.targetId },
          select: { client: { select: { name: true, surname: true } } },
        });
        return {
          label: clientReview ? `Recensione su ${[clientReview.client.name, clientReview.client.surname].filter(Boolean).join(" ") || "cliente"}` : null,
          linkedProfessionalProfileId: null,
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
      reporterEmail: report.reporter.email,
      reporterName: [report.reporter.name, report.reporter.surname].filter(Boolean).join(" ") || null,
    }));
  }

  /**
   * Risolve una segnalazione — richiede esplicita dell'utente
   * ("Parte 1, punto 4" del Verbale di Conformità, DSA artt. 16/17): prima
   * era solo un cambio di stato interno, senza alcuna comunicazione a chi
   * aveva subito o presentato la segnalazione. Ora:
   * 1. Il segnalante viene sempre notificato dell'esito (Art. 16(5)/(6),
   *    "informare il notificante della decisione").
   * 2. Se la segnalazione viene accolta (`RESOLVED`), l'autore del
   *    contenuto segnalato riceve uno "statement of reasons" (Art. 17) con
   *    il motivo scritto dall'admin — mai per `DISMISSED`, dove nessuna
   *    limitazione è avvenuta e quindi l'obbligo non scatta.
   */
  async resolveContentReport(id: string, status: "RESOLVED" | "DISMISSED", resolutionNote?: string) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException("Segnalazione non trovata.");
    }
    const note = resolutionNote?.trim() || null;
    if (status === "RESOLVED" && !note) {
      // Stessa regola già applicata da `resolveContentReportSchema` lato
      // Zod — riverificata qui perché questo metodo non deve mai fidarsi
      // solo della validazione a monte per un vincolo che alimenta un
      // obbligo di trasparenza reale.
      throw new BadRequestException("Indica il motivo della decisione prima di risolvere la segnalazione.");
    }

    const updated = await this.prisma.contentReport.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolutionNote: note },
    });

    await this.notificationsService.notify(report.reporterId, "CONTENT_REPORT_DECISION", {
      contentReportId: report.id,
      targetType: report.targetType,
      status,
      note,
    });

    if (status === "RESOLVED") {
      const ownerUserId = await this.resolveContentOwnerUserId(report.targetType, report.targetId);
      if (ownerUserId) {
        await this.notificationsService.notify(ownerUserId, "CONTENT_REPORT_UPHELD", {
          contentReportId: report.id,
          targetType: report.targetType,
          note,
        });
      }
    }

    return { id: updated.id, status: updated.status, resolutionNote: updated.resolutionNote };
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
  async listContactMessages(): Promise<
    { id: string; role: string; email: string; content: string; resolved: boolean; createdAt: string }[]
  > {
    const messages = await this.prisma.contactMessage.findMany({
      where: { resolved: false },
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

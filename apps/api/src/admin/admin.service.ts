import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

export type AdminUserRow = {
  email: string | null;
  name: string | null;
  surname: string | null;
  businessName: string | null;
  createdAt: string;
};

@Injectable()
export class AdminService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
      reporterEmail: report.reporter.email,
      reporterName: [report.reporter.name, report.reporter.surname].filter(Boolean).join(" ") || null,
    }));
  }

  async resolveContentReport(id: string, status: "RESOLVED" | "DISMISSED") {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException("Segnalazione non trovata.");
    }
    const updated = await this.prisma.contentReport.update({ where: { id }, data: { status, resolvedAt: new Date() } });
    return { id: updated.id, status: updated.status };
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
}

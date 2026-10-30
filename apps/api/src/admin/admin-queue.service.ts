import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  ADMIN_QUEUE_KINDS,
  BANK_DISPUTE_OPEN_STATUSES,
  adminCan,
  jobIssueReviewPhase,
  matchProblem,
  sortAdminQueue,
  type AdminQueue,
  type AdminQueueItem,
  type AdminQueueKind,
  type AdminRoleValue,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

type Person = { name: string | null; surname: string | null } | null;
const personName = (p: Person) => [p?.name, p?.surname].filter(Boolean).join(" ") || "Utente";
const between = (client: Person, business: string | null | undefined) => `${personName(client)} → ${business ?? "professionista"}`;
const short = (text: string | null | undefined, max = 110) => (text ? (text.length > max ? `${text.slice(0, max - 1)}…` : text) : null);

/**
 * Coda "Da fare" dell'area admin (docs/changelog/2026-10-30-admin-riordino.md):
 * raccoglie in un elenco i casi aperti di ogni tipo con la loro scadenza, e chi
 * li ha presi ("Prendo io"). Ogni tipo compare solo a chi ha il ruolo per
 * deciderlo, con gli stessi permessi delle pagine dove si decide.
 */
@Injectable()
export class AdminQueueService {
  private readonly logger = new Logger(AdminQueueService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async rolesOf(adminUserId: string): Promise<AdminRoleValue[]> {
    const user = await this.prisma.user.findUnique({ where: { id: adminUserId }, select: { adminRoles: true } });
    return (user?.adminRoles ?? []) as AdminRoleValue[];
  }

  async getQueue(adminUserId: string): Promise<AdminQueue> {
    const roles = await this.rolesOf(adminUserId);
    const can = (kind: AdminQueueKind) => adminCan(roles, ADMIN_QUEUE_KINDS[kind].scope);
    const items: Omit<AdminQueueItem, "claimedBy">[] = [];
    const bookingInclude = {
      client: { select: { name: true, surname: true } },
      professionalProfile: { select: { businessName: true } },
      quote: { select: { guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
    } as const;

    const [bankDisputes, issues, appeals, refunds, disputes, unpaid, sdi, reports, reportAppeals, takeovers, messages, verifications, zones, chatIssues] = await Promise.all([
      can("BANK_DISPUTE")
        ? this.prisma.jobPayment.findMany({ where: { stripeDisputeStatus: { in: [...BANK_DISPUTE_OPEN_STATUSES] } }, include: { booking: { include: bookingInclude } } })
        : [],
      can("JOB_ISSUE") ? this.prisma.jobIssue.findMany({ where: { status: "OPEN" }, include: { booking: { include: { ...bookingInclude, jobPayment: { select: { paidEurCents: true } } } } } }) : [],
      can("JOB_ISSUE_APPEAL")
        ? this.prisma.jobIssue.findMany({ where: { appealedAt: { not: null }, appealDecision: null }, include: { booking: { include: bookingInclude } } })
        : [],
      can("REFUND")
        ? this.prisma.refund.findMany({ where: { status: "REQUESTED" }, include: { jobPayment: { include: { booking: { include: bookingInclude } } } } })
        : [],
      can("DISPUTE")
        ? this.prisma.dispute.findMany({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } }, include: { jobPayment: { include: { booking: { include: bookingInclude } } } } })
        : [],
      can("UNPAID_BALANCE") ? this.prisma.jobPayment.findMany({ where: { balanceUnpaidAt: { not: null } }, include: { booking: { include: bookingInclude } } }) : [],
      can("SDI_REJECTED") ? this.prisma.invoice.findMany({ where: { sdiStatus: "REJECTED" } }) : [],
      can("CONTENT_REPORT") ? this.prisma.contentReport.findMany({ where: { status: "OPEN" }, include: { reporter: { select: { name: true, surname: true } } } }) : [],
      can("REPORT_APPEAL") ? this.prisma.contentReport.findMany({ where: { appealedAt: { not: null }, appealRejectedAt: null, revertedAt: null } }) : [],
      can("PROBLEM_TAKEOVER") ? this.prisma.problemTakeover.findMany({ where: { status: "OPEN" }, include: { user: { select: { name: true, surname: true } } } }) : [],
      can("CONTACT_MESSAGE") ? this.prisma.contactMessage.findMany({ where: { resolved: false } }) : [],
      can("VERIFICATION")
        ? this.prisma.professionalProfile.findMany({ where: { verificationRequestedAt: { not: null }, verified: false, deletedAt: null, invitePendingAt: null }, select: { id: true, businessName: true, verificationRequestedAt: true } })
        : [],
      can("CLOSED_ZONE") ? this.prisma.generalRequestBlock.findMany({ where: { reopenedAt: null }, include: { category: { select: { label: true } } } }) : [],
      can("JOB_ISSUE") ? this.prisma.jobIssue.findMany({ where: { status: "CHAT" }, include: { booking: { include: bookingInclude } } }) : [],
    ]);

    for (const p of bankDisputes) {
      items.push({
        key: `BANK_DISPUTE:${p.id}`,
        kind: "BANK_DISPUTE",
        href: "/admin/pagamenti",
        title: "Contestazione in banca",
        detail: p.disputeProNote ? "Il professionista ha scritto la sua spiegazione" : "Il professionista non ha ancora scritto la sua spiegazione",
        who: between(p.booking.client, p.booking.professionalProfile.businessName),
        amountEurCents: p.paidEurCents || p.grossAmountEurCents,
        dueAt: p.stripeDisputeDueBy?.toISOString() ?? null,
        dueNote: "scadenza della banca",
        createdAt: (p.stripeDisputedAt ?? p.updatedAt).toISOString(),
        status: p.disputeEvidenceSentAt ? "Prove mandate" : "Prove da mandare",
        danger: false,
      });
    }
    for (const i of issues) {
      const phase = jobIssueReviewPhase({ ...i, escalatedAt: i.escalatedAt ?? i.createdAt });
      items.push({
        key: `JOB_ISSUE:${i.id}`,
        kind: "JOB_ISSUE",
        href: "/admin/problemi",
        title: i.type === "NO_SHOW" ? "Problema sul lavoro: non si è presentato" : "Problema sul lavoro: lavoro fatto male",
        detail: short(i.booking.quote?.guidedRequest.description ?? i.description),
        who: between(i.booking.client, i.booking.professionalProfile.businessName),
        amountEurCents: i.booking.jobPayment?.paidEurCents || null,
        dueAt: phase?.dueAt.toISOString() ?? null,
        dueNote: phase?.phase === "TO_DECIDE" ? "Termini: decisione entro 2 giorni" : phase?.phase === "AWAITING_INFO" ? "risposta alle informazioni" : "versione del professionista",
        createdAt: i.createdAt.toISOString(),
        status: phase?.phase === "TO_DECIDE" ? "Da decidere" : phase?.phase === "AWAITING_INFO" ? "Informazioni chieste" : "Al team",
        danger: false,
      });
    }
    for (const i of appeals) {
      items.push({
        key: `JOB_ISSUE_APPEAL:${i.id}`,
        kind: "JOB_ISSUE_APPEAL",
        href: "/admin/problemi?vista=appeals",
        title: "Ricorso su un problema accolto",
        detail: short(i.appealText),
        who: i.booking.professionalProfile.businessName,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: (i.appealedAt ?? i.createdAt).toISOString(),
        status: "Da decidere",
        danger: false,
      });
    }
    for (const r of refunds) {
      items.push({
        key: `REFUND:${r.id}`,
        kind: "REFUND",
        href: "/admin/pagamenti",
        title: "Rimborso",
        detail: short(r.reason),
        who: between(r.jobPayment.booking.client, r.jobPayment.booking.professionalProfile.businessName),
        amountEurCents: r.amountEurCents,
        dueAt: null,
        dueNote: null,
        createdAt: r.createdAt.toISOString(),
        status: "Da decidere",
        danger: false,
      });
    }
    for (const d of disputes) {
      items.push({
        key: `DISPUTE:${d.id}`,
        kind: "DISPUTE",
        href: "/admin/pagamenti",
        title: "Contestazione di pagamento",
        detail: short(d.reason),
        who: between(d.jobPayment.booking.client, d.jobPayment.booking.professionalProfile.businessName),
        amountEurCents: d.jobPayment.paidEurCents || d.jobPayment.grossAmountEurCents,
        dueAt: null,
        dueNote: null,
        createdAt: d.createdAt.toISOString(),
        status: "Da chiudere",
        danger: false,
      });
    }
    for (const p of unpaid) {
      items.push({
        key: `UNPAID_BALANCE:${p.id}`,
        kind: "UNPAID_BALANCE",
        href: "/admin/pagamenti",
        title: "Saldo non pagato",
        detail: null,
        who: between(p.booking.client, p.booking.professionalProfile.businessName),
        amountEurCents: Math.max(0, p.grossAmountEurCents - p.paidEurCents) || null,
        dueAt: null,
        dueNote: null,
        createdAt: (p.balanceUnpaidAt ?? p.updatedAt).toISOString(),
        status: "Da sollecitare",
        danger: false,
      });
    }
    for (const inv of sdi) {
      items.push({
        key: `SDI_REJECTED:${inv.id}`,
        kind: "SDI_REJECTED",
        href: "/admin/finanza",
        title: `Fattura ${inv.series ?? ""} ${inv.number ?? ""}/${inv.year ?? ""} scartata dallo SdI`.replace(/\s+/g, " "),
        detail: short(inv.sdiMessage),
        who: null,
        amountEurCents: inv.amountEurCents,
        dueAt: null,
        dueNote: null,
        createdAt: (inv.sdiSentAt ?? inv.createdAt).toISOString(),
        status: "Da correggere",
        danger: false,
      });
    }
    for (const r of reports) {
      items.push({
        key: `CONTENT_REPORT:${r.id}`,
        kind: "CONTENT_REPORT",
        href: "/admin/segnalazioni",
        title: `Segnalazione: ${r.reason}`,
        detail: short(r.details),
        who: `da ${personName(r.reporter)}`,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: r.createdAt.toISOString(),
        status: r.claimsIllegal ? "Contenuto illegale" : "Da decidere",
        danger: false,
      });
    }
    for (const r of reportAppeals) {
      items.push({
        key: `REPORT_APPEAL:${r.id}`,
        kind: "REPORT_APPEAL",
        href: "/admin/segnalazioni?vista=ricorsi",
        title: "Ricorso su una segnalazione",
        detail: short(r.appealText),
        who: null,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: (r.appealedAt ?? r.createdAt).toISOString(),
        status: "Da decidere",
        danger: false,
      });
    }
    for (const t of takeovers) {
      const safety = matchProblem(t.description).safety;
      items.push({
        key: `PROBLEM_TAKEOVER:${t.id}`,
        kind: "PROBLEM_TAKEOVER",
        href: "/admin/richieste-da-seguire",
        title: "Ce ne occupiamo noi",
        detail: short(t.description),
        who: [personName(t.user), t.city].filter(Boolean).join(" · "),
        amountEurCents: null,
        dueAt: null,
        dueNote: safety ? "possibile pericolo" : null,
        createdAt: t.createdAt.toISOString(),
        status: safety ? "Pericolo" : "Da seguire",
        danger: Boolean(safety),
      });
    }
    for (const m of messages) {
      items.push({
        key: `CONTACT_MESSAGE:${m.id}`,
        kind: "CONTACT_MESSAGE",
        href: "/admin/messaggi",
        title: m.role === "REPORT_ILLEGAL" ? "Messaggio dal sito: contenuto illegale" : "Messaggio dal sito",
        detail: short(m.content),
        who: m.email,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: m.createdAt.toISOString(),
        status: "Da rispondere",
        danger: false,
      });
    }
    for (const v of verifications) {
      items.push({
        key: `VERIFICATION:${v.id}`,
        kind: "VERIFICATION",
        href: "/admin/verifiche",
        title: "Verifica del profilo chiesta",
        detail: null,
        who: v.businessName,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: (v.verificationRequestedAt ?? new Date()).toISOString(),
        status: "Da controllare",
        danger: false,
      });
    }
    for (const z of zones) {
      items.push({
        key: `CLOSED_ZONE:${z.id}`,
        kind: "CLOSED_ZONE",
        href: "/admin/richieste-generali",
        title: `Richieste generali chiuse: ${z.category.label} a ${z.city}`,
        detail: short(z.reason),
        who: null,
        amountEurCents: null,
        dueAt: z.keepOpenUntil?.toISOString() ?? null,
        dueNote: z.keepOpenUntil ? "chiusa fino a" : null,
        createdAt: z.closedAt.toISOString(),
        status: "Chiusa",
        danger: false,
      });
    }

    const claims = items.length ? await this.prisma.adminCaseClaim.findMany({ where: { caseKey: { in: items.map((i) => i.key) } } }) : [];
    const claimers = claims.length
      ? new Map(
          (await this.prisma.user.findMany({ where: { id: { in: [...new Set(claims.map((c) => c.adminUserId))] } }, select: { id: true, name: true, surname: true, email: true } })).map((u) => [
            u.id,
            [u.name, u.surname].filter(Boolean).join(" ") || u.email,
          ]),
        )
      : new Map<string, string>();
    const claimByKey = new Map(claims.map((c) => [c.caseKey, { id: c.adminUserId, name: claimers.get(c.adminUserId) ?? "Admin" }]));

    return {
      items: sortAdminQueue(items.map((i) => ({ ...i, claimedBy: claimByKey.get(i.key) ?? null }))),
      watching: chatIssues
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((i) => ({
          key: `JOB_ISSUE:${i.id}`,
          href: "/admin/problemi?vista=chat",
          title: "Problema ancora in chat tra le parti",
          who: between(i.booking.client, i.booking.professionalProfile.businessName),
          since: i.createdAt.toISOString(),
        })),
    };
  }

  /** "Prendo io": il caso passa a questo admin, anche se l'aveva preso un altro. */
  async claim(adminUserId: string, caseKey: string): Promise<void> {
    const roles = await this.rolesOf(adminUserId);
    const kind = caseKey.split(":")[0] as AdminQueueKind;
    if (!ADMIN_QUEUE_KINDS[kind] || !adminCan(roles, ADMIN_QUEUE_KINDS[kind].scope)) throw new NotFoundException("Caso non trovato.");
    await this.prisma.adminCaseClaim.upsert({ where: { caseKey }, create: { caseKey, adminUserId }, update: { adminUserId, claimedAt: new Date() } });
  }

  /** "Lascia": il caso torna di nessuno. */
  async release(caseKey: string): Promise<void> {
    await this.prisma.adminCaseClaim.deleteMany({ where: { caseKey } });
  }

  /**
   * Ogni mattina alle 8 (ora di Roma): a chi ha preso un caso con "Prendo io"
   * che scade entro 24 ore, o è già scaduto, un avviso in campanella ed email
   * (proposta accolta da Luca il 30/10/2026). Toglie anche i "presi" dei casi
   * già chiusi, che non compaiono più in coda.
   */
  @Cron("0 8 * * *", { timeZone: "Europe/Rome" })
  async morningClaimedDue(now: Date = new Date()): Promise<number> {
    const claims = await this.prisma.adminCaseClaim.findMany({ select: { caseKey: true, adminUserId: true } });
    const admins = [...new Set(claims.map((c) => c.adminUserId))];
    let notified = 0;
    for (const adminUserId of admins) {
      const admin = await this.prisma.user.findFirst({ where: { id: adminUserId, role: "ADMIN", deletedAt: null }, select: { id: true } });
      const mine = claims.filter((c) => c.adminUserId === adminUserId).map((c) => c.caseKey);
      if (!admin) {
        await this.prisma.adminCaseClaim.deleteMany({ where: { adminUserId } });
        continue;
      }
      const { items } = await this.getQueue(adminUserId);
      const open = new Set(items.map((i) => i.key));
      const closed = mine.filter((key) => !open.has(key));
      if (closed.length) await this.prisma.adminCaseClaim.deleteMany({ where: { caseKey: { in: closed }, adminUserId } });
      const limit = now.getTime() + 24 * 3_600_000;
      const due = items.filter((i) => i.claimedBy?.id === adminUserId && i.dueAt && new Date(i.dueAt).getTime() <= limit);
      if (!due.length) continue;
      const cases = due.map((i) => ({ title: i.title, who: i.who, due: dueText(i.dueAt as string, now) }));
      await this.notificationsService.notify(adminUserId, "ADMIN_CLAIMED_CASES_DUE", { cases });
      notified += 1;
    }
    if (notified) this.logger.log(`Casi presi in scadenza: avvisati ${notified} admin.`);
    return notified;
  }
}

/** "scaduto da 3 ore" oppure "scade alle 18:00". */
function dueText(dueAt: string, now: Date): string {
  const due = new Date(dueAt);
  const diffHours = Math.round((now.getTime() - due.getTime()) / 3_600_000);
  if (due.getTime() <= now.getTime()) return diffHours < 1 ? "scaduto ora" : `scaduto da ${diffHours} ${diffHours === 1 ? "ora" : "ore"}`;
  const time = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).format(due);
  const sameDay = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short" });
  return sameDay.format(due) === sameDay.format(now) ? `scade oggi alle ${time}` : `scade domani alle ${time}`;
}

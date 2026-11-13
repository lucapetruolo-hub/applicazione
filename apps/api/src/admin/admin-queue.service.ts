import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  ADMIN_QUEUE_KINDS,
  BANK_DISPUTE_OPEN_STATUSES,
  ADMIN_SIGNAL_ADVICE_LEVEL_LABEL,
  adminCan,
  adminPersonName,
  adviseSuspiciousUser,
  jobIssueReviewPhase,
  matchProblem,
  sortAdminQueue,
  type AdminQueue,
  type AdminQueueItem,
  type AdminQueueKind,
  type AdminRoleValue,
  type AdminSignalRole,
  type AdminUserSignal,
  REVIEW_HOLD_DECISION_HOURS,
  REVIEW_HOLD_REASON_LABEL,
  type ReviewHoldReason,
} from "@professionisti/shared";
import { personLabel } from "./user-signals";
import { sdiProviderFromEnv } from "../accounting/sdi-provider";
import { stuckSdiWhere } from "../accounting/sdi-stuck";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { ScheduledJob } from "../common/scheduled-job";

type Person = { name: string | null; surname: string | null } | null;
const personName = (p: Person) => [p?.name, p?.surname].filter(Boolean).join(" ") || "Utente";
type Pro = { businessName: string; user?: Person } | null | undefined;
// Attività e persona insieme, come in ogni pagina dell'admin (misura "dopo" del riordino).
const proName = (pro: Pro) => (pro ? adminPersonName({ businessName: pro.businessName, name: pro.user?.name, surname: pro.user?.surname }) : "professionista");
const between = (client: Person, pro: Pro) => `${personName(client)} → ${proName(pro)}`;
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
      professionalProfile: { select: { businessName: true, user: { select: { name: true, surname: true } } } },
      quote: { select: { guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
    } as const;

    const now = new Date();
    const dac7Year = now.getUTCFullYear() - 1;
    const [bankDisputes, issues, appeals, refunds, disputes, unpaid, sdi, reports, reportAppeals, takeovers, messages, verifications, zones, chatIssues, suspicious, sdiStuck, dac7Periods, heldReviews] = await Promise.all([
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
        ? this.prisma.professionalProfile.findMany({ where: { verificationRequestedAt: { not: null }, verified: false, deletedAt: null, invitePendingAt: null }, select: { id: true, businessName: true, verificationRequestedAt: true, user: { select: { name: true, surname: true } } } })
        : [],
      can("CLOSED_ZONE") ? this.prisma.generalRequestBlock.findMany({ where: { reopenedAt: null }, include: { category: { select: { label: true } } } }) : [],
      can("JOB_ISSUE") ? this.prisma.jobIssue.findMany({ where: { status: "CHAT" }, include: { booking: { include: bookingInclude } } }) : [],
      can("SUSPICIOUS_ACCOUNT") ? this.prisma.suspiciousAccount.findMany({ where: { archiveReason: null }, select: { userId: true, signals: true, firstSeenAt: true } }) : [],
      // Solo con l'invio allo SdI acceso: senza, l'XML si manda a mano (docs/changelog/2026-11-02-admin-protezioni.md).
      can("SDI_STUCK") && sdiProviderFromEnv() ? this.prisma.invoice.findMany({ where: stuckSdiWhere(now), take: 50 }) : [],
      // L'anno prima da comunicare entro il 31 gennaio, e gli anni da correggere.
      can("DAC7_DUE")
        ? this.prisma.dac7ReportingPeriod.findMany({
            where: {
              quarter: null,
              OR: [{ year: dac7Year, status: { notIn: ["SUBMITTED", "CORRECTED"] }, records: { some: { considerationEurCents: { gt: 0 } } } }, { needsCorrectionAt: { not: null } }],
            },
            select: { id: true, year: true, status: true, needsCorrectionAt: true, createdAt: true },
          })
        : [],
      can("HELD_REVIEW")
        ? this.prisma.review.findMany({
            where: { heldAt: { not: null } },
            select: { id: true, rating: true, comment: true, heldAt: true, heldReasons: true, booking: { select: { clientId: true, client: { select: { name: true, surname: true } }, professionalProfile: { select: { businessName: true, user: { select: { name: true, surname: true } } } } } } },
          })
        : [],
    ]);
    // Account sospetti con qualcosa da fare (non "Nessuna azione" né "Va bene così"), con il consiglio già scritto.
    const suspiciousUsers = suspicious.length
      ? await this.prisma.user.findMany({
          // Una misura già presa (account sospeso, profilo tolto dalla ricerca) toglie il caso dalla coda subito.
          where: { id: { in: suspicious.map((row) => row.userId) }, deletedAt: null, testAccountAt: null, suspendedAt: null, NOT: { professionalProfile: { suspendedAt: { not: null } } } },
          select: { id: true, role: true, name: true, surname: true, email: true, professionalProfile: { select: { businessName: true } } },
        })
      : [];
    const suspiciousById = new Map(suspiciousUsers.map((u) => [u.id, u]));
    // Chi ha fatto ricorso su una segnalazione: l'autore del contenuto (nessuna relazione nello schema).
    const ownerIds = [...new Set(reportAppeals.map((r) => r.contentOwnerId).filter((id): id is string => Boolean(id)))];
    const owners = ownerIds.length
      ? new Map(
          (
            await this.prisma.user.findMany({
              where: { id: { in: ownerIds } },
              select: { id: true, name: true, surname: true, email: true, deletedAt: true, professionalProfile: { select: { businessName: true } } },
            })
          ).map((u) => [u.id, adminPersonName({ businessName: u.professionalProfile?.businessName, name: u.name, surname: u.surname, email: u.email, deletedAt: u.deletedAt })]),
        )
      : new Map<string, string>();

    for (const p of bankDisputes) {
      items.push({
        key: `BANK_DISPUTE:${p.id}`,
        kind: "BANK_DISPUTE",
        href: "/admin/pagamenti",
        title: "Il cliente chiede i soldi alla sua banca",
        detail: p.disputeProNote ? "Il professionista ha scritto la sua spiegazione" : "Il professionista non ha ancora scritto la sua spiegazione",
        who: between(p.booking.client, p.booking.professionalProfile),
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
        who: between(i.booking.client, i.booking.professionalProfile),
        amountEurCents: i.booking.jobPayment?.paidEurCents || null,
        dueAt: phase?.dueAt.toISOString() ?? null,
        dueNote: phase?.phase === "TO_DECIDE" ? "Da decidere entro 2 giorni" : phase?.phase === "AWAITING_INFO" ? "Aspetta le risposte alle domande" : "Aspetta la versione del professionista",
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
        title: "Chiede di rivedere un problema già deciso",
        detail: short(i.appealText),
        who: proName(i.booking.professionalProfile),
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
        who: between(r.jobPayment.booking.client, r.jobPayment.booking.professionalProfile),
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
        title: "Il cliente contesta un pagamento",
        detail: short(d.reason),
        who: between(d.jobPayment.booking.client, d.jobPayment.booking.professionalProfile),
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
        title: "Il cliente non ha pagato il resto",
        detail: null,
        who: between(p.booking.client, p.booking.professionalProfile),
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
        title: `Fattura ${inv.series ?? ""} ${inv.number ?? ""}/${inv.year ?? ""} rifiutata dall'Agenzia delle Entrate`.replace(/\s+/g, " "),
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
    for (const inv of sdiStuck) {
      const sent = inv.sdiStatus === "SENT";
      items.push({
        key: `SDI_STUCK:${inv.id}`,
        kind: "SDI_STUCK",
        href: "/admin/finanza",
        title: `Fattura ${inv.series ?? ""} ${inv.number ?? ""}/${inv.year ?? ""} non ancora arrivata all'Agenzia delle Entrate`.replace(/\s+/g, " "),
        detail: sent ? "Inviata da più di 5 giorni, nessun esito" : "Non è partita: prova con \"Rimanda\"",
        who: null,
        amountEurCents: inv.amountEurCents,
        dueAt: null,
        dueNote: null,
        createdAt: (inv.sdiSentAt ?? inv.issuedAt ?? inv.createdAt).toISOString(),
        status: sent ? "Senza esito" : "Non partita",
        danger: false,
      });
    }
    for (const period of dac7Periods) {
      const correction = period.needsCorrectionAt !== null;
      items.push({
        key: `DAC7_DUE:${period.id}`,
        kind: "DAC7_DUE",
        href: "/admin/finanza/dac7",
        title: correction ? `Guadagni ${period.year} per il fisco (DAC7): cifre cambiate dopo l'invio` : `Guadagni ${period.year} dei professionisti da mandare al fisco (DAC7)`,
        detail: correction ? "Usa \"Correggi\", poi esporta e invia la correzione" : "Esporta, invia e poi \"Segna come inviato\": parte anche l'avviso ai professionisti",
        who: null,
        amountEurCents: null,
        dueAt: correction ? null : new Date(Date.UTC(period.year + 1, 0, 31, 22, 59)).toISOString(),
        dueNote: correction ? null : "Entro il 31 gennaio",
        createdAt: (period.needsCorrectionAt ?? period.createdAt).toISOString(),
        status: correction ? "Da correggere" : "Da inviare",
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
        title: "Chiede di rivedere una segnalazione già decisa",
        detail: short(r.appealText),
        who: r.contentOwnerId ? (owners.get(r.contentOwnerId) ?? null) : null,
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
        who: proName(v),
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: (v.verificationRequestedAt ?? new Date()).toISOString(),
        status: "Da controllare",
        danger: false,
      });
    }
    // Una zona con la proposta di riaprirla in "Da approvare" non compare anche qui: si decide lì, una volta sola.
    const reopenProposed = zones.length
      ? new Set(
          (
            await this.prisma.adminProposal.findMany({
              where: { kind: "GENERAL_REQUESTS_REOPEN", OR: [{ status: "PENDING" }, { status: "SNOOZED", snoozedUntil: { lte: now } }] },
              select: { key: true },
            })
          ).map((p) => p.key.split(":")[1]),
        )
      : new Set<string>();
    for (const z of zones) {
      if (reopenProposed.has(z.id)) continue;
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

    for (const row of suspicious) {
      const user = suspiciousById.get(row.userId);
      if (!user) continue;
      const advice = adviseSuspiciousUser(user.role as AdminSignalRole, row.signals as AdminUserSignal[]);
      if (advice.level === "BASSA") continue;
      items.push({
        key: `SUSPICIOUS_ACCOUNT:${user.id}`,
        kind: "SUSPICIOUS_ACCOUNT",
        href: `/admin/utenti/${user.id}?scheda=${advice.tab}`,
        title: `Account sospetto: ${personLabel(user)}`,
        detail: short(advice.text, 160),
        who: null,
        amountEurCents: null,
        dueAt: null,
        dueNote: null,
        createdAt: row.firstSeenAt.toISOString(),
        status: ADMIN_SIGNAL_ADVICE_LEVEL_LABEL[advice.level],
        danger: false,
      });
    }

    // Recensioni in controllo (collaudo P-01): si decidono dalla scheda di chi le ha scritte.
    for (const r of heldReviews) {
      const heldAt = r.heldAt ?? new Date();
      items.push({
        key: `HELD_REVIEW:${r.id}`,
        kind: "HELD_REVIEW",
        href: `/admin/utenti/${r.booking.clientId}?scheda=recensioni`,
        title: `Recensione ${r.rating}★ da controllare`,
        detail: short([r.heldReasons.map((reason) => REVIEW_HOLD_REASON_LABEL[reason as ReviewHoldReason] ?? reason).join("; "), r.comment].filter(Boolean).join(" · "), 160),
        who: between(r.booking.client, r.booking.professionalProfile),
        amountEurCents: null,
        dueAt: new Date(heldAt.getTime() + REVIEW_HOLD_DECISION_HOURS * 60 * 60 * 1000).toISOString(),
        dueNote: "il cliente aspetta la pubblicazione",
        createdAt: heldAt.toISOString(),
        status: "Da pubblicare o nascondere",
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
          who: between(i.booking.client, i.booking.professionalProfile),
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
  @ScheduledJob("0 8 * * *", { timeZone: "Europe/Rome" })
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

import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  ADMIN_PROPOSAL_KINDS_INFO,
  ADMIN_PROPOSAL_SNOOZE_DAYS,
  ADMIN_PROPOSALS_VISIBLE,
  adminCan,
  generalRequestCloseDecision,
  type AdminProposal,
  type AdminProposalAction,
  type AdminProposalDecision,
  type AdminProposalKind,
  type AdminProposalList,
  type AdminProposalPreview,
  type AdminProposalRestore,
  type AdminRejectedProposal,
  type AdminRoleValue,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CategoriesService } from "../categories/categories.service";
import { AdminService } from "../admin/admin.service";
import { ProblemExamplesService } from "../problem-match/problem-examples.service";
import { ProblemMatchAdminService } from "../problem-match/problem-match-admin.service";
import { GeneralRequestsService } from "../general-requests/general-requests.service";
import { IdentityVerificationService } from "../identity-verification/identity-verification.service";
import { EMPTY_EMAIL_CONTEXT, notificationEmail } from "../email/templates/notification-emails";
import { launchDate } from "../subscriptions/subscription-rules";
import { stripEmailMarkdown } from "./email-text";
import {
  PAUSE_GAP_DAYS,
  PAUSE_WINDOW_DAYS,
  PROFILE_REMINDER_GAP_DAYS,
  PROFILE_REMINDER_MAX_DAYS,
  PROFILE_REMINDER_MIN_DAYS,
  categoryLabel,
  dictionaryWordCandidates,
  serviceWordCandidates,
  groupKey,
  mergeCandidates,
  missingExamplePhrases,
  silentProfessionals,
  standardServiceCandidates,
  testAccountsProposalDue,
  wordStem,
} from "./admin-proposals";
import { ScheduledJob } from "../common/scheduled-job";

const DAY_MS = 24 * 60 * 60_000;
/** Una proposta già approvata torna solo se dopo tanti giorni vale di nuovo (es. una frase tolta a mano). */
const REPROPOSE_AFTER_DAYS = 30;
/** Proposte con "No, mai" mostrate in Andamento (le più recenti). */
const REJECTED_SHOWN = 50;
/** Persone elencate al massimo in una proposta di email (le altre alla prossima). */
const MAX_RECIPIENTS = 20;

/** Una proposta appena calcolata, prima di salvarla. */
type Candidate = {
  key: string;
  kind: AdminProposalKind;
  score: number;
  title: string;
  why: string;
  preview: AdminProposalPreview;
  /** Dati per eseguirla. */
  data: Record<string, unknown>;
  /** Persone coinvolte: chi ha già una proposta rifiutata o rimandata non torna in un'altra. */
  people?: string[];
};

type StoredPayload = Omit<Candidate, "key" | "kind" | "score">;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Proposte da approvare in Admin (richiesta di Luca,
 * docs/changelog/2026-11-03-automazioni-admin.md). Ogni notte si calcolano
 * le modifiche pronte; "Approva" ricontrolla che valgano ancora e chiama il
 * servizio del pulsante a mano (stesso permesso, stesso registro azioni).
 */
@Injectable()
export class AdminProposalsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminProposalsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
    private readonly categoriesService: CategoriesService,
    private readonly adminService: AdminService,
    private readonly problemExamplesService: ProblemExamplesService,
    private readonly problemMatchAdminService: ProblemMatchAdminService,
    private readonly generalRequestsService: GeneralRequestsService,
    private readonly identityVerificationService: IdentityVerificationService,
  ) {}

  /** All'avvio (Render riparte spesso): un calcolo poco dopo, per non lasciare la Home vuota fino a notte. */
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    setTimeout(() => void this.refresh().catch((err: unknown) => this.logger.warn(`Proposte non calcolate all'avvio: ${String(err)}`)), 60_000).unref();
  }

  // -------------------------------------------------------------------------
  // Elenco e decisioni
  // -------------------------------------------------------------------------

  private async rolesOf(adminUserId: string): Promise<AdminRoleValue[]> {
    const user = await this.prisma.user.findUnique({ where: { id: adminUserId }, select: { adminRoles: true } });
    return (user?.adminRoles ?? []) as AdminRoleValue[];
  }

  async list(adminUserId: string, now: Date = new Date()): Promise<AdminProposalList> {
    const roles = await this.rolesOf(adminUserId);
    const rows = await this.prisma.adminProposal.findMany({
      where: { OR: [{ status: "PENDING" }, { status: "SNOOZED", snoozedUntil: { lte: now } }] },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
    });
    const allowed = rows.filter((row) => row.kind in ADMIN_PROPOSAL_KINDS_INFO && adminCan(roles, ADMIN_PROPOSAL_KINDS_INFO[row.kind as AdminProposalKind].scope));
    return { total: allowed.length, items: allowed.slice(0, ADMIN_PROPOSALS_VISIBLE).map(toView) };
  }

  /** Le proposte fermate con "No, mai" che questo admin può rimettere in Da approvare. */
  async listRejected(adminUserId: string): Promise<AdminRejectedProposal[]> {
    const roles = await this.rolesOf(adminUserId);
    const rows = await this.prisma.adminProposal.findMany({ where: { status: "REJECTED" }, orderBy: { decidedAt: "desc" }, take: REJECTED_SHOWN * 2 });
    const allowed = rows
      .filter((row) => row.kind in ADMIN_PROPOSAL_KINDS_INFO && adminCan(roles, ADMIN_PROPOSAL_KINDS_INFO[row.kind as AdminProposalKind].scope))
      .slice(0, REJECTED_SHOWN);
    const adminIds = [...new Set(allowed.map((row) => row.decidedById).filter((id): id is string => Boolean(id)))];
    const admins = adminIds.length ? await this.prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, surname: true, email: true } }) : [];
    const nameOf = new Map(admins.map((a) => [a.id, [a.name, a.surname].filter(Boolean).join(" ") || a.email || "Admin"]));
    return allowed.map((row) => ({
      id: row.id,
      kind: row.kind as AdminProposalKind,
      title: (row.payload as unknown as StoredPayload).title,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decidedBy: row.decidedById ? (nameOf.get(row.decidedById) ?? null) : null,
    }));
  }

  /**
   * "Riproponi" su un "No, mai": il no si toglie e la proposta si ricalcola
   * come di notte. Torna in Da approvare solo se vale ancora (con i dati di oggi).
   */
  async restore(adminUserId: string, id: string, now: Date = new Date()): Promise<AdminProposalRestore> {
    const row = await this.prisma.adminProposal.findUnique({ where: { id } });
    if (!row || !(row.kind in ADMIN_PROPOSAL_KINDS_INFO)) throw new NotFoundException("Proposta non trovata.");
    const kind = row.kind as AdminProposalKind;
    if (!adminCan(await this.rolesOf(adminUserId), ADMIN_PROPOSAL_KINDS_INFO[kind].scope)) throw new ForbiddenException("Non hai il permesso per questa proposta.");
    const removed = await this.prisma.adminProposal.deleteMany({ where: { id, status: "REJECTED" } });
    if (removed.count === 0) throw new ConflictException("Questa proposta è già stata riproposta.");
    const title = (row.payload as unknown as StoredPayload).title;
    await this.auditLogService.record({
      entityType: "AdminProposal",
      entityId: row.key,
      fieldName: "status",
      oldValue: "REJECTED",
      newValue: "RESTORED",
      changedByUserId: adminUserId,
      reason: `Proposta riproposta: ${title}`,
    });
    const candidates = await this.candidatesFor(kind, now);
    await this.save(candidates, now);
    await this.dropStale(candidates, now, kind);
    // Per le email il gruppo può essere cambiato: conta che ci sia di nuovo una proposta di quel tipo.
    const back = candidates.some((c) => c.key === row.key || (c.people && (row.payload as unknown as StoredPayload).people?.some((p) => c.people?.includes(p))));
    return { back: Boolean(back) };
  }

  async decide(adminUserId: string, id: string, action: AdminProposalAction, now: Date = new Date()): Promise<AdminProposalDecision> {
    const row = await this.prisma.adminProposal.findUnique({ where: { id } });
    if (!row || !(row.kind in ADMIN_PROPOSAL_KINDS_INFO)) throw new NotFoundException("Proposta non trovata.");
    const kind = row.kind as AdminProposalKind;
    const info = ADMIN_PROPOSAL_KINDS_INFO[kind];
    if (!adminCan(await this.rolesOf(adminUserId), info.scope)) throw new ForbiddenException("Non hai il permesso per questa proposta.");
    const open = row.status === "PENDING" || (row.status === "SNOOZED" && (!row.snoozedUntil || row.snoozedUntil <= now));
    if (!open) throw new ConflictException("Un altro admin ha già deciso questa proposta.");
    const stored = row.payload as unknown as StoredPayload;

    if (action !== "approve") {
      const status = action === "snooze" ? "SNOOZED" : "REJECTED";
      await this.prisma.adminProposal.update({
        where: { id },
        data: { status, snoozedUntil: action === "snooze" ? new Date(now.getTime() + ADMIN_PROPOSAL_SNOOZE_DAYS * DAY_MS) : null, decidedAt: now, decidedById: adminUserId },
      });
      await this.auditLogService.record({
        entityType: "AdminProposal",
        entityId: row.key,
        fieldName: "status",
        newValue: status,
        changedByUserId: adminUserId,
        reason: `${action === "snooze" ? "Proposta rimandata" : "Proposta rifiutata"}: ${stored.title}`,
      });
      return { status, result: null };
    }

    // Prima di tutto la si prende (un secondo clic, o un altro admin, non la esegue due volte).
    const claimed = await this.prisma.adminProposal.updateMany({ where: { id, status: row.status, updatedAt: row.updatedAt }, data: { status: "APPROVING" } });
    if (claimed.count === 0) throw new ConflictException("Un altro admin ha già deciso questa proposta.");
    try {
      // Vale ancora? Si ricalcola come di notte: se non c'è più, non si esegue.
      const candidates = await this.candidatesFor(kind, now);
      const fresh = candidates.find((c) => c.key === row.key);
      if (!fresh) {
        // Es. un professionista in più nella lista: la proposta nuova prende subito il suo posto.
        await this.prisma.adminProposal.delete({ where: { id } });
        await this.save(candidates, now);
        // Le email e gli account vanno a un gruppo di persone: cambiato il gruppo, la proposta è nuova.
        const replaced = candidates.some((c) => c.people);
        throw new ConflictException(
          replaced ? "Nel frattempo la lista è cambiata: ricontrolla la proposta aggiornata." : "Non serve più: nel frattempo è cambiato qualcosa. La proposta è stata tolta.",
        );
      }
      const result = await this.execute(adminUserId, fresh);
      await this.prisma.adminProposal.update({
        where: { id },
        data: { status: "APPROVED", decidedAt: now, decidedById: adminUserId, result, payload: toPayload(fresh), snoozedUntil: null },
      });
      await this.auditLogService.record({
        entityType: "AdminProposal",
        entityId: row.key,
        fieldName: "status",
        newValue: "APPROVED",
        changedByUserId: adminUserId,
        reason: `Proposta approvata: ${fresh.title}${result ? ` (${result})` : ""}`,
      });
      return { status: "APPROVED", result };
    } catch (err) {
      // Non riuscita: torna com'era, l'admin vede il motivo.
      await this.prisma.adminProposal.updateMany({ where: { id, status: "APPROVING" }, data: { status: row.status } });
      throw err;
    }
  }

  /** Esegue con il servizio del pulsante a mano. Restituisce cosa è successo, se serve dirlo. */
  private async execute(adminUserId: string, c: Candidate): Promise<string | null> {
    const d = c.data;
    switch (c.kind) {
      case "EXAMPLE_PHRASE":
        await this.problemExamplesService.add(adminUserId, String(d.text));
        return null;
      case "DICTIONARY_WORD":
      case "DICTIONARY_SERVICE_WORD":
        await this.problemMatchAdminService.teachWord(adminUserId, {
          word: String(d.word),
          categorySlug: String(d.categorySlug),
          ...(d.serviceName ? { serviceName: String(d.serviceName) } : {}),
        });
        return null;
      case "STANDARD_SERVICE":
        await this.problemMatchAdminService.addStandardService(adminUserId, { categorySlug: String(d.categorySlug), name: String(d.name) });
        return null;
      case "MERGE_SERVICE_NAME":
        await this.problemMatchAdminService.mergeServiceName(adminUserId, { name: String(d.name), canonical: String(d.canonical) });
        return null;
      case "GENERAL_REQUESTS_REOPEN":
        await this.generalRequestsService.reopen(adminUserId, String(d.blockId));
        return null;
      case "GENERAL_REQUESTS_CLOSE":
        await this.generalRequestsService.close(adminUserId, String(d.categorySlug), String(d.city), `proposta approvata in Admin. ${String(d.reason)}`);
        return null;
      case "PROFILE_REMINDER": {
        const ids = (d.profileIds as string[]) ?? [];
        let sent = 0;
        for (const profileId of ids) if (await this.identityVerificationService.sendSetupReminder(profileId)) sent += 1;
        return sentLabel(sent, ids.length);
      }
      case "PAUSE_SUGGESTION": {
        const recipients = (d.recipients as { userId: string; requests: number }[]) ?? [];
        for (const r of recipients) await this.notificationsService.notify(r.userId, "AWAY_SUGGESTED", { requests: r.requests });
        return sentLabel(recipients.length, recipients.length);
      }
      case "TEST_ACCOUNTS": {
        const ids = (d.userIds as string[]) ?? [];
        const failed: string[] = [];
        for (const userId of ids) {
          try {
            await this.adminService.deleteTestAccount(adminUserId, userId);
          } catch (err) {
            failed.push(err instanceof Error ? err.message : String(err));
          }
        }
        const done = ids.length - failed.length;
        return failed.length === 0
          ? `${plural(done, "account eliminato", "account eliminati")}`
          : `${plural(done, "account eliminato", "account eliminati")}, ${failed.length} no: ${[...new Set(failed)].join(" ")}`;
      }
    }
    throw new NotFoundException("Proposta sconosciuta.");
  }

  // -------------------------------------------------------------------------
  // Calcolo
  // -------------------------------------------------------------------------

  /** Ogni notte alle 4:20, dopo gli altri controlli notturni. */
  @ScheduledJob("20 4 * * *", { timeZone: "Europe/Rome" })
  async nightly(): Promise<void> {
    await this.refresh();
  }

  /** Ricalcola tutte le proposte: nuove in attesa, quelle che non valgono più tolte. */
  async refresh(now: Date = new Date()): Promise<number> {
    const candidates: Candidate[] = [];
    for (const kind of Object.keys(ADMIN_PROPOSAL_KINDS_INFO) as AdminProposalKind[]) {
      try {
        candidates.push(...(await this.candidatesFor(kind, now)));
      } catch (err) {
        // Un tipo che non si calcola non ferma gli altri.
        this.logger.warn(`Proposte ${kind} non calcolate: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await this.save(candidates, now);
    await this.dropStale(candidates, now);
    return candidates.length;
  }

  /**
   * In attesa ma non più valide (es. la frase l'ha aggiunta un altro admin a
   * mano): via. Una proposta a un gruppo di persone rimandata con "Non ora"
   * resta fino alla scadenza: le sue persone sono escluse dal calcolo, quindi
   * non è mai tra le calcolate, e toglierla le farebbe tornare la notte dopo.
   */
  private async dropStale(candidates: Candidate[], now: Date, kind?: AdminProposalKind): Promise<void> {
    const stale = await this.prisma.adminProposal.findMany({
      where: { ...(kind ? { kind } : {}), status: { in: ["PENDING", "SNOOZED"] }, key: { notIn: candidates.map((c) => c.key) } },
      select: { id: true, status: true, snoozedUntil: true, payload: true },
    });
    const ids = stale
      .filter((row) => !(row.status === "SNOOZED" && row.snoozedUntil && row.snoozedUntil > now && (row.payload as unknown as StoredPayload).people?.length))
      .map((row) => row.id);
    if (ids.length) await this.prisma.adminProposal.deleteMany({ where: { id: { in: ids } } });
  }

  /** Salva le proposte calcolate: nuove in attesa, aggiornate le altre; "No, mai" non torna. */
  private async save(candidates: Candidate[], now: Date): Promise<void> {
    const existing = await this.prisma.adminProposal.findMany({ where: { key: { in: candidates.map((c) => c.key) } } });
    const byKey = new Map(existing.map((row) => [row.key, row]));
    for (const c of candidates) {
      const row = byKey.get(c.key);
      if (!row) {
        await this.prisma.adminProposal.create({ data: { key: c.key, kind: c.kind, score: c.score, payload: toPayload(c) } });
      } else if (row.status === "PENDING" || row.status === "SNOOZED") {
        await this.prisma.adminProposal.update({ where: { id: row.id }, data: { score: c.score, payload: toPayload(c) } });
      } else if (row.status === "APPROVED" && row.decidedAt && now.getTime() - row.decidedAt.getTime() > REPROPOSE_AFTER_DAYS * DAY_MS) {
        await this.prisma.adminProposal.update({ where: { id: row.id }, data: { status: "PENDING", score: c.score, payload: toPayload(c), decidedAt: null, decidedById: null, result: null } });
      }
      // REJECTED ("No, mai"): non torna più.
    }
  }

  /** Persone già in una proposta dello stesso tipo rifiutata o rimandata: non tornano in un'altra. */
  private async excludedPeople(kind: AdminProposalKind, now: Date): Promise<Set<string>> {
    const rows = await this.prisma.adminProposal.findMany({
      where: { kind, OR: [{ status: "REJECTED" }, { status: "SNOOZED", snoozedUntil: { gt: now } }] },
      select: { payload: true },
    });
    return new Set(rows.flatMap((row) => ((row.payload as unknown as StoredPayload).people as string[] | undefined) ?? []));
  }

  async candidatesFor(kind: AdminProposalKind, now: Date): Promise<Candidate[]> {
    switch (kind) {
      case "EXAMPLE_PHRASE":
        return this.examplePhrases();
      case "DICTIONARY_WORD":
        return this.dictionaryWords();
      case "DICTIONARY_SERVICE_WORD":
        return this.serviceWords();
      case "STANDARD_SERVICE":
        return this.standardServices();
      case "MERGE_SERVICE_NAME":
        return this.mergeServiceNames();
      case "PROFILE_REMINDER":
        return this.profileReminders(now);
      case "PAUSE_SUGGESTION":
        return this.pauseSuggestions(now);
      case "TEST_ACCOUNTS":
        return this.testAccounts(now);
      case "GENERAL_REQUESTS_REOPEN":
      case "GENERAL_REQUESTS_CLOSE":
        return (await this.generalRequests()).filter((c) => c.kind === kind);
    }
    return [];
  }

  private async examplePhrases(): Promise<Candidate[]> {
    const [{ examples }, popularity] = await Promise.all([this.problemExamplesService.adminList(), this.categoriesService.getPopularity().catch(() => null)]);
    return missingExamplePhrases(examples, popularity?.counts ?? []).map((p) => {
      const label = categoryLabel(p.categorySlug);
      return {
        key: `EXAMPLE_PHRASE:${p.categorySlug}`,
        kind: "EXAMPLE_PHRASE",
        score: 400 + Math.min(p.searches, 99),
        title: `Frase d'esempio per ${label}`,
        why:
          p.searches > 0
            ? `${label} non ha nessuna frase d'esempio sotto la ricerca, ma negli ultimi mesi è stato cercato o richiesto ${plural(p.searches, "volta", "volte")}.`
            : `${label} non ha nessuna frase d'esempio sotto la ricerca: chi lo cerca non ha un esempio da toccare.`,
        preview: { type: "lines", lines: [`In home, sotto la ricerca: «${p.text}»`, `Toccandola, il sito propone: ${label}`] },
        data: { text: p.text, categorySlug: p.categorySlug },
      };
    });
  }

  private async dictionaryWords(): Promise<Candidate[]> {
    const [rows, taught] = await Promise.all([
      this.prisma.problemDescription.findMany({ select: { text: true, categories: true, source: true, outOfService: true, service: true } }),
      this.prisma.problemWord.findMany({ select: { word: true } }),
    ]);
    return dictionaryWordCandidates(rows, taught.map((t) => t.word))
      .slice(0, 5)
      .map((w) => {
        const label = categoryLabel(w.categorySlug);
        return {
          key: `DICTIONARY_WORD:${w.stem}`,
          kind: "DICTIONARY_WORD",
          score: 500 + Math.min(w.aiAnswers, 99),
          title: `Insegna «${w.example}» al dizionario`,
          why: `Il dizionario non conosce questa parola: l'intelligenza artificiale l'ha capita ${plural(w.aiAnswers, "volta", "volte")}, sempre come ${label}. Insegnandola, la risposta arriva subito, senza aspettare l'intelligenza artificiale.`,
          preview: {
            type: "lines",
            lines: [
              `Chi scrive «${w.example}» (o una parola che inizia con «${w.stem}») trova subito: ${label}${w.service ? `, prima chi fa «${w.service}»` : ""}`,
              "Gli avvisi di sicurezza (gas, corrente) restano quelli del dizionario.",
            ],
          },
          data: { word: wordStem(w.stem), categorySlug: w.categorySlug, ...(w.service ? { serviceName: w.service } : {}) },
        };
      });
  }

  /** Parole che il dizionario già capisce, da legare a una prestazione (docs/changelog/2026-11-06-dizionario-prestazioni.md). */
  private async serviceWords(): Promise<Candidate[]> {
    const [rows, taught] = await Promise.all([
      this.prisma.problemDescription.findMany({
        where: { source: "ia", service: { not: null } },
        select: { text: true, categories: true, source: true, outOfService: true, service: true },
      }),
      this.prisma.problemWord.findMany({ select: { word: true, serviceName: true } }),
    ]);
    return serviceWordCandidates(rows, taught)
      .slice(0, 5)
      .map((w) => {
        const label = categoryLabel(w.categorySlug);
        return {
          key: `DICTIONARY_SERVICE_WORD:${w.stem}`,
          kind: "DICTIONARY_SERVICE_WORD",
          score: 480 + Math.min(w.aiAnswers, 99),
          title: `Lega «${w.example}» a «${w.service}»`,
          why: `Il dizionario porta già questa parola a ${label}. L'intelligenza artificiale l'ha legata ${plural(w.aiAnswers, "volta", "volte")} sempre alla stessa prestazione. Insegnandola, chi la offre va per primo senza aspettare l'intelligenza artificiale.`,
          preview: {
            type: "lines",
            lines: [`Chi scrive «${w.example}» (o una parola che inizia con «${w.stem}») trova ${label}, prima chi fa «${w.service}»`, "Gli avvisi di sicurezza (gas, corrente) restano quelli del dizionario."],
          },
          data: { word: wordStem(w.stem), categorySlug: w.categorySlug, serviceName: w.service },
        };
      });
  }

  private async standardServices(): Promise<Candidate[]> {
    const overview = await this.problemMatchAdminService.handwrittenServices();
    return standardServiceCandidates(overview)
      .slice(0, 5)
      .map((s) => {
        const label = categoryLabel(s.categorySlug);
        return {
          key: `STANDARD_SERVICE:${s.categorySlug}:${s.name.toLocaleLowerCase("it")}`,
          kind: "STANDARD_SERVICE",
          score: 300 + Math.min(s.professionals, 99),
          title: `«${s.name}» tra le prestazioni suggerite di ${label}`,
          why: `L'hanno scritta a mano ${s.professionals} professionisti, ma il sito non la propone.`,
          preview: { type: "lines", lines: [`In iscrizione e nel profilo di ${label}, «${s.name}» si sceglie con un clic.`, "I prezzi medi di «Quanto costa» si sommano bene."] },
          data: { categorySlug: s.categorySlug, name: s.name },
        };
      });
  }

  private async mergeServiceNames(): Promise<Candidate[]> {
    const overview = await this.problemMatchAdminService.handwrittenServices();
    return mergeCandidates(overview)
      .slice(0, 5)
      .map((m) => ({
        key: `MERGE_SERVICE_NAME:${m.name.toLocaleLowerCase("it")}`,
        kind: "MERGE_SERVICE_NAME",
        score: 200 + Math.min(m.professionals, 99),
        title: `Unisci «${m.name}» a «${m.canonical}»`,
        why: m.byWords
          ? `Parole diverse, stesso lavoro (${categoryLabel(m.categorySlug)}): unite, chi l'ha scritta va in cima quando un cliente cerca «${m.canonical}».`
          : `Sono quasi lo stesso nome (${categoryLabel(m.categorySlug)}): separati, i prezzi medi di «Quanto costa» si dividono.`,
        preview: { type: "lines", lines: [`«${m.name}» (${plural(m.professionals, "professionista", "professionisti")}) diventa «${m.canonical}».`, "Il nome scritto dai professionisti nel loro profilo non cambia."] },
        data: { name: m.name, canonical: m.canonical },
      }));
  }

  private async profileReminders(now: Date): Promise<Candidate[]> {
    const excluded = await this.excludedPeople("PROFILE_REMINDER", now);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        isDemo: false,
        deletedAt: null,
        invitePendingAt: null,
        suspendedAt: null,
        user: { suspendedAt: null, deletedAt: null, testAccountAt: null },
        createdAt: { lte: new Date(now.getTime() - PROFILE_REMINDER_MIN_DAYS * DAY_MS), gt: new Date(now.getTime() - PROFILE_REMINDER_MAX_DAYS * DAY_MS) },
      },
      select: { id: true, userId: true, createdAt: true, businessName: true, user: { select: { name: true, surname: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    const recent = await this.prisma.notification.findMany({
      where: { type: "PROFILE_SETUP_REMINDER", userId: { in: profiles.map((p) => p.userId) }, createdAt: { gt: new Date(now.getTime() - PROFILE_REMINDER_GAP_DAYS * DAY_MS) } },
      select: { userId: true },
    });
    const recentUsers = new Set(recent.map((r) => r.userId));
    const eligible = profiles.filter((p) => !recentUsers.has(p.userId) && !excluded.has(p.id));
    const missing = await this.identityVerificationService.setupMissing(eligible.map((p) => p.id));
    const list = eligible.filter((p) => (missing.get(p.id) ?? []).length > 0).slice(0, MAX_RECIPIENTS);
    if (list.length === 0) return [];
    const first = list[0]!;
    const missingLabel: Record<string, string> = { CARD: "la carta dei mesi gratis", SEARCH: "i dati fiscali", QUOTES: "la verifica dell'identità", ONLINE_PAYMENTS: "i pagamenti online" };
    const ids = list.map((p) => p.id);
    return [
      {
        key: `PROFILE_REMINDER:${groupKey(ids)}`,
        kind: "PROFILE_REMINDER",
        score: 700 + list.length,
        title: `Email «Completa il profilo» a ${plural(list.length, "professionista", "professionisti")}`,
        why: `Iscritti da più di ${PROFILE_REMINDER_MIN_DAYS} giorni, hanno già avuto le due email automatiche e non hanno finito.`,
        preview: emailPreview(
          "PROFILE_SETUP_REMINDER",
          { missing: missing.get(first.id) ?? [] },
          personName(first),
          list.map((p) => ({
            label: personName(p),
            detail: `Manca: ${(missing.get(p.id) ?? []).map((m) => missingLabel[m] ?? m).join(", ")} · iscritto da ${Math.floor((now.getTime() - p.createdAt.getTime()) / DAY_MS)} giorni`,
            href: `/admin/utenti/${p.userId}`,
          })),
        ),
        data: { profileIds: ids },
        people: ids,
      },
    ];
  }

  private async pauseSuggestions(now: Date): Promise<Candidate[]> {
    const since = new Date(now.getTime() - PAUSE_WINDOW_DAYS * DAY_MS);
    const leads = await this.prisma.lead.findMany({
      where: {
        createdAt: { gte: since },
        professionalProfile: {
          isDemo: false,
          deletedAt: null,
          suspendedAt: null,
          pausedAt: null,
          OR: [{ awayUntil: null }, { awayUntil: { lte: now } }],
          user: { suspendedAt: null, deletedAt: null, testAccountAt: null },
        },
      },
      select: { professionalProfileId: true, guidedRequestId: true, status: true, hiddenByProfessionalAt: true },
    });
    const requestIds = [...new Set(leads.map((l) => l.guidedRequestId))];
    const [quotes, messages] = requestIds.length
      ? await Promise.all([
          this.prisma.quote.findMany({ where: { guidedRequestId: { in: requestIds } }, select: { guidedRequestId: true, professionalProfileId: true } }),
          this.prisma.conversationEvent.findMany({
            where: { guidedRequestId: { in: requestIds }, actor: "PROFESSIONAL", automatic: false },
            select: { guidedRequestId: true, professionalProfileId: true },
          }),
        ])
      : [[], []];
    const answered = new Set([...quotes, ...messages].map((r) => `${r.guidedRequestId}|${r.professionalProfileId}`));
    const silent = silentProfessionals(
      leads.map((l) => ({ professionalProfileId: l.professionalProfileId, guidedRequestId: l.guidedRequestId, status: l.status, hidden: !!l.hiddenByProfessionalAt })),
      answered,
    );
    if (silent.size === 0) return [];
    const excluded = await this.excludedPeople("PAUSE_SUGGESTION", now);
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { id: { in: [...silent.keys()].filter((id) => !excluded.has(id)) } },
      select: { id: true, userId: true, businessName: true, user: { select: { name: true, surname: true, email: true } } },
    });
    const recent = await this.prisma.notification.findMany({
      where: { type: "AWAY_SUGGESTED", userId: { in: profiles.map((p) => p.userId) }, createdAt: { gt: new Date(now.getTime() - PAUSE_GAP_DAYS * DAY_MS) } },
      select: { userId: true },
    });
    const recentUsers = new Set(recent.map((r) => r.userId));
    const list = profiles
      .filter((p) => !recentUsers.has(p.userId))
      .sort((a, b) => (silent.get(b.id) ?? 0) - (silent.get(a.id) ?? 0) || personName(a).localeCompare(personName(b), "it"))
      .slice(0, MAX_RECIPIENTS);
    if (list.length === 0) return [];
    const ids = list.map((p) => p.id);
    const first = list[0]!;
    return [
      {
        key: `PAUSE_SUGGESTION:${groupKey(ids)}`,
        kind: "PAUSE_SUGGESTION",
        score: 800 + list.length,
        title: `Consiglia la pausa a ${plural(list.length, "professionista", "professionisti")}`,
        why: `Negli ultimi ${PAUSE_WINDOW_DAYS} giorni hanno ricevuto almeno 3 richieste e non ne hanno aperta nessuna: i clienti aspettano chi non risponde.`,
        preview: emailPreview(
          "AWAY_SUGGESTED",
          { requests: silent.get(first.id) ?? 0 },
          personName(first),
          list.map((p) => ({ label: personName(p), detail: `${plural(silent.get(p.id) ?? 0, "richiesta", "richieste")} senza risposta`, href: `/admin/utenti/${p.userId}` })),
        ),
        data: { recipients: list.map((p) => ({ userId: p.userId, requests: silent.get(p.id) ?? 0 })) },
        people: ids,
      },
    ];
  }

  private async testAccounts(now: Date): Promise<Candidate[]> {
    const launch = launchDate();
    if (!testAccountsProposalDue(now, launch)) return [];
    const excluded = await this.excludedPeople("TEST_ACCOUNTS", now);
    const users = await this.prisma.user.findMany({
      where: { testAccountAt: { not: null }, deletedAt: null, role: { not: "ADMIN" } },
      select: { id: true, name: true, surname: true, email: true, role: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const list = users.filter((u) => !excluded.has(u.id));
    if (list.length === 0) return [];
    const ids = list.map((u) => u.id);
    const launched = launch && now >= launch;
    return [
      {
        key: `TEST_ACCOUNTS:${groupKey(ids)}`,
        kind: "TEST_ACCOUNTS",
        score: launched ? 900 : 100,
        title: `Elimina ${plural(list.length, "account di prova", "account di prova")}`,
        why: launched ? "Il sito è aperto: gli account usati per provarlo vanno tolti." : "Manca meno di una settimana al lancio: gli account usati per provare il sito vanno tolti.",
        preview: {
          type: "lines",
          lines: [
            "Si eliminano per sempre, con tutto quello che hanno creato. Non si può annullare.",
            "Un account con pagamenti online veri non si elimina: lo dice dopo.",
            ...list.map((u) => `${[u.name, u.surname].filter(Boolean).join(" ") || "Senza nome"} · ${u.email ?? "senza email"} · ${u.role === "PROFESSIONAL" ? "professionista" : "cliente"}`),
          ],
        },
        data: { userIds: ids },
        people: ids,
      },
    ];
  }

  private async generalRequests(): Promise<Candidate[]> {
    const overview = await this.generalRequestsService.adminOverview();
    const result: Candidate[] = [];
    for (const row of overview.rows) {
      if (row.block?.reopenSuggestion) {
        result.push({
          key: `GENERAL_REQUESTS_REOPEN:${row.block.id}:${row.block.closedAt.slice(0, 10)}`,
          kind: "GENERAL_REQUESTS_REOPEN",
          score: 900,
          title: `Riapri le richieste generali: ${row.categoryLabel} a ${row.city}`,
          why: row.block.reopenSuggestion,
          preview: {
            type: "lines",
            lines: [`Chi chiede un preventivo per ${row.categoryLabel.toLowerCase()} a ${row.city} senza scegliere un professionista lo manda di nuovo a tutti quelli della zona.`, `Chiusa dal ${formatDay(row.block.closedAt)}: ${row.block.reason}`],
          },
          data: { blockId: row.block.id },
        });
      } else if (!row.block && !overview.thresholds.autoCloseEnabled) {
        // Chiusura automatica spenta in Richieste generali: la stessa regola diventa una proposta.
        const decision = generalRequestCloseDecision(row.load, { ...overview.thresholds, autoCloseEnabled: true });
        if (!decision) continue;
        result.push({
          key: `GENERAL_REQUESTS_CLOSE:${row.categorySlug}:${row.city.toLocaleLowerCase("it")}`,
          kind: "GENERAL_REQUESTS_CLOSE",
          score: 850,
          title: `Chiudi le richieste generali: ${row.categoryLabel} a ${row.city}`,
          why: decision.reason,
          preview: {
            type: "lines",
            lines: [
              `Chi chiede un preventivo per ${row.categoryLabel.toLowerCase()} a ${row.city} dovrà scegliere uno o più professionisti: non arriva più a tutti.`,
              "Gli altri mestieri e le altre città non cambiano.",
            ],
          },
          data: { categorySlug: row.categorySlug, city: row.city, reason: decision.reason },
        });
      }
    }
    return result;
  }
}

function toPayload(c: Candidate): Prisma.InputJsonValue {
  const payload: StoredPayload = { title: c.title, why: c.why, preview: c.preview, data: c.data, ...(c.people ? { people: c.people } : {}) };
  return payload as unknown as Prisma.InputJsonValue;
}

function toView(row: { id: string; kind: string; payload: unknown; createdAt: Date }): AdminProposal {
  const p = row.payload as StoredPayload;
  const kind = row.kind as AdminProposalKind;
  return {
    id: row.id,
    kind,
    title: p.title,
    why: p.why,
    preview: p.preview,
    irreversible: ADMIN_PROPOSAL_KINDS_INFO[kind].undo === null,
    createdAt: row.createdAt.toISOString(),
  };
}

function personName(p: { businessName?: string | null; user: { name: string | null; surname: string | null; email: string | null } }): string {
  return p.businessName?.trim() || [p.user.name, p.user.surname].filter(Boolean).join(" ") || p.user.email || "Professionista";
}

/** L'email com'è davvero, dallo stesso modello dell'invio, per il primo destinatario. */
function emailPreview(type: string, payload: Record<string, unknown>, name: string, recipients: { label: string; detail: string | null; href: string | null }[]): AdminProposalPreview {
  const email = notificationEmail(type, payload as never, { ...EMPTY_EMAIL_CONTEXT, name });
  return {
    type: "email",
    subject: email?.subject ?? "",
    title: email?.title ?? "",
    paragraphs: [`Ciao ${name},`, ...(email?.paragraphs ?? []).map(stripEmailMarkdown)],
    cta: email?.cta?.label ?? null,
    recipients,
  };
}

function sentLabel(sent: number, total: number): string {
  if (sent === total) return plural(sent, "email inviata", "email inviate");
  return `${plural(sent, "email inviata", "email inviate")}; ${total - sent} no, perché nel frattempo hanno completato il profilo`;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

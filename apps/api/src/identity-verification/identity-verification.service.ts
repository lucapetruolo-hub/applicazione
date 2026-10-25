import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { IdentityVerification, Prisma, PrismaClient, TaxIdCheck } from "@professionisti/database";
import {
  BIOMETRIC_CONSENT_VERSION,
  birthDateFromCodiceFiscale,
  fiscalDataMissing,
  type MyVerificationStatus,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalVerificationService } from "../professional-verification/professional-verification.service";
import { publicVisibilityMissing } from "../professional-fiscal/public-visibility";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";
import { toTaxIdCheckView } from "../tax-id-check/tax-id-check.service";
import { IdentityProviderError, type IdentityDecision, type IdentityProvider } from "./identity-provider";
import { identityProviderFromEnv, identityVerificationNeeded } from "./identity-provider-env";
import { matchDocumentToFiscal, type ExpectedPerson } from "./identity-match";

/** Tentativi al giorno: ogni verifica ha un costo, e oltre è meglio che ci scriva. */
export const MAX_IDENTITY_ATTEMPTS_PER_DAY = 5;
/** Un link di verifica non ancora usato si riapre per un'ora invece di crearne (e pagarne) un altro. */
const REUSE_SESSION_MS = 50 * 60_000;
/** Mentre si aspetta l'esito, la pagina chiede lo stato al fornitore al massimo ogni 10 secondi. */
const REFRESH_EVERY_MS = 10_000;
/**
 * Fornitore irraggiungibile all'avvio (§256, decisione dell'utente): il
 * tentativo resta "in attesa" con questo stato, senza link. Il controllo
 * periodico riprova e, appena il fornitore risponde, avvisa il professionista.
 */
export const STANDBY_PROVIDER_STATUS = "Standby";
/** Per quanti giorni si riprova un tentativo in attesa o si chiede un esito mai arrivato. */
const FOLLOW_UP_DAYS = 7;
/** Promemoria a chi non ha fatto la verifica: il primo dopo 3 giorni, l'ultimo una settimana dopo. */
const REMINDER_FIRST_AFTER_DAYS = 3;
const REMINDER_AGAIN_AFTER_DAYS = 7;
const MAX_REMINDERS = 2;
const DAY_MS = 24 * 60 * 60_000;
/** Email "Completa il profilo": il giorno dopo la creazione del profilo, poi dopo una settimana (finestre di 2 giorni). */
const SETUP_REMINDER_WINDOWS: [number, number][] = [
  [1, 3],
  [7, 9],
];

export type ProfileSetupItem = "SEARCH" | "QUOTES" | "ONLINE_PAYMENTS";

/**
 * Cosa manca ancora, nello stesso ordine di "Completa il profilo" in Oggi
 * (docs/CHANGELOG.md §261). I pagamenti online contano solo dove sono attivi.
 */
export function profileSetupMissing(status: Pick<MyVerificationStatus, "publicVisible" | "canSendQuotes">, stripeVerified: boolean, paymentsOn: boolean): ProfileSetupItem[] {
  const missing: ProfileSetupItem[] = [];
  if (!status.publicVisible) missing.push("SEARCH");
  if (!status.canSendQuotes) missing.push("QUOTES");
  // I pagamenti online si sbloccano solo dopo la verifica dell'identità (§262).
  if (paymentsOn && status.canSendQuotes && !stripeVerified) missing.push("ONLINE_PAYMENTS");
  return missing;
}

/** Va mandata l'email "Completa il profilo"? Una nella prima finestra, una nella seconda, mai due a meno di 5 giorni. */
export function setupReminderDue(input: { profileCreatedAt: Date; sent: number; lastSentAt: Date | null; now: Date }): boolean {
  const age = (input.now.getTime() - input.profileCreatedAt.getTime()) / DAY_MS;
  const window = SETUP_REMINDER_WINDOWS.findIndex(([from, to]) => age >= from && age < to);
  if (window < 0 || input.sent > window) return false;
  return !input.lastSentAt || input.now.getTime() - input.lastSentAt.getTime() >= 5 * DAY_MS;
}

const ROME_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });

/** Ora di Roma meno ora UTC, in millisecondi, in quell'istante (+1 o +2 ore). */
function romeOffsetMs(at: Date): number {
  const parts = Object.fromEntries(ROME_PARTS.formatToParts(at).map((p) => [p.type, Number(p.value)]));
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!) - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Mezzanotte di oggi a Roma: i tentativi "di oggi" si contano dal giorno di
 * calendario, non dalle ultime 24 ore (segnalazione dell'utente,
 * docs/CHANGELOG.md §276: 5 tentativi tra ieri e oggi bloccavano già).
 */
export function startOfRomeDay(now: Date): Date {
  const local = new Date(now.getTime() + romeOffsetMs(now));
  const midnightWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Lo scarto di mezzanotte può differire da quello di adesso nei giorni del cambio d'ora.
  return new Date(midnightWall - romeOffsetMs(new Date(midnightWall - romeOffsetMs(now))));
}

export const isStandby = (row: Pick<IdentityVerification, "status" | "providerStatus" | "sessionUrl"> | null): boolean =>
  !!row && row.status === "STARTED" && row.providerStatus === STANDBY_PROVIDER_STATUS && !row.sessionUrl;

/** Va mandato un promemoria? Al massimo due: dopo 3 giorni dall'iscrizione, poi dopo un'altra settimana. */
export function reminderDue(input: { profileCreatedAt: Date; sent: number; lastSentAt: Date | null; now: Date }): boolean {
  if (input.sent >= MAX_REMINDERS) return false;
  if (input.now.getTime() - input.profileCreatedAt.getTime() < REMINDER_FIRST_AFTER_DAYS * DAY_MS) return false;
  if (input.sent === 0 || !input.lastSentAt) return true;
  return input.now.getTime() - input.lastSentAt.getTime() >= REMINDER_AGAIN_AFTER_DAYS * DAY_MS;
}

const UNCLEAR_REASON =
  "Non siamo riusciti a confermare il documento. Rifai la verifica con un documento valido, inquadrato per intero, con buona luce e senza riflessi.";

export const SANDBOX_BADGE_REASON = "Il badge era stato dato con una verifica di prova: rifai la verifica con documento e selfie.";
export const EXPIRED_BADGE_REASON = "Il documento della tua verifica è scaduto: rifalla con un documento valido. Intanto puoi continuare a inviare preventivi.";
const DECLINED_REASON =
  "Il documento o il selfie non sono stati accettati. Usa un documento valido e non scaduto, con buona luce e senza riflessi, e riprova.";

/** Avviso "il documento sta per scadere" (§335). */
export const EXPIRY_REMINDER_DAYS = 30;
/** Senza data di scadenza letta dal documento, la verifica vale 5 anni (§335). */
export const VERIFICATION_VALID_YEARS = 5;

export type BadgeOverTime = "KEEP" | "REMIND" | "REVOKE_SANDBOX" | "REVOKE_EXPIRED";

/**
 * Badge "Verificato" nel tempo (decisione dell'utente, docs/CHANGELOG.md
 * §335), con le chiavi vere del fornitore: senza una verifica approvata non
 * di prova il badge cade; alla scadenza del documento (o dopo 5 anni senza
 * data) cade anche lui, con un avviso 30 giorni prima.
 */
export function badgeOverTime(
  approved: Pick<IdentityVerification, "decidedAt" | "createdAt" | "documentExpiresAt" | "expiryRemindedAt"> | null,
  now: Date,
): BadgeOverTime {
  if (!approved) return "REVOKE_SANDBOX";
  const validUntil = verificationValidUntil(approved);
  if (now.getTime() >= validUntil.getTime()) return "REVOKE_EXPIRED";
  if (!approved.expiryRemindedAt && validUntil.getTime() - now.getTime() <= EXPIRY_REMINDER_DAYS * DAY_MS) return "REMIND";
  return "KEEP";
}

export function verificationValidUntil(approved: Pick<IdentityVerification, "decidedAt" | "createdAt" | "documentExpiresAt">): Date {
  if (approved.documentExpiresAt) return approved.documentExpiresAt;
  const from = approved.decidedAt ?? approved.createdAt;
  return new Date(Date.UTC(from.getUTCFullYear() + VERIFICATION_VALID_YEARS, from.getUTCMonth(), from.getUTCDate()));
}

/** "AAAA-MM-GG" del fornitore → fine di quel giorno in Italia (il documento vale tutto il giorno). */
export function documentExpiry(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59.000Z`);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() - 2 * 60 * 60_000);
}

const FISCAL_INCLUDE = { taxIdChecks: true, representative: true } satisfies Prisma.ProfessionalFiscalProfileInclude;
type FiscalWithChecks = Prisma.ProfessionalFiscalProfileGetPayload<{ include: typeof FISCAL_INCLUDE }>;

/**
 * Verifica di documento e selfie (docs/CHANGELOG.md §253, decisioni
 * dell'utente del 14/10/2026): obbligatoria prima di inviare preventivi,
 * sostituisce la verifica manuale di /admin/verifiche (nessun caso passa
 * all'admin, §255). Il confronto è con il codice fiscale e i dati fiscali (per le
 * aziende con il legale rappresentante). Foto e selfie restano al fornitore.
 */
@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name);
  private readonly provider: IdentityProvider | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
    private readonly professionalVerificationService: ProfessionalVerificationService,
  ) {
    this.provider = identityProviderFromEnv();
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  private async loadMine(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, isDemo: true, verified: true, identityExpiredAt: true, deletedAt: true, fiscalProfile: { include: FISCAL_INCLUDE } },
    });
    if (!profile || profile.deletedAt) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return profile;
  }

  private latest(professionalProfileId: string): Promise<IdentityVerification | null> {
    return this.prisma.identityVerification.findFirst({ where: { professionalProfileId }, orderBy: { createdAt: "desc" } });
  }

  async myStatus(userId: string): Promise<MyVerificationStatus> {
    const profile = await this.loadMine(userId);
    let latest = await this.latest(profile.id);
    // Di ritorno dalla pagina del fornitore il webhook può non essere ancora arrivato.
    if (latest && this.provider && !isStandby(latest) && (latest.status === "STARTED" || latest.status === "PROCESSING") && Date.now() - latest.updatedAt.getTime() > REFRESH_EVERY_MS) {
      latest = await this.refresh(latest).catch((error) => {
        this.logger.warn(`Stato della verifica non aggiornato: ${String(error)}`);
        return latest;
      });
    }
    const fresh = latest && latest.status === "APPROVED" ? await this.loadMine(userId) : profile;
    return this.buildStatus(fresh, latest);
  }

  private buildStatus(
    profile: { isDemo: boolean; verified: boolean; identityExpiredAt: Date | null; fiscalProfile: FiscalWithChecks | null },
    latest: IdentityVerification | null,
  ): MyVerificationStatus {
    const fiscal = profile.fiscalProfile;
    const fiscalMissing = fiscalDataMissing(fiscal);
    const fiscalDataComplete = fiscalMissing.length === 0;
    const checks: TaxIdCheck[] = fiscal?.taxIdChecks ?? [];
    const taxIdState: MyVerificationStatus["taxIdState"] = checks.some((c) => c.status === "INVALID")
      ? "TO_FIX"
      : checks.length === 0
        ? "NOT_NEEDED"
        : checks.some((c) => c.status === "PENDING")
          ? "CHECKING"
          : "OK";
    // Badge tolto dopo una verifica approvata (dati cambiati, documento scaduto, prova): si ricomincia.
    const status = profile.verified ? "APPROVED" : latest?.status === "APPROVED" ? "NOT_STARTED" : (latest?.status ?? "NOT_STARTED");
    const available = this.provider !== null;
    const blockedReason = profile.verified
      ? null
      : !available
        ? "La verifica dell'identità non è ancora attiva: ti avvisiamo noi quando puoi farla."
        : !fiscalDataComplete
          ? "Completa prima i dati fiscali: li confrontiamo con il tuo documento."
          : taxIdState === "TO_FIX"
            ? "Correggi prima il codice fiscale o la partita IVA nei dati fiscali."
            : status === "PROCESSING"
              ? "Stiamo aspettando l'esito della verifica che hai appena fatto."
              : null;
    return {
      isBusiness: fiscal?.entityType === "BUSINESS",
      fiscalDataComplete,
      fiscalMissing,
      taxIdState,
      taxIdChecks: checks.map(toTaxIdCheckView),
      identity: {
        available,
        status,
        reason: profile.verified ? null : (latest?.reason ?? null),
        updatedAt: latest?.updatedAt.toISOString() ?? null,
        standby: !profile.verified && isStandby(latest),
        canStart: !profile.verified && blockedReason === null,
        blockedReason,
        renewal: !profile.verified && !!profile.identityExpiredAt,
      },
      verified: profile.verified,
      publicVisible: !publicVisibilityMissing({
        isDemo: profile.isDemo,
        fiscalProfile: fiscal ? { fiscalDataCompleteAt: fiscal.fiscalDataCompleteAt, taxIdChecks: checks.filter((c) => c.status === "INVALID") } : null,
      }),
      canSendQuotes: !identityVerificationNeeded(profile),
    };
  }

  /**
   * Avvia (o riprende) la verifica. Se il fornitore non risponde il tentativo
   * resta in attesa (`standby`): niente errore, il professionista viene
   * avvisato con una notifica e un'email appena può continuare.
   */
  async start(userId: string): Promise<{ url: string | null; standby: boolean }> {
    const profile = await this.loadMine(userId);
    const latest = await this.latest(profile.id);
    const status = this.buildStatus(profile, latest);
    if (!status.identity.canStart || !this.provider) {
      throw new BadRequestException(status.identity.blockedReason ?? "Il tuo profilo è già verificato.");
    }
    if (latest && isStandby(latest)) {
      const url = await this.resumeStandby(latest);
      return { url, standby: url === null };
    }
    if (latest?.status === "STARTED" && latest.sessionUrl && Date.now() - latest.updatedAt.getTime() < REUSE_SESSION_MS) {
      return { url: latest.sessionUrl, standby: false };
    }
    const attemptsToday = await this.prisma.identityVerification.count({ where: { professionalProfileId: profile.id, createdAt: { gte: startOfRomeDay(new Date()) } } });
    // Nelle prove con Didit le verifiche non costano: nessun limite (docs/CHANGELOG.md §276).
    if (!this.provider.sandbox && attemptsToday >= MAX_IDENTITY_ATTEMPTS_PER_DAY) {
      throw new BadRequestException(`Hai già fatto ${MAX_IDENTITY_ATTEMPTS_PER_DAY} tentativi oggi: riprova domani, oppure scrivici dalla pagina Contatti e ti aiutiamo.`);
    }
    const session = await this.createSession(profile.id);
    const row = await this.prisma.identityVerification.create({
      data: {
        professionalProfileId: profile.id,
        provider: this.provider.name,
        // In attesa: un id provvisorio, sostituito da quello vero appena il fornitore risponde.
        providerSessionId: session?.sessionId ?? `standby-${randomUUID()}`,
        sessionUrl: session?.url ?? null,
        providerStatus: session ? null : STANDBY_PROVIDER_STATUS,
        biometricConsentAt: new Date(),
        biometricConsentVersion: BIOMETRIC_CONSENT_VERSION,
        sandbox: this.provider.sandbox,
      },
    });
    await this.auditLogService.record({
      entityType: "IdentityVerification",
      entityId: row.id,
      fieldName: "biometricConsent",
      newValue: BIOMETRIC_CONSENT_VERSION,
      changedByUserId: userId,
      reason: session ? "Consenso al confronto del selfie e avvio della verifica." : "Consenso al confronto del selfie; verifica in attesa, il servizio non risponde.",
    });
    return { url: session?.url ?? null, standby: !session };
  }

  private async createSession(professionalProfileId: string): Promise<{ sessionId: string; url: string } | null> {
    if (!this.provider) return null;
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, include: FISCAL_INCLUDE });
    const expected = expectedPerson(fiscal);
    try {
      return await this.provider.createSession({
        reference: professionalProfileId,
        expected: { firstName: expected.firstName, lastName: expected.lastName, dateOfBirth: expected.dateOfBirth },
        callbackUrl: `${this.frontendUrl()}/dashboard/verifica-identita?ritorno=1`,
      });
    } catch (error) {
      this.logger.warn(`Sessione di verifica non creata, resta in attesa: ${String(error)}`);
      return null;
    }
  }

  /** Riprova un tentativo in attesa: torna il link se il fornitore ora risponde, altrimenti null. */
  private async resumeStandby(row: IdentityVerification): Promise<string | null> {
    const session = await this.createSession(row.professionalProfileId);
    if (!session) return null;
    await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: { providerSessionId: session.sessionId, sessionUrl: session.url, providerStatus: null },
    });
    return session.url;
  }

  /**
   * Controllo periodico (§256): riprende i tentativi in attesa quando il
   * fornitore torna e avvisa il professionista; chiede l'esito delle
   * verifiche finite il cui webhook non è arrivato (l'esito, positivo o no,
   * arriva comunque con una notifica e un'email).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async followUp(now: Date = new Date()): Promise<void> {
    if (!this.provider) return;
    const since = new Date(now.getTime() - FOLLOW_UP_DAYS * DAY_MS);
    const waiting = await this.prisma.identityVerification.findMany({
      where: { status: "STARTED", providerStatus: STANDBY_PROVIDER_STATUS, sessionUrl: null, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 20,
      include: { professionalProfile: { select: { userId: true, verified: true, deletedAt: true } } },
    });
    for (const row of waiting) {
      if (row.professionalProfile.verified || row.professionalProfile.deletedAt) continue;
      const url = await this.resumeStandby(row);
      // Il fornitore non risponde ancora: inutile insistere con gli altri.
      if (!url) break;
      await this.notificationsService.notify(row.professionalProfile.userId, "IDENTITY_VERIFICATION_READY", {});
    }

    // Finite ma senza esito, e iniziate nelle ultime 24 ore (il professionista
    // può aver finito sul telefono senza tornare alla pagina).
    const quietSince = new Date(now.getTime() - 10 * 60_000);
    const processing = await this.prisma.identityVerification.findMany({
      where: { status: "PROCESSING", createdAt: { gte: since }, updatedAt: { lte: quietSince } },
      orderBy: { updatedAt: "asc" },
      take: 50,
    });
    const started = await this.prisma.identityVerification.findMany({
      where: { status: "STARTED", sessionUrl: { not: null }, createdAt: { gte: new Date(now.getTime() - DAY_MS) }, updatedAt: { lte: quietSince } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const row of [...processing, ...started]) {
      await this.refresh(row).catch((error) => this.logger.warn(`Esito della verifica non ancora disponibile: ${String(error)}`));
    }
  }

  /** Promemoria a chi non ha ancora fatto la verifica (§256): notifica ed email, al massimo due. */
  @Cron("0 10 * * *", { timeZone: "Europe/Rome" })
  async remindUnverified(now: Date = new Date()): Promise<void> {
    if (!this.provider) return;
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        verified: false,
        // Documento scaduto: ha già il suo avviso, e può continuare a lavorare (§335).
        identityExpiredAt: null,
        isDemo: false,
        deletedAt: null,
        invitePendingAt: null,
        suspendedAt: null,
        user: { suspendedAt: null },
        createdAt: { lte: new Date(now.getTime() - REMINDER_FIRST_AFTER_DAYS * DAY_MS) },
      },
      select: { id: true, userId: true, createdAt: true },
      take: 200,
    });
    for (const profile of profiles) {
      const latest = await this.latest(profile.id);
      // Esito in arrivo o in attesa del servizio: c'è già chi lo avvisa.
      if (latest && (latest.status === "PROCESSING" || isStandby(latest))) continue;
      const sent = await this.prisma.notification.findMany({
        where: { userId: profile.userId, type: "IDENTITY_VERIFICATION_REMINDER" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!reminderDue({ profileCreatedAt: profile.createdAt, sent: sent.length, lastSentAt: sent[0]?.createdAt ?? null, now })) continue;
      await this.notificationsService.notify(profile.userId, "IDENTITY_VERIFICATION_REMINDER", {});
    }
  }

  /**
   * Badge nel tempo (§335), ogni mattina e solo con le chiavi vere del
   * fornitore: in prova le verifiche sono tutte di prova e il badge resta.
   */
  @Cron("0 9 * * *", { timeZone: "Europe/Rome" })
  async checkBadgesOverTime(now: Date = new Date()): Promise<void> {
    if (!this.provider || this.provider.sandbox) return;
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { verified: true, isDemo: false, deletedAt: null },
      select: { id: true, userId: true },
      take: 500,
    });
    for (const profile of profiles) {
      const approved = await this.prisma.identityVerification.findFirst({
        where: { professionalProfileId: profile.id, status: "APPROVED", sandbox: false },
        orderBy: { decidedAt: "desc" },
      });
      const outcome = badgeOverTime(approved, now);
      if (outcome === "REVOKE_SANDBOX") {
        await this.professionalVerificationService.revokeOverTime(profile.id, SANDBOX_BADGE_REASON, false);
      } else if (outcome === "REVOKE_EXPIRED") {
        await this.professionalVerificationService.revokeOverTime(profile.id, EXPIRED_BADGE_REASON, true);
      } else if (outcome === "REMIND" && approved) {
        const claimed = await this.prisma.identityVerification.updateMany({ where: { id: approved.id, expiryRemindedAt: null }, data: { expiryRemindedAt: now } });
        if (claimed.count === 1) {
          await this.notificationsService.notify(profile.userId, "IDENTITY_VERIFICATION_EXPIRING", { expiresOn: verificationValidUntil(approved).toISOString() });
        }
      }
    }
  }

  /**
   * Email "Completa il profilo" il giorno dopo l'iscrizione (decisione
   * dell'utente, docs/CHANGELOG.md §261-§262) e di nuovo dopo una settimana,
   * solo se manca ancora qualcosa.
   */
  @Cron("0 11 * * *", { timeZone: "Europe/Rome" })
  async remindProfileSetup(now: Date = new Date()): Promise<void> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: {
        isDemo: false,
        deletedAt: null,
        invitePendingAt: null,
        suspendedAt: null,
        user: { suspendedAt: null },
        createdAt: { lte: new Date(now.getTime() - SETUP_REMINDER_WINDOWS[0]![0] * DAY_MS), gt: new Date(now.getTime() - SETUP_REMINDER_WINDOWS[SETUP_REMINDER_WINDOWS.length - 1]![1] * DAY_MS) },
      },
      select: { id: true, userId: true, createdAt: true, isDemo: true, verified: true, identityExpiredAt: true, fiscalProfile: { include: FISCAL_INCLUDE } },
      take: 200,
    });
    for (const profile of profiles) {
      const sent = await this.prisma.notification.findMany({
        where: { userId: profile.userId, type: "PROFILE_SETUP_REMINDER" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!setupReminderDue({ profileCreatedAt: profile.createdAt, sent: sent.length, lastSentAt: sent[0]?.createdAt ?? null, now })) continue;
      const status = this.buildStatus(profile, await this.latest(profile.id));
      const missing = profileSetupMissing(status, !!profile.fiscalProfile?.stripePayoutsEnabled, onlinePaymentsEnabled());
      if (missing.length === 0) continue;
      await this.notificationsService.notify(profile.userId, "PROFILE_SETUP_REMINDER", { missing });
    }
  }

  /** Webhook del fornitore: firma verificata, poi l'esito si rilegge dalla sua API (mai fidarsi del solo contenuto). */
  async handleWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<{ received: true }> {
    if (!this.provider) return { received: true };
    const sessionId = this.provider.verifyWebhook(rawBody, headers);
    if (!sessionId) throw new UnauthorizedException("Firma non valida.");
    const row = await this.prisma.identityVerification.findUnique({ where: { providerSessionId: sessionId } });
    if (row) await this.refresh(row);
    return { received: true };
  }

  private async refresh(row: IdentityVerification): Promise<IdentityVerification> {
    if (!this.provider) return row;
    let decision: IdentityDecision;
    try {
      decision = await this.provider.getDecision(row.providerSessionId);
    } catch (error) {
      if (error instanceof IdentityProviderError) this.logger.warn(error.message);
      throw error;
    }
    return this.apply(row, decision);
  }

  /** Esito del fornitore → stato del tentativo e, se tutto torna, badge "Verificato". */
  async apply(row: IdentityVerification, decision: IdentityDecision): Promise<IdentityVerification> {
    const owner = await this.prisma.professionalProfile.findUnique({
      where: { id: row.professionalProfileId },
      select: { id: true, userId: true, verified: true, fiscalProfile: { include: FISCAL_INCLUDE } },
    });
    if (!owner) return row;

    let next: { status: IdentityVerification["status"]; reason: string | null };
    switch (decision.outcome) {
      case "IN_PROGRESS":
        next = { status: "STARTED", reason: null };
        break;
      case "PROCESSING":
        next = { status: "PROCESSING", reason: null };
        break;
      case "EXPIRED":
        next = { status: "EXPIRED", reason: "La verifica non è stata completata in tempo: puoi ricominciarla." };
        break;
      case "DECLINED":
        next = { status: "DECLINED", reason: decision.reason ?? DECLINED_REASON };
        break;
      // Nessun caso passa all'admin (decisione dell'utente, §255): se il
      // controllo automatico non conferma, il professionista sa cosa
      // correggere e rifà la verifica da solo.
      case "REVIEW":
        next = { status: "DECLINED", reason: decision.reason ?? UNCLEAR_REASON };
        break;
      case "APPROVED": {
        // Ambiente di prova di Didit: i dati del documento sono finti, il confronto non avrebbe senso.
        if (this.provider?.sandbox) {
          this.logger.warn(`Verifica ${row.id} approvata in prova (DIDIT_SANDBOX): confronto con i dati fiscali saltato.`);
          next = { status: "APPROVED", reason: null };
          break;
        }
        const match = matchDocumentToFiscal(decision.person, expectedPerson(owner.fiscalProfile));
        next = match.matched ? { status: "APPROVED", reason: null } : { status: "DECLINED", reason: match.reason };
        break;
      }
    }
    if (next.status === row.status && decision.providerStatus === row.providerStatus) return row;
    // Perché non è andata: i codici degli avvisi del fornitore (mai i dati della persona), per capirlo dai log.
    const why = decision.warnings.length > 0 ? ` (avvisi: ${decision.warnings.join(", ")})` : "";
    if (next.status === "DECLINED" && next.status !== row.status) {
      this.logger.warn(`Verifica ${row.id} non confermata: ${row.provider} ${decision.providerStatus}${why}${decision.outcome === "APPROVED" ? `, ${next.reason}` : ""}`);
    }
    const decided = next.status === "APPROVED" || next.status === "DECLINED";
    const updated = await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: {
        status: next.status,
        reason: next.reason,
        providerStatus: decision.providerStatus,
        decidedAt: decided ? new Date() : row.decidedAt,
        // Dal documento si conserva solo la scadenza (§335).
        ...(next.status === "APPROVED" ? { documentExpiresAt: documentExpiry(decision.documentExpiresAt), expiryRemindedAt: null } : {}),
      },
    });
    if (next.status !== row.status) {
      await this.auditLogService.record({
        entityType: "IdentityVerification",
        entityId: row.id,
        fieldName: "status",
        oldValue: row.status,
        newValue: next.status,
        reason: `${next.reason ?? `Esito ${row.provider}: ${decision.providerStatus}`}${next.status === "DECLINED" ? ` [${row.provider}: ${decision.providerStatus}${why}]` : ""}`,
      });
      if (next.status === "APPROVED" && !owner.verified) {
        await this.professionalVerificationService.markVerifiedByProvider(owner.id, row.provider);
      } else if (next.status === "DECLINED") {
        await this.notificationsService.notify(owner.userId, "IDENTITY_VERIFICATION_DECLINED", { reason: next.reason });
      }
    }
    return updated;
  }
}

/** La persona attesa sul documento: il titolare, o il legale rappresentante per un'azienda. */
export function expectedPerson(fiscal: FiscalWithChecks | null): ExpectedPerson {
  if (!fiscal) return { firstName: null, lastName: null, dateOfBirth: null, codiceFiscale: null };
  if (fiscal.entityType === "BUSINESS") {
    const rep = fiscal.representative;
    const cf = rep?.codiceFiscale?.trim().toUpperCase() || null;
    return { firstName: rep?.firstName ?? null, lastName: rep?.lastName ?? null, dateOfBirth: cf ? birthDateFromCodiceFiscale(cf) : null, codiceFiscale: cf };
  }
  return {
    firstName: fiscal.fiscalFirstName,
    lastName: fiscal.fiscalLastName,
    dateOfBirth: fiscal.dateOfBirth ? fiscal.dateOfBirth.toISOString().slice(0, 10) : null,
    codiceFiscale: fiscal.fiscalCodiceFiscale?.trim().toUpperCase() || null,
  };
}

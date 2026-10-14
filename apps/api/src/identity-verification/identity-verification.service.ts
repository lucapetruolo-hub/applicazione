import { BadRequestException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
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

const DECLINED_REASON =
  "Il documento o il selfie non sono stati accettati. Usa un documento valido e non scaduto, con buona luce e senza riflessi, e riprova.";

const FISCAL_INCLUDE = { taxIdChecks: true, representative: true } satisfies Prisma.ProfessionalFiscalProfileInclude;
type FiscalWithChecks = Prisma.ProfessionalFiscalProfileGetPayload<{ include: typeof FISCAL_INCLUDE }>;

/**
 * Verifica di documento e selfie (docs/CHANGELOG.md §243, decisioni
 * dell'utente del 14/10/2026): obbligatoria prima di inviare preventivi,
 * sostituisce la verifica manuale di /admin/verifiche (all'admin restano i
 * casi dubbi). Il confronto è con il codice fiscale e i dati fiscali (per le
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
      select: { id: true, userId: true, isDemo: true, verified: true, deletedAt: true, fiscalProfile: { include: FISCAL_INCLUDE } },
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
    if (latest && this.provider && (latest.status === "STARTED" || latest.status === "PROCESSING") && Date.now() - latest.updatedAt.getTime() > REFRESH_EVERY_MS) {
      latest = await this.refresh(latest).catch((error) => {
        this.logger.warn(`Stato della verifica non aggiornato: ${String(error)}`);
        return latest;
      });
    }
    const fresh = latest && latest.status === "APPROVED" ? await this.loadMine(userId) : profile;
    return this.buildStatus(fresh, latest);
  }

  private buildStatus(
    profile: { isDemo: boolean; verified: boolean; fiscalProfile: FiscalWithChecks | null },
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
    const status = profile.verified ? "APPROVED" : (latest?.status ?? "NOT_STARTED");
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
              : status === "NEEDS_REVIEW"
                ? "La tua verifica è in controllo da parte del nostro team."
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
        reason: profile.verified ? null : (latest?.reviewNote ?? latest?.reason ?? null),
        updatedAt: latest?.updatedAt.toISOString() ?? null,
        canStart: !profile.verified && blockedReason === null,
        blockedReason,
      },
      verified: profile.verified,
      publicVisible: !publicVisibilityMissing({
        isDemo: profile.isDemo,
        fiscalProfile: fiscal ? { fiscalDataCompleteAt: fiscal.fiscalDataCompleteAt, taxIdChecks: checks.filter((c) => c.status === "INVALID") } : null,
      }),
      canSendQuotes: !identityVerificationNeeded(profile),
    };
  }

  async start(userId: string): Promise<{ url: string }> {
    const profile = await this.loadMine(userId);
    const latest = await this.latest(profile.id);
    const status = this.buildStatus(profile, latest);
    if (!status.identity.canStart || !this.provider) {
      throw new BadRequestException(status.identity.blockedReason ?? "Il tuo profilo è già verificato.");
    }
    if (latest?.status === "STARTED" && latest.sessionUrl && Date.now() - latest.createdAt.getTime() < REUSE_SESSION_MS) {
      return { url: latest.sessionUrl };
    }
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const attemptsToday = await this.prisma.identityVerification.count({ where: { professionalProfileId: profile.id, createdAt: { gte: since } } });
    if (attemptsToday >= MAX_IDENTITY_ATTEMPTS_PER_DAY) {
      throw new BadRequestException(`Hai già fatto ${MAX_IDENTITY_ATTEMPTS_PER_DAY} tentativi oggi: riprova domani, oppure scrivici dalla pagina Contatti e ti aiutiamo.`);
    }
    let session: { sessionId: string; url: string };
    try {
      session = await this.provider.createSession({
        reference: profile.id,
        callbackUrl: `${this.frontendUrl()}/dashboard/verifica-identita?ritorno=1`,
      });
    } catch (error) {
      this.logger.error("Sessione di verifica non creata", error);
      throw new ServiceUnavailableException("Il servizio di verifica non risponde in questo momento. Riprova tra qualche minuto.");
    }
    const row = await this.prisma.identityVerification.create({
      data: {
        professionalProfileId: profile.id,
        provider: this.provider.name,
        providerSessionId: session.sessionId,
        sessionUrl: session.url,
        biometricConsentAt: new Date(),
        biometricConsentVersion: BIOMETRIC_CONSENT_VERSION,
      },
    });
    await this.auditLogService.record({
      entityType: "IdentityVerification",
      entityId: row.id,
      fieldName: "biometricConsent",
      newValue: BIOMETRIC_CONSENT_VERSION,
      changedByUserId: userId,
      reason: "Consenso al confronto del selfie e avvio della verifica.",
    });
    return { url: session.url };
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
    // Una decisione presa da un admin non la cambia più il fornitore.
    if (row.reviewedByUserId) return row;
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
        next = { status: "DECLINED", reason: DECLINED_REASON };
        break;
      case "REVIEW":
        next = { status: "NEEDS_REVIEW", reason: "Il fornitore ha chiesto un controllo in più sul documento." };
        break;
      case "APPROVED": {
        const match = matchDocumentToFiscal(decision.person, expectedPerson(owner.fiscalProfile));
        next = match.matched ? { status: "APPROVED", reason: null } : { status: "NEEDS_REVIEW", reason: match.reason };
        break;
      }
    }
    if (next.status === row.status && decision.providerStatus === row.providerStatus) return row;
    const decided = next.status === "APPROVED" || next.status === "DECLINED" || next.status === "NEEDS_REVIEW";
    const updated = await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: { status: next.status, reason: next.reason, providerStatus: decision.providerStatus, decidedAt: decided ? new Date() : row.decidedAt },
    });
    if (next.status !== row.status) {
      await this.auditLogService.record({
        entityType: "IdentityVerification",
        entityId: row.id,
        fieldName: "status",
        oldValue: row.status,
        newValue: next.status,
        reason: next.reason ?? `Esito ${row.provider}: ${decision.providerStatus}`,
      });
      if (next.status === "APPROVED" && !owner.verified) {
        await this.professionalVerificationService.markVerifiedByProvider(owner.id, row.provider);
      } else if (next.status === "DECLINED") {
        await this.notificationsService.notify(owner.userId, "IDENTITY_VERIFICATION_DECLINED", { reason: next.reason });
      }
    }
    return updated;
  }

  /** Caso dubbio rifiutato da un admin: il professionista riceve il motivo e può riprovare. */
  async declineReview(adminUserId: string, professionalProfileId: string, note: string) {
    const row = await this.prisma.identityVerification.findFirst({
      where: { professionalProfileId, status: "NEEDS_REVIEW" },
      orderBy: { createdAt: "desc" },
      include: { professionalProfile: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException("Nessuna verifica da controllare per questo professionista.");
    await this.prisma.identityVerification.update({
      where: { id: row.id },
      data: { status: "DECLINED", reviewedByUserId: adminUserId, reviewNote: note, decidedAt: new Date() },
    });
    await this.auditLogService.record({
      entityType: "IdentityVerification",
      entityId: row.id,
      fieldName: "status",
      oldValue: "NEEDS_REVIEW",
      newValue: "DECLINED",
      changedByUserId: adminUserId,
      reason: note,
    });
    await this.notificationsService.notify(row.professionalProfile.userId, "IDENTITY_VERIFICATION_DECLINED", { reason: note });
    return { professionalProfileId, status: "DECLINED" as const };
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

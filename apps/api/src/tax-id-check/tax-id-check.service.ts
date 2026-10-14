import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient, TaxIdCheck } from "@professionisti/database";
import { isValidCodiceFiscale, isValidPartitaIva, type TaxIdCheckView, type TaxIdKind } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { taxIdProviderFromEnv } from "./openapi-tax-id.provider";
import { TaxIdProviderUnavailableError, type TaxIdProvider } from "./tax-id-provider";

/** Dopo questi tentativi falliti per servizio irraggiungibile si smette: il dato resta "in controllo", senza bloccare. */
export const MAX_TAX_ID_ATTEMPTS = 8;

/** Attesa prima del prossimo tentativo: 15 minuti, poi il doppio ogni volta, massimo 12 ore. */
export function nextTaxIdAttempt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_TAX_ID_ATTEMPTS) return null;
  const minutes = Math.min(15 * 2 ** Math.max(0, attempts - 1), 12 * 60);
  return new Date(now.getTime() + minutes * 60_000);
}

type FiscalIds = {
  entityType: string | null;
  fiscalIdIssuingCountry: string | null;
  fiscalCodiceFiscale: string | null;
  vatNumber: string | null;
};

const clean = (value: string | null | undefined) => (value ?? "").trim().toUpperCase().replace(/[\s-]/g, "");

/**
 * Quali dati controllare all'Agenzia delle Entrate / Registro Imprese: il
 * codice fiscale delle persone (privato, professionista) e la partita IVA di
 * professionisti e aziende, solo se italiani e già corretti nella forma.
 */
export function wantedTaxIdChecks(fiscal: FiscalIds): { kind: TaxIdKind; value: string }[] {
  const italian = !fiscal.fiscalIdIssuingCountry || fiscal.fiscalIdIssuingCountry.trim().toUpperCase() === "IT";
  if (!italian) return [];
  const wanted: { kind: TaxIdKind; value: string }[] = [];
  const cf = clean(fiscal.fiscalCodiceFiscale);
  if ((fiscal.entityType === "PRIVATE_INDIVIDUAL" || fiscal.entityType === "SOLE_PROPRIETOR") && isValidCodiceFiscale(cf)) {
    wanted.push({ kind: "CODICE_FISCALE", value: cf });
  }
  const vat = clean(fiscal.vatNumber);
  if ((fiscal.entityType === "SOLE_PROPRIETOR" || fiscal.entityType === "BUSINESS") && isValidPartitaIva(vat)) {
    wanted.push({ kind: "PARTITA_IVA", value: vat });
  }
  return wanted;
}

export function toTaxIdCheckView(row: TaxIdCheck): TaxIdCheckView {
  return {
    kind: row.kind,
    value: row.value,
    status: row.status,
    detail: row.detail,
    officialName: row.officialName,
    checkedAt: row.checkedAt?.toISOString() ?? null,
  };
}

/**
 * Controllo di codice fiscale e partita IVA con Openapi (docs/CHANGELOG.md
 * §243, decisione dell'utente: profilo pubblico dopo dati fiscali + Openapi).
 * - Un controllo a pagamento per dato: si ripete solo se il dato cambia.
 * - "Inesistente" o "cessata" toglie il profilo dalla ricerca finché non si
 *   corregge; "servizio che non risponde" non blocca: si riprova dopo.
 * - Senza `OPENAPI_TOKEN` non si controlla nulla e non si blocca nulla.
 */
@Injectable()
export class TaxIdCheckService {
  private readonly logger = new Logger(TaxIdCheckService.name);
  private readonly provider: TaxIdProvider | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.provider = taxIdProviderFromEnv();
  }

  get configured(): boolean {
    return this.provider !== null;
  }

  /** Allinea i controlli ai dati fiscali appena salvati e controlla subito quelli nuovi o cambiati. */
  async syncForFiscalProfile(fiscalProfileId: string, changedByUserId: string | null): Promise<TaxIdCheck[]> {
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({ where: { id: fiscalProfileId }, include: { taxIdChecks: true } });
    if (!fiscal) return [];
    const wanted = wantedTaxIdChecks(fiscal);
    await this.prisma.taxIdCheck.deleteMany({ where: { fiscalProfileId, kind: { notIn: wanted.map((w) => w.kind) } } });
    const now = new Date();
    for (const { kind, value } of wanted) {
      const existing = fiscal.taxIdChecks.find((check) => check.kind === kind);
      const sameValue = existing?.value === value;
      if (sameValue && existing.status !== "PENDING") continue;
      if (sameValue && existing.nextAttemptAt && existing.nextAttemptAt > now) continue;
      if (sameValue && existing.attempts >= MAX_TAX_ID_ATTEMPTS) continue;
      const row = existing
        ? sameValue
          ? existing
          : await this.prisma.taxIdCheck.update({
              where: { id: existing.id },
              data: { value, status: "PENDING", detail: null, officialName: null, attempts: 0, checkedAt: null, nextAttemptAt: null },
            })
        : await this.prisma.taxIdCheck.create({ data: { fiscalProfileId, kind, value } });
      await this.run(row, changedByUserId, false);
    }
    return this.prisma.taxIdCheck.findMany({ where: { fiscalProfileId }, orderBy: { kind: "asc" } });
  }

  /** Nuovo tentativo per i controlli rimasti in sospeso (servizio irraggiungibile o chiavi aggiunte dopo). */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async retryPending(): Promise<void> {
    if (!this.provider) return;
    const now = new Date();
    const rows = await this.prisma.taxIdCheck.findMany({
      where: { status: "PENDING", attempts: { lt: MAX_TAX_ID_ATTEMPTS }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      orderBy: { updatedAt: "asc" },
      take: 25,
    });
    for (const row of rows) {
      await this.run(row, null, true).catch((error) => this.logger.error(`Controllo ${row.kind} non riuscito`, error));
    }
  }

  private async run(row: TaxIdCheck, changedByUserId: string | null, notifyIfInvalid: boolean): Promise<TaxIdCheck> {
    if (!this.provider) return row;
    const now = new Date();
    let lookup;
    try {
      lookup = row.kind === "CODICE_FISCALE" ? await this.provider.checkCodiceFiscale(row.value) : await this.provider.checkPartitaIva(row.value);
    } catch (error) {
      const attempts = row.attempts + 1;
      this.logger.warn(`${row.kind} non controllato (tentativo ${attempts}): ${error instanceof TaxIdProviderUnavailableError ? error.message : String(error)}`);
      return this.prisma.taxIdCheck.update({ where: { id: row.id }, data: { attempts, nextAttemptAt: nextTaxIdAttempt(attempts, now) } });
    }
    const updated = await this.prisma.taxIdCheck.update({
      where: { id: row.id },
      data: {
        status: lookup.outcome,
        detail: lookup.detail ?? null,
        officialName: lookup.officialName ?? null,
        provider: this.provider.name,
        checkedAt: now,
        attempts: row.attempts + 1,
        nextAttemptAt: null,
      },
    });
    // Prova della dovuta diligenza DAC7: esito e data di ogni controllo.
    await this.auditLogService.record({
      entityType: "ProfessionalFiscalProfile",
      entityId: row.fiscalProfileId,
      fieldName: row.kind === "CODICE_FISCALE" ? "taxIdCheck.codiceFiscale" : "taxIdCheck.partitaIva",
      oldValue: row.status,
      newValue: lookup.outcome,
      changedByUserId,
      reason: `Controllo ${this.provider.name}${lookup.detail ? `: ${lookup.detail}` : ""}`,
    });
    if (notifyIfInvalid && lookup.outcome === "INVALID") {
      const owner = await this.prisma.professionalFiscalProfile.findUnique({
        where: { id: row.fiscalProfileId },
        select: { professionalProfile: { select: { userId: true } } },
      });
      if (owner) await this.notificationsService.notify(owner.professionalProfile.userId, "TAX_ID_INVALID", { kind: row.kind });
    }
    return updated;
  }
}

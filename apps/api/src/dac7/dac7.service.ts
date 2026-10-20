import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { dac7AnnualDeadline, dac7Entries, maskIban, type Dac7YearSummary, type PlatformDac7SettingsInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { decryptFiscal } from "../common/fiscal-crypto";

type Dac7Aggregate = {
  considerationEurCents: number;
  directConsiderationEurCents: number;
  onlineConsiderationEurCents: number;
  numberOfTransactions: number;
  feesWithheldEurCents: number;
};

type QuarterValues = Partial<Record<1 | 2 | 3 | 4, number>>;
type QuarterBreakdown = { consideration: QuarterValues; activities: QuarterValues; fees: QuarterValues; direct: QuarterValues; online: QuarterValues };

function quarterAmounts(values: QuarterValues | undefined): Dac7XmlQuarterAmounts {
  return { q1: values?.[1] ?? null, q2: values?.[2] ?? null, q3: values?.[3] ?? null, q4: values?.[4] ?? null };
}

function emptyAggregate(): Dac7Aggregate {
  return { considerationEurCents: 0, directConsiderationEurCents: 0, onlineConsiderationEurCents: 0, numberOfTransactions: 0, feesWithheldEurCents: 0 };
}
import { buildDac7Xml, type Dac7XmlPayload, type Dac7XmlQuarterAmounts, type Dac7XmlSeller } from "./dac7-xml.util";

/**
 * DAC7 — rendicontazione fiscale UE per piattaforme digitali che facilitano
 * servizi (anche offline, come un intervento a domicilio) — CLAUDE.md §88.
 * Aggrega i JobPayment CONFIRMED per professionista+periodo (trimestre per
 * l'aggregazione interna, anno per la dichiarazione vera — scadenza 31
 * gennaio dell'anno successivo, calcolata mai hardcodata).
 *
 * `Dac7Rule.includeDirectPayments` (config, mai hardcoded) decide se i
 * pagamenti DIRECT contano nella "consideration" — punto esplicitamente
 * segnalato dalla specifica come da confermare con un commercialista prima
 * del lancio (CLAUDE.md §88, §74 della specifica originale).
 *
 * Nessuna generazione/invio reale di una dichiarazione all'Agenzia delle
 * Entrate: `generateExport` produce un JSON strutturato + una bozza XML
 * (`dac7-xml.util.ts`) che rispecchia lo schema OECD DPI (v1) da cui il
 * tracciato italiano è derivato — un esempio reale di quello schema è stato
 * fornito dall'utente e ha guidato sia i nuovi campi raccolti in
 * `/dashboard/fiscale` (stato di rilascio del TIN, numero civico separato,
 * Codice LEI, Stati membri UE aggiuntivi) sia la struttura dell'export
 * (MessageSpec/Platform, scomposizione Consideration/NumberOfActivities per
 * trimestre solare — non solo un totale annuale). Resta dichiaratamente una
 * bozza, NON il tracciato ufficiale DPI23/XSD validato dall'Agenzia delle
 * Entrate (il ramo Entity per un'impresa/società è costruito per analogia,
 * mai mostrato nell'esempio fornito — vedi il disclaimer in
 * `dac7-xml.util.ts`): produrre un file che finge di essere validato senza
 * esserlo davvero sarebbe più dannoso che non produrlo affatto.
 * `PlatformDac7Settings` (SendingEntityIN/PlatformName/PlatformID) sono
 * dati richiesti dallo schema per costruire un MessageRefId valido — mai
 * hardcoded, configurabili solo da admin (`getPlatformSettings`/
 * `setPlatformSettings`), segnalati come mancanti nell'export invece di
 * bloccarlo silenziosamente.
 * `markSubmitted`/`correctPeriod` restano azioni manuali dell'admin, mai
 * automatiche — nessuna integrazione reale con il Desktop Telematico.
 */
@Injectable()
export class Dac7Service implements OnModuleInit {
  private readonly logger = new Logger(Dac7Service.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit() {
    const existing = await this.prisma.dac7Rule.findFirst();
    if (!existing) {
      await this.prisma.dac7Rule.create({ data: {} });
      this.logger.log("Regola DAC7 di default creata (includeDirectPayments: true).");
    }
  }

  async getRule() {
    const rule = await this.prisma.dac7Rule.findFirst();
    if (rule) return rule;
    return this.prisma.dac7Rule.create({ data: {} });
  }

  async setRule(includeDirectPayments: boolean) {
    const rule = await this.getRule();
    return this.prisma.dac7Rule.update({ where: { id: rule.id }, data: { includeDirectPayments } });
  }

  /** Identità della piattaforma (MessageSpec/Platform dello schema OECD DPI) — riga singola, mai hardcoded. */
  async getPlatformSettings() {
    const settings = await this.prisma.platformDac7Settings.findFirst();
    if (settings) return settings;
    return this.prisma.platformDac7Settings.create({ data: {} });
  }

  async setPlatformSettings(input: PlatformDac7SettingsInput) {
    const settings = await this.getPlatformSettings();
    return this.prisma.platformDac7Settings.update({
      where: { id: settings.id },
      data: {
        sendingEntityIn: input.sendingEntityIn ?? settings.sendingEntityIn,
        platformName: input.platformName ?? settings.platformName,
        platformIdValue: input.platformIdValue ?? settings.platformIdValue,
        platformIdType: input.platformIdType ?? settings.platformIdType,
        transmittingCountry: input.transmittingCountry ?? settings.transmittingCountry,
        receivingCountry: input.receivingCountry ?? settings.receivingCountry,
      },
    });
  }

  private quarterRange(year: number, quarter: number): { start: Date; end: Date } {
    const startMonth = (quarter - 1) * 3;
    return { start: new Date(Date.UTC(year, startMonth, 1)), end: new Date(Date.UTC(year, startMonth + 3, 1)) };
  }

  private yearRange(year: number): { start: Date; end: Date } {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }

  /**
   * Ricalcola da zero le righe Dac7Record di un periodo (trimestre o anno)
   * — mai un incremento in place: ogni run riflette lo stato reale corrente
   * dei JobPayment, evitando derive da eventuali ricalcoli parziali persi.
   * Diretti e online separati (docs/CHANGELOG.md §246); le regole su cosa
   * conta e in quale giorno stanno in `dac7Entries` (packages/shared).
   */
  private async aggregate(range: { start: Date; end: Date }, includeDirectPayments: boolean) {
    const inRange = { gte: range.start, lt: range.end };
    const jobPayments = await this.prisma.jobPayment.findMany({
      where: {
        OR: [
          { paymentMethod: "DIRECT", status: { in: ["CONFIRMED", "AWAITING_CONFIRMATION"] } },
          // REFUNDED: l'eventuale saldo pagato direttamente resta (dac7Entries).
          { paymentMethod: "MANOVIA", status: { in: ["CONFIRMED", "REFUNDED"] } },
        ],
        AND: [
          {
            OR: [
              { directReportedAt: inRange },
              { releasedAt: inRange },
              { booking: { professionalCompletedAt: inRange } },
              { directReportedAt: null, releasedAt: null, updatedAt: inRange },
            ],
          },
        ],
      },
      include: { booking: { select: { professionalProfileId: true, finalAmountEurCents: true, professionalCompletedAt: true } } },
    });

    const byProfessional = new Map<string, Dac7Aggregate>();
    for (const jp of jobPayments) {
      const entries = dac7Entries(jp, includeDirectPayments).filter((e) => e.date >= range.start && e.date < range.end);
      if (entries.length === 0) continue;
      const professionalProfileId = jp.booking.professionalProfileId;
      const agg = byProfessional.get(professionalProfileId) ?? emptyAggregate();
      for (const entry of entries) {
        agg.directConsiderationEurCents += entry.directEurCents;
        agg.onlineConsiderationEurCents += entry.onlineEurCents;
        agg.feesWithheldEurCents += entry.feesEurCents;
      }
      agg.considerationEurCents = agg.directConsiderationEurCents + agg.onlineConsiderationEurCents;
      agg.numberOfTransactions += 1;
      byProfessional.set(professionalProfileId, agg);
    }
    return byProfessional;
  }

  private async upsertPeriodRecords(periodId: string, byProfessional: Map<string, Dac7Aggregate>) {
    for (const [professionalProfileId, agg] of byProfessional) {
      const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { fiscalDataCompleteAt: true } });
      // Dati DAC7 compilati (`fiscalDataCompleteAt`, docs/CHANGELOG.md §241),
      // non più la verifica manuale dell'admin che Didit sostituisce.
      const missingFiscalData = !fiscalProfile?.fiscalDataCompleteAt;
      await this.prisma.dac7Record.upsert({
        where: { reportingPeriodId_professionalProfileId: { reportingPeriodId: periodId, professionalProfileId } },
        update: { ...agg, missingFiscalData },
        create: { reportingPeriodId: periodId, professionalProfileId, ...agg, missingFiscalData },
      });
    }
    // Chi non ha più importi nel periodo (rimborso, lavoro riaperto) torna a
    // zero invece di tenere il vecchio totale.
    await this.prisma.dac7Record.updateMany({
      where: { reportingPeriodId: periodId, professionalProfileId: { notIn: [...byProfessional.keys()] } },
      data: emptyAggregate(),
    });
  }

  async aggregateQuarter(year: number, quarter: number) {
    const rule = await this.getRule();
    const period = await this.prisma.dac7ReportingPeriod.upsert({
      where: { year_quarter: { year, quarter } },
      update: {},
      create: { year, quarter, status: "OPEN" },
    });
    const agg = await this.aggregate(this.quarterRange(year, quarter), rule.includeDirectPayments);
    await this.upsertPeriodRecords(period.id, agg);
    return this.prisma.dac7ReportingPeriod.update({ where: { id: period.id }, data: { updatedAt: new Date() } });
  }

  async aggregateYear(year: number) {
    const rule = await this.getRule();
    // `upsert` con quarter=null nella chiave composita non è supportabile
    // (Prisma tratta un membro nullo di un @@unique come non utilizzabile
    // per una lookup unica — più NULL sono considerati distinti in SQL,
    // quindi non identificano una riga sola): find+create/update manuale
    // invece, unico punto di questo file che se ne discosta.
    let period = await this.prisma.dac7ReportingPeriod.findFirst({ where: { year, quarter: null } });
    if (!period) {
      period = await this.prisma.dac7ReportingPeriod.create({ data: { year, quarter: null, status: "OPEN" } });
    }
    const agg = await this.aggregate(this.yearRange(year), rule.includeDirectPayments);
    await this.upsertPeriodRecords(period.id, agg);
    return this.prisma.dac7ReportingPeriod.update({ where: { id: period.id }, data: { updatedAt: new Date() } });
  }

  /** Tiene aggiornato il trimestre e l'anno correnti — mai i periodi passati (quelli si aggiornano solo per correzione esplicita, vedi correctPeriod). */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyAggregation() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const quarterPeriod = await this.aggregateQuarter(year, quarter);
    const yearPeriod = await this.aggregateYear(year);
    this.logger.log(`Aggregazione DAC7 aggiornata per ${year} Q${quarter} e anno ${year}.`);
    return { quarterPeriod, yearPeriod };
  }

  async listPeriods() {
    return this.prisma.dac7ReportingPeriod.findMany({ orderBy: [{ year: "desc" }, { quarter: "desc" }] });
  }

  async getPeriod(id: string) {
    const period = await this.prisma.dac7ReportingPeriod.findUnique({
      where: { id },
      include: { records: { include: { professionalProfile: { include: { fiscalProfile: true } } }, orderBy: { considerationEurCents: "desc" } } },
    });
    if (!period) throw new NotFoundException("Periodo DAC7 non trovato.");
    return period;
  }

  /**
   * Righe dei 4 trimestri (aggregazione interna) di un anno, per
   * professionista — scomposizione Q1-Q4 dell'export ANNUALE (lo schema
   * OECD DPI chiede importi, numero di attività e commissioni per trimestre
   * solare) e riepilogo mostrato al professionista. Sola lettura: un
   * trimestre mai aggregato risulta assente (null).
   */
  private async getQuarterlyBreakdown(year: number): Promise<Map<string, QuarterBreakdown>> {
    const quarterPeriods = await this.prisma.dac7ReportingPeriod.findMany({
      where: { year, quarter: { in: [1, 2, 3, 4] } },
      include: { records: true },
    });
    const map = new Map<string, QuarterBreakdown>();
    for (const period of quarterPeriods) {
      if (period.quarter === null) continue;
      const q = period.quarter as 1 | 2 | 3 | 4;
      for (const record of period.records) {
        const entry = map.get(record.professionalProfileId) ?? { consideration: {}, activities: {}, fees: {}, direct: {}, online: {} };
        entry.consideration[q] = record.considerationEurCents;
        entry.activities[q] = record.numberOfTransactions;
        entry.fees[q] = record.feesWithheldEurCents;
        entry.direct[q] = record.directConsiderationEurCents;
        entry.online[q] = record.onlineConsiderationEurCents;
        map.set(record.professionalProfileId, entry);
      }
    }
    return map;
  }

  /**
   * Prima dell'export annuale si ricalcolano i trimestri dell'anno: il giro
   * notturno delle 1:00 aggiorna solo il trimestre in corso, quindi
   * l'ultimo giorno di ogni trimestre restava fuori. Un trimestre già
   * segnato come inviato non si tocca.
   */
  private async refreshQuartersOfYear(year: number, opts: { includeSubmitted?: boolean } = {}) {
    const sent = opts.includeSubmitted
      ? []
      : await this.prisma.dac7ReportingPeriod.findMany({ where: { year, quarter: { in: [1, 2, 3, 4] }, status: "SUBMITTED" }, select: { quarter: true } });
    const sentQuarters = new Set(sent.map((p) => p.quarter));
    for (const quarter of [1, 2, 3, 4]) {
      if (sentQuarters.has(quarter)) continue;
      if (new Date(Date.UTC(year, (quarter - 1) * 3, 1)) > new Date()) continue;
      await this.aggregateQuarter(year, quarter);
    }
  }

  private buildAddressFree(fp: {
    registeredStreet: string | null;
    registeredHouseNumber: string | null;
    registeredPostalCode: string | null;
    registeredCity: string | null;
    registeredProvince?: string | null;
  }): string | null {
    const streetLine = [fp.registeredStreet, fp.registeredHouseNumber].filter(Boolean).join(" ");
    // Provincia in sigla tra parentesi, come negli indirizzi italiani (docs/CHANGELOG.md §263).
    const cityLine = [fp.registeredPostalCode, fp.registeredCity, fp.registeredProvince ? `(${fp.registeredProvince})` : null].filter(Boolean).join(" ");
    const combined = [streetLine, cityLine].filter(Boolean).join(", ");
    return combined || null;
  }

  /**
   * Genera l'export (bozza JSON + bozza XML derivata dallo schema OECD DPI,
   * non il tracciato ufficiale DPI23/XSD validato — vedi il disclaimer in
   * cima al file e in `dac7-xml.util.ts`) e porta il periodo a EXPORTED.
   * Ricalcola un'ultima volta prima di generare, per riflettere l'ultimo
   * stato reale. Incrementa il contatore MessageRefId ad ogni chiamata
   * (mai un identificativo riutilizzato, stesso principio del vero schema).
   */
  async generateExport(id: string) {
    const period = await this.getPeriod(id);
    if (period.quarter !== null) {
      await this.aggregateQuarter(period.year, period.quarter);
    } else {
      await this.refreshQuartersOfYear(period.year);
      await this.aggregateYear(period.year);
    }
    const refreshed = await this.getPeriod(id);
    // IBAN (letto in chiaro solo qui, per il file) di chi ha incassato online.
    const payoutAccounts = await this.prisma.professionalPayoutAccount.findMany({
      where: { fiscalProfile: { professionalProfileId: { in: refreshed.records.map((r) => r.professionalProfileId) } } },
      include: { fiscalProfile: { select: { professionalProfileId: true } } },
    });
    const payoutByProfessional = new Map(payoutAccounts.map((acc) => [acc.fiscalProfile.professionalProfileId, acc]));

    const settingsBefore = await this.getPlatformSettings();
    const settings = await this.prisma.platformDac7Settings.update({
      where: { id: settingsBefore.id },
      data: { messageSequence: { increment: 1 } },
    });
    const platformSettingsIncomplete = !settings.sendingEntityIn || !settings.platformName || !settings.platformIdValue;
    const sendingEntityIn = settings.sendingEntityIn || "NON-CONFIGURATO";
    const messageRefId = `${settings.transmittingCountry}${refreshed.year}${sendingEntityIn}${String(settings.messageSequence).padStart(6, "0")}`;
    const reportingPeriodEndDate = `${refreshed.year}-12-31`;
    const timestamp = new Date().toISOString().slice(0, 19);

    const quarterlyBreakdown = refreshed.quarter === null ? await this.getQuarterlyBreakdown(refreshed.year) : null;

    const xmlSellers: Dac7XmlSeller[] = [];
    const jsonSellers = refreshed.records.map((r) => {
      const fp = r.professionalProfile.fiscalProfile;
      const addressFree = fp ? this.buildAddressFree(fp) : null;
      const issuedBy = fp?.fiscalIdIssuingCountry || fp?.taxResidenceCountry || "IT";

      let breakdown: QuarterBreakdown;
      if (refreshed.quarter === null) {
        breakdown = quarterlyBreakdown?.get(r.professionalProfileId) ?? { consideration: {}, activities: {}, fees: {}, direct: {}, online: {} };
      } else {
        const q = refreshed.quarter as 1 | 2 | 3 | 4;
        breakdown = {
          consideration: { [q]: r.considerationEurCents },
          activities: { [q]: r.numberOfTransactions },
          fees: { [q]: r.feesWithheldEurCents },
          direct: { [q]: r.directConsiderationEurCents },
          online: { [q]: r.onlineConsiderationEurCents },
        };
      }
      const considerationEurCents = quarterAmounts(breakdown.consideration);
      const numberOfActivities = quarterAmounts(breakdown.activities);
      const feesEurCents = quarterAmounts(breakdown.fees);

      // Conto su cui riceve i pagamenti online (DAC7 "identificativo del
      // conto finanziario", docs/CHANGELOG.md §246). Chi incassa solo in
      // diretto non ce l'ha: lì il campo resta vuoto.
      const payout = payoutByProfessional.get(r.professionalProfileId);
      const iban = payout ? decryptFiscal(payout.ibanEncrypted) : null;
      const financialIdentifier = payout && iban ? { iban, holderName: payout.holderName } : null;
      const missingIban = r.onlineConsiderationEurCents > 0 && !financialIdentifier;

      // PRIVATE_INDIVIDUAL e SOLE_PROPRIETOR sono entrambe persone fisiche
      // per lo schema OECD DPI (solo BUSINESS ha personalità giuridica
      // propria, ramo "entity" sotto) — un SOLE_PROPRIETOR (Professionista,
      // persona fisica con P.IVA) riporta comunque la Partita IVA come TIN
      // quando disponibile, invece del solo codice fiscale.
      const individual =
        fp && fp.entityType !== "BUSINESS"
          ? {
              firstName: fp.fiscalFirstName,
              lastName: fp.fiscalLastName,
              birthDate: fp.dateOfBirth ? fp.dateOfBirth.toISOString().slice(0, 10) : null,
              birthPlace: fp.placeOfBirth,
              birthCountry: fp.countryOfBirth,
              tinType: "OECD202",
              tinIssuedBy: issuedBy,
              tinValue: (fp.entityType === "SOLE_PROPRIETOR" && fp.vatNumber) || fp.fiscalCodiceFiscale,
              addressCountryCode: fp.registeredCountry,
              addressFree,
            }
          : null;
      const entity =
        fp?.entityType === "BUSINESS"
          ? {
              name: fp.businessName,
              legalForm: fp.legalForm,
              tinType: "OECD202",
              tinIssuedBy: issuedBy,
              tinValue: fp.vatNumber,
              legalRegistrationNumber: fp.businessRegistrationNumber,
              leiCode: fp.leiCode,
              addressCountryCode: fp.registeredCountry,
              addressFree,
              additionalEuStates: fp.additionalEuStates ?? [],
            }
          : null;

      xmlSellers.push({ professionalProfileId: r.professionalProfileId, individual, entity, financialIdentifier, considerationEurCents, numberOfActivities, feesEurCents });

      return {
        professionalProfileId: r.professionalProfileId,
        businessName: r.professionalProfile.businessName,
        entityType: fp?.entityType ?? null,
        individual,
        entity,
        considerationByQuarterEurCents: considerationEurCents,
        directConsiderationByQuarterEurCents: quarterAmounts(breakdown.direct),
        onlineConsiderationByQuarterEurCents: quarterAmounts(breakdown.online),
        feesByQuarterEurCents: feesEurCents,
        numberOfActivitiesByQuarter: numberOfActivities,
        financialIdentifier: financialIdentifier ? { iban: financialIdentifier.iban, holderName: financialIdentifier.holderName, stripeCheck: payout?.stripeCheck ?? null } : null,
        missingIban,
        considerationTotalEurCents: r.considerationEurCents,
        directConsiderationTotalEurCents: r.directConsiderationEurCents,
        onlineConsiderationTotalEurCents: r.onlineConsiderationEurCents,
        numberOfTransactionsTotal: r.numberOfTransactions,
        feesWithheldEurCents: r.feesWithheldEurCents,
        missingFiscalData: r.missingFiscalData,
      };
    });

    const xmlPayload: Dac7XmlPayload = {
      sendingEntityIn,
      transmittingCountry: settings.transmittingCountry,
      receivingCountry: settings.receivingCountry,
      messageType: "DPI401",
      messageRefId,
      reportingPeriodEndDate,
      timestamp,
      platformName: settings.platformName ?? "",
      platformIdType: settings.platformIdType,
      platformIdValue: settings.platformIdValue ?? "",
      sellers: xmlSellers,
    };

    const exportPayload = {
      note: "Bozza JSON + bozza XML derivata dallo schema OECD DPI (v1) — non il tracciato ufficiale DPI23/XSD validato dall'Agenzia delle Entrate. Il ramo Individual rispecchia un esempio reale fornito; il ramo Entity (impresa/società) è per analogia, non verificato — vedi dac7-xml.util.ts.",
      platformSettingsIncomplete,
      messageSpec: { sendingEntityIn, transmittingCountry: settings.transmittingCountry, receivingCountry: settings.receivingCountry, messageType: "DPI401", messageRefId, reportingPeriodEndDate, timestamp },
      reportingPeriod: { year: refreshed.year, quarter: refreshed.quarter, reportVersion: refreshed.reportVersion },
      annualDeadline: dac7AnnualDeadline(refreshed.year),
      sellers: jsonSellers,
      xml: buildDac7Xml(xmlPayload),
    };

    await this.prisma.dac7ReportingPeriod.update({ where: { id }, data: { status: "EXPORTED", generatedAt: new Date() } });
    return exportPayload;
  }

  /** Azione manuale dell'admin — nessuna integrazione reale con il Desktop Telematico dell'Agenzia delle Entrate. */
  async markSubmitted(id: string) {
    const period = await this.getPeriod(id);
    if (period.status !== "EXPORTED") {
      throw new BadRequestException("Il periodo deve essere prima esportato.");
    }
    const updated = await this.prisma.dac7ReportingPeriod.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    // Comunicazione annuale inviata: ogni professionista riceve l'avviso
    // con i suoi dati, come chiede la direttiva (docs/CHANGELOG.md §246).
    // Dopo una correzione l'avviso riparte per tutti, come "dati corretti".
    if (updated.quarter === null) await this.notifySellers(id, { resend: updated.reportVersion > 1 });
    return updated;
  }

  /**
   * Avviso annuale ai professionisti (DAC7, art. 8 bis ter, par. 2, lett. c
   * della direttiva 2011/16/UE): entro il 31 gennaio la piattaforma comunica a
   * ogni venditore i dati trasmessi su di lui. Una volta per professionista e
   * anno (`sellerNotifiedAt`); dopo una correzione l'admin può rimandarlo.
   * Il dettaglio è nella pagina "Riepilogo DAC7", l'email rimanda lì.
   */
  async notifySellers(id: string, opts: { resend?: boolean } = {}) {
    const period = await this.getPeriod(id);
    if (period.quarter !== null) throw new BadRequestException("L'avviso ai professionisti si manda per l'anno intero, non per un trimestre.");
    if (period.status !== "SUBMITTED" && period.status !== "CORRECTED") {
      throw new BadRequestException("Prima segna come inviata la comunicazione dell'anno all'Agenzia delle Entrate.");
    }
    let sent = 0;
    for (const record of period.records) {
      if (record.considerationEurCents <= 0 && record.numberOfTransactions === 0) continue;
      if (record.sellerNotifiedAt && !opts.resend) continue;
      await this.notificationsService.notify(record.professionalProfile.userId, "DAC7_ANNUAL_NOTICE", {
        year: period.year,
        totalEurCents: record.considerationEurCents,
        corrected: Boolean(record.sellerNotifiedAt),
      });
      await this.prisma.dac7Record.update({ where: { id: record.id }, data: { sellerNotifiedAt: new Date() } });
      sent += 1;
    }
    this.logger.log(`Avviso DAC7 ${period.year} inviato a ${sent} professionisti.`);
    return { sent };
  }

  /**
   * Riepilogo DAC7 del professionista, anno per anno: trimestri con diretti e
   * online, commissioni, lavori; se e quando è stato comunicato. Dati di
   * sola lettura dai Dac7Record (aggiornati ogni notte), mai ricalcolati qui.
   */
  async summaryForProfessional(userId: string): Promise<{ years: Dac7YearSummary[]; maskedIban: string | null }> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, fiscalProfile: { select: { payoutAccount: { select: { ibanCountry: true, ibanLast4: true } } } } },
    });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    const records = await this.prisma.dac7Record.findMany({
      where: { professionalProfileId: profile.id },
      include: { reportingPeriod: true },
    });
    const years = new Map<number, Dac7YearSummary>();
    const yearOf = (year: number) => {
      const existing = years.get(year);
      if (existing) return existing;
      const created: Dac7YearSummary = { year, quarters: [], totalEurCents: 0, submittedAt: null, notifiedAt: null };
      years.set(year, created);
      return created;
    };
    for (const record of records) {
      const period = record.reportingPeriod;
      const summary = yearOf(period.year);
      if (period.quarter === null) {
        summary.submittedAt = period.status === "SUBMITTED" || period.status === "CORRECTED" ? (period.submittedAt?.toISOString() ?? null) : null;
        summary.notifiedAt = record.sellerNotifiedAt?.toISOString() ?? null;
      } else {
        summary.quarters.push({
          quarter: period.quarter as 1 | 2 | 3 | 4,
          directEurCents: record.directConsiderationEurCents,
          onlineEurCents: record.onlineConsiderationEurCents,
          feesEurCents: record.feesWithheldEurCents,
          jobs: record.numberOfTransactions,
        });
      }
    }
    const list = [...years.values()]
      .map((y) => ({
        ...y,
        quarters: y.quarters.sort((a, b) => a.quarter - b.quarter),
        totalEurCents: y.quarters.reduce((sum, q) => sum + q.directEurCents + q.onlineEurCents, 0),
      }))
      .filter((y) => y.quarters.some((q) => q.jobs > 0) || y.totalEurCents > 0)
      .sort((a, b) => b.year - a.year);
    const payout = profile.fiscalProfile?.payoutAccount;
    return { years: list, maskedIban: payout ? maskIban(payout.ibanCountry, payout.ibanLast4) : null };
  }

  /** Correzione dopo un invio — mai in place, `reportVersion` incrementa (richiesta esplicita della specifica). */
  async correctPeriod(id: string) {
    const period = await this.getPeriod(id);
    if (period.status !== "SUBMITTED" && period.status !== "REJECTED") {
      throw new BadRequestException("Solo un periodo già inviato (o rifiutato) può essere corretto.");
    }
    if (period.quarter !== null) {
      await this.aggregateQuarter(period.year, period.quarter);
    } else {
      // Anche i trimestri: l'export annuale li usa per la scomposizione.
      await this.refreshQuartersOfYear(period.year, { includeSubmitted: true });
      await this.aggregateYear(period.year);
    }
    return this.prisma.dac7ReportingPeriod.update({
      where: { id },
      data: { status: "CORRECTED", reportVersion: { increment: 1 }, needsCorrectionAt: null },
    });
  }

  /**
   * Periodo per l'area admin: nome del professionista e IBAN mancante per
   * riga (docs/CHANGELOG.md §247), senza i dati fiscali completi.
   */
  async getPeriodForAdmin(id: string) {
    const period = await this.prisma.dac7ReportingPeriod.findUnique({
      where: { id },
      include: {
        records: {
          include: { professionalProfile: { select: { businessName: true, fiscalProfile: { select: { payoutAccount: { select: { id: true } } } } } } },
          orderBy: { considerationEurCents: "desc" },
        },
      },
    });
    if (!period) throw new NotFoundException("Periodo DAC7 non trovato.");
    return {
      ...period,
      records: period.records.map(({ professionalProfile, ...record }) => ({
        ...record,
        businessName: professionalProfile.businessName,
        missingIban: record.onlineConsiderationEurCents > 0 && !professionalProfile.fiscalProfile?.payoutAccount,
      })),
    };
  }

  /**
   * Ogni notte: un anno già comunicato i cui importi oggi risultano diversi
   * (rimborso dopo l'accredito, lavoro riaperto) va corretto. Si segna e si
   * avvisa la Finanza una volta; la correzione resta un'azione dell'admin
   * (docs/CHANGELOG.md §247).
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async checkSubmittedYears(): Promise<number[]> {
    const rule = await this.getRule();
    const periods = await this.prisma.dac7ReportingPeriod.findMany({
      where: { quarter: null, status: { in: ["SUBMITTED", "CORRECTED"] }, needsCorrectionAt: null },
      include: { records: true },
    });
    const flagged: number[] = [];
    for (const period of periods) {
      const current = await this.aggregate(this.yearRange(period.year), rule.includeDirectPayments);
      const stored = new Map(period.records.map((r) => [r.professionalProfileId, r]));
      const keys = new Set([...current.keys(), ...stored.keys()]);
      const changed = [...keys].some((key) => {
        const a = current.get(key) ?? emptyAggregate();
        const b = stored.get(key) ?? emptyAggregate();
        return (
          a.directConsiderationEurCents !== b.directConsiderationEurCents ||
          a.onlineConsiderationEurCents !== b.onlineConsiderationEurCents ||
          a.feesWithheldEurCents !== b.feesWithheldEurCents ||
          a.numberOfTransactions !== b.numberOfTransactions
        );
      });
      if (!changed) continue;
      await this.prisma.dac7ReportingPeriod.update({ where: { id: period.id }, data: { needsCorrectionAt: new Date() } });
      await this.notifyFinanceAdmins("ADMIN_DAC7_NEEDS_CORRECTION", { year: period.year });
      flagged.push(period.year);
    }
    if (flagged.length > 0) this.logger.warn(`DAC7 da correggere: ${flagged.join(", ")}.`);
    return flagged;
  }

  /**
   * Promemoria del 1° novembre (docs/CHANGELOG.md §247): a chi ha compensi
   * nell'anno ma non ha ancora i dati fiscali o l'IBAN dei pagamenti online,
   * così li sistema prima della comunicazione di gennaio.
   */
  @Cron("0 9 1 11 *")
  async sendYearEndReminders(now: Date = new Date()): Promise<number> {
    const year = now.getUTCFullYear();
    const period = await this.aggregateYear(year);
    const records = await this.prisma.dac7Record.findMany({
      where: { reportingPeriodId: period.id, considerationEurCents: { gt: 0 } },
      include: { professionalProfile: { select: { userId: true, fiscalProfile: { select: { payoutAccount: { select: { id: true } } } } } } },
    });
    let sent = 0;
    for (const record of records) {
      const missingIban = record.onlineConsiderationEurCents > 0 && !record.professionalProfile.fiscalProfile?.payoutAccount;
      if (!record.missingFiscalData && !missingIban) continue;
      await this.notificationsService.notify(record.professionalProfile.userId, "DAC7_DATA_REMINDER", {
        year,
        missingFiscalData: record.missingFiscalData,
        missingIban,
      });
      sent += 1;
    }
    this.logger.log(`Promemoria DAC7 ${year} inviato a ${sent} professionisti.`);
    return sent;
  }

  /** Avviso agli admin Finanza (o senza ruoli specifici / SUPER), come per i pagamenti. */
  private async notifyFinanceAdmins(type: "ADMIN_DAC7_NEEDS_CORRECTION", payload: Record<string, unknown>): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER") || roles.includes("FINANCE")) {
        await this.notificationsService.notify(admin.id, type, payload as never);
      }
    }
  }
}

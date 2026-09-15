import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import type { PlatformDac7SettingsInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
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

  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

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
   */
  private async aggregate(range: { start: Date; end: Date }, includeDirectPayments: boolean) {
    const methods: ("MANOVIA" | "DIRECT")[] = includeDirectPayments ? ["MANOVIA", "DIRECT"] : ["MANOVIA"];
    const jobPayments = await this.prisma.jobPayment.findMany({
      where: { status: "CONFIRMED", paymentMethod: { in: methods }, updatedAt: { gte: range.start, lt: range.end } },
      include: { booking: { select: { professionalProfileId: true } } },
    });

    const byProfessional = new Map<string, { considerationEurCents: number; numberOfTransactions: number; feesWithheldEurCents: number }>();
    for (const jp of jobPayments) {
      const professionalProfileId = jp.booking.professionalProfileId;
      const entry = byProfessional.get(professionalProfileId) ?? { considerationEurCents: 0, numberOfTransactions: 0, feesWithheldEurCents: 0 };
      entry.considerationEurCents += jp.netAmountEurCents;
      entry.numberOfTransactions += 1;
      entry.feesWithheldEurCents += jp.platformFeeEurCents;
      byProfessional.set(professionalProfileId, entry);
    }
    return byProfessional;
  }

  private async upsertPeriodRecords(periodId: string, byProfessional: Map<string, { considerationEurCents: number; numberOfTransactions: number; feesWithheldEurCents: number }>) {
    for (const [professionalProfileId, agg] of byProfessional) {
      const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId } });
      await this.prisma.dac7Record.upsert({
        where: { reportingPeriodId_professionalProfileId: { reportingPeriodId: periodId, professionalProfileId } },
        update: { ...agg, missingFiscalData: fiscalProfile?.verificationStatus !== "VERIFIED" },
        create: { reportingPeriodId: periodId, professionalProfileId, ...agg, missingFiscalData: fiscalProfile?.verificationStatus !== "VERIFIED" },
      });
    }
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
      include: { records: { include: { professionalProfile: { include: { fiscalProfile: true } } } } },
    });
    if (!period) throw new NotFoundException("Periodo DAC7 non trovato.");
    return period;
  }

  /**
   * Righe dei 4 trimestri (aggregazione interna) di un anno già calcolate,
   * per professionista — usata solo per popolare la scomposizione
   * Q1-Q4 dell'export ANNUALE (lo schema OECD DPI richiede la
   * "consideration" scomposta per trimestre solare, non solo un totale
   * annuale — vedi l'esempio XML in `dac7-xml.util.ts`). Sola lettura, non
   * forza un'aggregazione dei trimestri mancanti: un trimestre mai
   * aggregato risulta semplicemente assente (null) nell'export.
   */
  private async getQuarterlyBreakdown(year: number): Promise<Map<string, { consideration: Partial<Record<1 | 2 | 3 | 4, number>>; activities: Partial<Record<1 | 2 | 3 | 4, number>> }>> {
    const quarterPeriods = await this.prisma.dac7ReportingPeriod.findMany({
      where: { year, quarter: { in: [1, 2, 3, 4] } },
      include: { records: true },
    });
    const map = new Map<string, { consideration: Partial<Record<1 | 2 | 3 | 4, number>>; activities: Partial<Record<1 | 2 | 3 | 4, number>> }>();
    for (const period of quarterPeriods) {
      if (period.quarter === null) continue;
      const q = period.quarter as 1 | 2 | 3 | 4;
      for (const record of period.records) {
        const entry = map.get(record.professionalProfileId) ?? { consideration: {}, activities: {} };
        entry.consideration[q] = record.considerationEurCents;
        entry.activities[q] = record.numberOfTransactions;
        map.set(record.professionalProfileId, entry);
      }
    }
    return map;
  }

  private buildAddressFree(fp: { registeredStreet: string | null; registeredHouseNumber: string | null; registeredPostalCode: string | null; registeredCity: string | null }): string | null {
    const streetLine = [fp.registeredStreet, fp.registeredHouseNumber].filter(Boolean).join(" ");
    const cityLine = [fp.registeredPostalCode, fp.registeredCity].filter(Boolean).join(" ");
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
      await this.aggregateYear(period.year);
    }
    const refreshed = await this.getPeriod(id);

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

      let considerationEurCents: Dac7XmlQuarterAmounts;
      let numberOfActivities: Dac7XmlQuarterAmounts;
      if (refreshed.quarter === null) {
        const breakdown = quarterlyBreakdown?.get(r.professionalProfileId);
        considerationEurCents = { q1: breakdown?.consideration[1] ?? null, q2: breakdown?.consideration[2] ?? null, q3: breakdown?.consideration[3] ?? null, q4: breakdown?.consideration[4] ?? null };
        numberOfActivities = { q1: breakdown?.activities[1] ?? null, q2: breakdown?.activities[2] ?? null, q3: breakdown?.activities[3] ?? null, q4: breakdown?.activities[4] ?? null };
      } else {
        const zeroed: Dac7XmlQuarterAmounts = { q1: null, q2: null, q3: null, q4: null };
        considerationEurCents = { ...zeroed, [`q${refreshed.quarter}`]: r.considerationEurCents };
        numberOfActivities = { ...zeroed, [`q${refreshed.quarter}`]: r.numberOfTransactions };
      }

      const individual =
        fp?.entityType === "INDIVIDUAL"
          ? {
              firstName: fp.fiscalFirstName,
              lastName: fp.fiscalLastName,
              birthDate: fp.dateOfBirth ? fp.dateOfBirth.toISOString().slice(0, 10) : null,
              birthPlace: fp.placeOfBirth,
              birthCountry: fp.countryOfBirth,
              tinType: "OECD202",
              tinIssuedBy: issuedBy,
              tinValue: fp.fiscalCodiceFiscale,
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

      xmlSellers.push({ professionalProfileId: r.professionalProfileId, individual, entity, considerationEurCents, numberOfActivities });

      return {
        professionalProfileId: r.professionalProfileId,
        businessName: r.professionalProfile.businessName,
        entityType: fp?.entityType ?? null,
        individual,
        entity,
        considerationByQuarterEurCents: considerationEurCents,
        numberOfActivitiesByQuarter: numberOfActivities,
        considerationTotalEurCents: r.considerationEurCents,
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
      annualDeadline: `${refreshed.year + 1}-01-31`,
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
    return this.prisma.dac7ReportingPeriod.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
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
      await this.aggregateYear(period.year);
    }
    return this.prisma.dac7ReportingPeriod.update({
      where: { id },
      data: { status: "CORRECTED", reportVersion: { increment: 1 } },
    });
  }
}

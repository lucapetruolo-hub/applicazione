import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

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
 * Entrate: `generateExport` produce un JSON strutturato con i campi
 * richiesti da DAC7 (identità, TIN/P.IVA, indirizzo, consideration, numero
 * di transazioni, commissioni trattenute) — dichiaratamente una bozza
 * interna, NON il tracciato ufficiale DPI23 (di cui questa sessione non ha
 * la specifica esatta): produrre un file che finge di essere quel formato
 * senza esserlo davvero sarebbe più dannoso che non produrlo affatto.
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
   * Genera l'export (bozza JSON, non il tracciato ufficiale DPI23 — vedi
   * commento in cima al file) e porta il periodo a EXPORTED. Ricalcola
   * un'ultima volta prima di generare, per riflettere l'ultimo stato reale.
   */
  async generateExport(id: string) {
    const period = await this.getPeriod(id);
    if (period.quarter !== null) {
      await this.aggregateQuarter(period.year, period.quarter);
    } else {
      await this.aggregateYear(period.year);
    }
    const refreshed = await this.getPeriod(id);

    const exportPayload = {
      note: "Bozza interna, non il tracciato ufficiale DPI23 dell'Agenzia delle Entrate — richiede integrazione con la specifica ufficiale prima dell'invio reale.",
      reportingPeriod: { year: refreshed.year, quarter: refreshed.quarter, reportVersion: refreshed.reportVersion },
      annualDeadline: `${refreshed.year + 1}-01-31`,
      sellers: refreshed.records.map((r) => ({
        professionalProfileId: r.professionalProfileId,
        businessName: r.professionalProfile.businessName,
        entityType: r.professionalProfile.fiscalProfile?.entityType ?? null,
        vatNumber: r.professionalProfile.fiscalProfile?.vatNumber ?? null,
        fiscalCodiceFiscale: r.professionalProfile.fiscalProfile?.fiscalCodiceFiscale ?? null,
        taxResidenceCountry: r.professionalProfile.fiscalProfile?.taxResidenceCountry ?? null,
        considerationEurCents: r.considerationEurCents,
        numberOfTransactions: r.numberOfTransactions,
        feesWithheldEurCents: r.feesWithheldEurCents,
        missingFiscalData: r.missingFiscalData,
      })),
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

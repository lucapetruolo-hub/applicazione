import { BadRequestException, Inject, Injectable, NotFoundException, Optional, type OnModuleInit } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  DEFAULT_CASHBOOK_SETTINGS,
  cashbookMonths,
  cashbookRegimeOf,
  cashbookTotals,
  cashbookYearCsv,
  coefficientPercentOf,
  estimateForfettarioTax,
  expenseCategoryLabel,
  forfettarioThresholdLevel,
  isIncome,
  vatInsideGross,
  type CashbookMovement,
  type CashbookOverview,
  type CashbookSettings,
  type CashbookToCollect,
  type ExpenseCategory,
  type ExpenseInput,
  type ForfettarioCoefficientKey,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { StatementsService } from "../accounting/statements.service";
import { romeDayIso, romeDayStart, romeMonthOf, romeMonthRange } from "../accounting/accounting-dates";
import { isOwnMediaUrl } from "../common/own-media-urls.pipe";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "../cloudinary/cloudinary.service";

/** Anni che la scheda accetta: dal primo anno del sito a quello in corso. */
const FIRST_YEAR = 2026;

/**
 * Entrate e uscite del professionista (docs/changelog/2026-11-19-entrate-e-uscite.md).
 *
 * Principio di cassa, come il forfettario: ogni soldo conta nel giorno in cui
 * si muove. I soldi del sito vengono da `StatementsService.cashMovements`, lo
 * stesso calcolo dell'estratto del mese, così le cifre coincidono; qui si
 * aggiungono i lavori fuori dal sito con un prezzo (se l'interruttore è
 * acceso) e le spese scritte a mano.
 */
@Injectable()
export class CashbookService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly statementsService: StatementsService,
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly cloudinaryService?: CloudinaryService,
  ) {}

  onModuleInit(): void {
    // Il foglio dell'anno va anche nell'email di gennaio al commercialista.
    this.statementsService.setYearCsvProvider((professionalProfileId, year) => this.yearCsvForProfile(professionalProfileId, year));
    // Chiusura dell'account: spese, foto degli scontrini e impostazioni si
    // cancellano subito, come dice la Privacy.
    this.authService?.onProfessionalAccountClosed((professionalProfileId) => this.deleteAllForClosedAccount(professionalProfileId));
  }

  async deleteAllForClosedAccount(professionalProfileId: string): Promise<void> {
    const photos = await this.prisma.professionalExpense.findMany({ where: { professionalProfileId, receiptPhotoUrl: { not: null } }, select: { receiptPhotoUrl: true } });
    await this.prisma.professionalExpense.deleteMany({ where: { professionalProfileId } });
    await this.prisma.professionalCashbookSettings.deleteMany({ where: { professionalProfileId } });
    for (const { receiptPhotoUrl } of photos) await this.cloudinaryService?.deleteImageByUrl(receiptPhotoUrl);
  }

  async profileIdOf(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return profile.id;
  }

  requireYear(year: number, now: Date = new Date()): void {
    const current = Number(romeMonthOf(now).slice(0, 4));
    if (!Number.isInteger(year) || year < FIRST_YEAR || year > current) throw new BadRequestException("Anno non valido.");
  }

  async settingsOf(professionalProfileId: string): Promise<CashbookSettings> {
    const row = await this.prisma.professionalCashbookSettings.findUnique({ where: { professionalProfileId } });
    if (!row) return DEFAULT_CASHBOOK_SETTINGS;
    const coefficient = row.taxCoefficient && coefficientPercentOf(row.taxCoefficient) !== null ? (row.taxCoefficient as ForfettarioCoefficientKey) : null;
    const rate = row.taxRatePercent === 5 || row.taxRatePercent === 15 ? row.taxRatePercent : null;
    const vat = [22, 10, 5, 4].includes(row.vatRatePercent) ? (row.vatRatePercent as CashbookSettings["vatRatePercent"]) : 22;
    return {
      includeExternalJobs: row.includeExternalJobs,
      taxEstimate: coefficient && rate ? { coefficient, ratePercent: rate } : null,
      vatRatePercent: vat,
    };
  }

  async updateSettings(userId: string, input: CashbookSettings): Promise<CashbookSettings> {
    const professionalProfileId = await this.profileIdOf(userId);
    const data = {
      includeExternalJobs: input.includeExternalJobs,
      taxCoefficient: input.taxEstimate?.coefficient ?? null,
      taxRatePercent: input.taxEstimate?.ratePercent ?? null,
      vatRatePercent: input.vatRatePercent,
    };
    await this.prisma.professionalCashbookSettings.upsert({ where: { professionalProfileId }, create: { professionalProfileId, ...data }, update: data });
    return this.settingsOf(professionalProfileId);
  }

  /**
   * Le entrate tra `start` (compreso) ed `end` (escluso), per le Statistiche:
   * soldi del sito e lavori fuori dal sito con l'interruttore acceso.
   */
  async incomeMovements(professionalProfileId: string, start: Date, end: Date): Promise<CashbookMovement[]> {
    const settings = await this.settingsOf(professionalProfileId);
    const [site, external] = await Promise.all([
      this.statementsService.cashMovements(professionalProfileId, start, end),
      settings.includeExternalJobs ? this.externalMovements(professionalProfileId, start, end) : Promise.resolve([]),
    ]);
    return [...site, ...external].filter((m) => isIncome(m.source));
  }

  /** Tutto l'anno: righe, mesi, da incassare, IVA, stima e soglia. */
  async overview(userId: string, year: number, now: Date = new Date()): Promise<CashbookOverview> {
    this.requireYear(year, now);
    const professionalProfileId = await this.profileIdOf(userId);
    const { start } = romeMonthRange(`${year}-01`);
    const { end } = romeMonthRange(`${year}-12`);
    const [settings, fiscal, site, expenses, toCollect, externalWithoutPrice] = await Promise.all([
      this.settingsOf(professionalProfileId),
      this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { entityType: true, chargesVat: true } }),
      this.statementsService.cashMovements(professionalProfileId, start, end),
      this.expenseMovements(professionalProfileId, year),
      this.toCollect(professionalProfileId),
      this.prisma.externalJob.count({ where: { professionalProfileId, status: "COMPLETED", scheduledAt: { gte: start, lt: end }, OR: [{ priceEurCents: null }, { priceEurCents: 0 }] } }),
    ]);
    const external = settings.includeExternalJobs ? await this.externalMovements(professionalProfileId, start, end) : [];
    const regime = cashbookRegimeOf(fiscal?.entityType, fiscal?.chargesVat);

    let movements: CashbookMovement[] = [...site, ...external, ...expenses].sort((a, b) => a.date.localeCompare(b.date) || sourceOrder(a) - sourceOrder(b));
    let incomeVatEurCents: number | null = null;
    if (regime === "VAT") {
      // Chi applica l'IVA incassa prezzi "IVA inclusa": l'IVA dentro le entrate va versata, non è un guadagno.
      movements = movements.map((m) => (isIncome(m.source) && m.vatEurCents === null ? { ...m, vatEurCents: vatInsideGross(m.amountEurCents, settings.vatRatePercent) } : m));
      incomeVatEurCents = movements.filter((m) => isIncome(m.source)).reduce((sum, m) => sum + (m.vatEurCents ?? 0), 0);
    }

    const totals = cashbookTotals(movements);
    const coefficientPercent = settings.taxEstimate ? coefficientPercentOf(settings.taxEstimate.coefficient) : null;
    const taxEstimate =
      regime === "FORFETTARIO" && settings.taxEstimate && coefficientPercent !== null
        ? estimateForfettarioTax({
            incomeEurCents: totals.incomeEurCents,
            socialSecurityPaidEurCents: movements.filter((m) => m.category === "SOCIAL_SECURITY").reduce((sum, m) => sum - m.amountEurCents, 0),
            coefficientPercent,
            ratePercent: settings.taxEstimate.ratePercent,
          })
        : null;

    return {
      year,
      regime,
      settings,
      months: cashbookMonths(year, movements),
      totals,
      movements,
      toCollect,
      incomeVatEurCents,
      taxEstimate,
      threshold: regime === "FORFETTARIO" || regime === "OTHER" ? forfettarioThresholdLevel(totals.incomeEurCents) : null,
      externalWithoutPrice,
    };
  }

  async yearCsv(userId: string, year: number): Promise<{ fileName: string; csv: string }> {
    const overview = await this.overview(userId, year);
    return { fileName: `entrate-uscite-${year}.csv`, csv: cashbookYearCsv(overview) };
  }

  /** Per l'email al commercialista di gennaio: il foglio dell'anno prima, dal profilo. */
  async yearCsvForProfile(professionalProfileId: string, year: number): Promise<{ fileName: string; csv: string; movements: number }> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { userId: true } });
    if (!profile) throw new NotFoundException("Profilo non trovato.");
    const overview = await this.overview(profile.userId, year);
    return { fileName: `entrate-uscite-${year}.csv`, csv: cashbookYearCsv(overview), movements: overview.movements.length };
  }

  // --- Spese ------------------------------------------------------------------

  async createExpense(userId: string, input: ExpenseInput) {
    const professionalProfileId = await this.profileIdOf(userId);
    return this.prisma.professionalExpense.create({ data: { professionalProfileId, ...this.expenseData(input) } });
  }

  async updateExpense(userId: string, id: string, input: ExpenseInput) {
    const professionalProfileId = await this.profileIdOf(userId);
    const before = await this.prisma.professionalExpense.findFirst({ where: { id, professionalProfileId }, select: { receiptPhotoUrl: true } });
    if (!before) throw new NotFoundException("Spesa non trovata.");
    const data = this.expenseData(input);
    const updated = await this.prisma.professionalExpense.update({ where: { id }, data });
    // Foto cambiata o tolta: la vecchia non serve più a nessuno.
    if (before.receiptPhotoUrl && before.receiptPhotoUrl !== updated.receiptPhotoUrl) await this.cloudinaryService?.deleteImageByUrl(before.receiptPhotoUrl);
    return updated;
  }

  async deleteExpense(userId: string, id: string): Promise<{ ok: true }> {
    const professionalProfileId = await this.profileIdOf(userId);
    const expense = await this.prisma.professionalExpense.findFirst({ where: { id, professionalProfileId }, select: { receiptPhotoUrl: true } });
    if (!expense) throw new NotFoundException("Spesa non trovata.");
    await this.prisma.professionalExpense.delete({ where: { id } });
    await this.cloudinaryService?.deleteImageByUrl(expense.receiptPhotoUrl);
    return { ok: true };
  }

  private expenseData(input: ExpenseInput) {
    const today = romeDayIso(new Date());
    if (input.spentOn > today) throw new BadRequestException("La data della spesa non può essere nel futuro.");
    if (input.spentOn < `${FIRST_YEAR - 1}-01-01`) throw new BadRequestException("Data della spesa troppo vecchia.");
    if (input.receiptPhotoUrl && !isOwnMediaUrl(input.receiptPhotoUrl)) throw new BadRequestException("La foto non viene dal nostro sito: caricala di nuovo.");
    return {
      spentOn: new Date(`${input.spentOn}T00:00:00.000Z`),
      amountEurCents: input.amountEurCents,
      category: input.category,
      description: input.description?.trim() || null,
      receiptPhotoUrl: input.receiptPhotoUrl || null,
    };
  }

  private async expenseMovements(professionalProfileId: string, year: number): Promise<CashbookMovement[]> {
    const rows = await this.prisma.professionalExpense.findMany({
      where: { professionalProfileId, spentOn: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) } },
      orderBy: [{ spentOn: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((e) => ({
      date: e.spentOn.toISOString().slice(0, 10),
      source: "EXPENSE" as const,
      label: expenseCategoryLabel(e.category),
      detail: e.description ?? "",
      amountEurCents: -e.amountEurCents,
      vatEurCents: null,
      document: e.receiptPhotoUrl ? "Foto dello scontrino sul sito" : "",
      expenseId: e.id,
      category: e.category as ExpenseCategory,
      receiptPhotoUrl: e.receiptPhotoUrl,
    }));
  }

  /**
   * Lavori fuori dal sito segnati "Fatto" in agenda, con un prezzo: pagati
   * direttamente, quindi incassati nel giorno del lavoro.
   */
  private async externalMovements(professionalProfileId: string, start: Date, end: Date): Promise<CashbookMovement[]> {
    const jobs = await this.prisma.externalJob.findMany({
      where: { professionalProfileId, status: "COMPLETED", priceEurCents: { gt: 0 }, scheduledAt: { gte: start, lt: end } },
      select: { scheduledAt: true, priceEurCents: true, clientName: true, description: true },
      orderBy: { scheduledAt: "asc" },
    });
    return jobs.map((j) => ({
      date: romeDayIso(j.scheduledAt),
      source: "EXTERNAL" as const,
      label: "Lavoro fuori dal sito",
      detail: [j.clientName, j.description].filter(Boolean).join(", "),
      amountEurCents: j.priceEurCents ?? 0,
      vatEurCents: null,
      document: "",
    }));
  }

  /**
   * Lavori del sito terminati con soldi ancora da ricevere: saldo online non
   * pagato o pagamento diretto non segnato. Il saldo diretto di un acconto
   * online si conta già al "Lavoro terminato".
   */
  private async toCollect(professionalProfileId: string): Promise<CashbookToCollect[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { professionalProfileId, status: "COMPLETED", finalAmountEurCents: { gt: 0 } },
      select: {
        id: true,
        guidedRequestId: true,
        professionalCompletedAt: true,
        updatedAt: true,
        finalAmountEurCents: true,
        recipientName: true,
        recipientSurname: true,
        client: { select: { name: true, surname: true } },
        quote: { select: { guidedRequest: { select: { category: { select: { label: true } } } } } },
        jobPayment: { select: { paymentMethod: true, balanceDirect: true, directReportedAt: true, paidEurCents: true, refundedEurCents: true, onlineStage: true } },
      },
      orderBy: { professionalCompletedAt: "asc" },
      take: 200,
    });
    const out: CashbookToCollect[] = [];
    for (const b of bookings) {
      const final = b.finalAmountEurCents ?? 0;
      const jp = b.jobPayment;
      let due: number;
      if (!jp) due = final;
      else if (jp.paymentMethod === "DIRECT") due = jp.directReportedAt ? 0 : final;
      else if (jp.balanceDirect || jp.onlineStage === "REFUNDED" || jp.refundedEurCents > 0) due = 0;
      else due = Math.max(0, final - jp.paidEurCents);
      if (due <= 0) continue;
      const name = (b.recipientName ? [b.recipientName, b.recipientSurname] : [b.client.name, b.client.surname]).filter(Boolean).join(" ");
      out.push({
        bookingId: b.id,
        requestId: b.guidedRequestId,
        date: romeDayIso(b.professionalCompletedAt ?? b.updatedAt),
        job: b.quote?.guidedRequest?.category.label ?? "Lavoro",
        client: name,
        amountEurCents: due,
      });
    }
    return out;
  }
}

/** Nello stesso giorno: prima le entrate, poi le uscite. */
function sourceOrder(m: CashbookMovement): number {
  return isIncome(m.source) ? 0 : 1;
}

/** Inizio del giorno di Roma per una data AAAA-MM-GG (per le Statistiche). */
export function romeRangeOfDays(fromIso: string, toIsoInclusive: string): { start: Date; end: Date } {
  const start = romeDayStart(fromIso);
  const next = new Date(`${toIsoInclusive}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { start, end: romeDayStart(next.toISOString().slice(0, 10)) };
}

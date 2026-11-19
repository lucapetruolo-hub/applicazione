import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma, type Invoice, type PrismaClient } from "@professionisti/database";
import {
  INVOICE_SOURCE_LABEL,
  accountingMonthLabel,
  clientDocumentHint,
  courtesyDocumentLabel,
  courtesyYearCsv,
  courtesyYearPart,
  invoiceNumberLabel,
  BANK_DISPUTE_OPEN_STATUSES,
  BANK_DISPUTE_REVIEW_STATUSES,
  formatEurCents,
  isAccountingMonth,
  notificationJobLabel,
  professionalPayoutTotals,
  statementCsv,
  toJobPaymentSummary,
  type AccountantSettingsInput,
  type CashbookMovement,
  type CourtesyYearSummary,
  type MonthlyStatement,
  type JobPaymentSummary,
  type MonthlyStatementRow,
  type StatementCsvRow,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { renderEmail, type EmailContent } from "../email/email-layout";
import { EMAIL_BRAND } from "../email/email-brand";
import { previousMonth, romeDayIso, romeDayLabel, romeMonthOf, romeMonthRange } from "./accounting-dates";
import { InvoicesService } from "./invoices.service";
import { renderDocumentPdf } from "./document-pdf";
import { courtesyYearPdfModel, invoicePdfModel, pdfFileName, statementPdfModel } from "./document-pdf-models";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { professionalFiscalName } from "./invoice-documents";
import { ScheduledJob } from "../common/scheduled-job";

/**
 * Codice Stripe di un movimento della trattenuta: quello scritto nella sua
 * chiave contro i doppioni ("HOLD:pi_…", "COSTS:du_…", "RETURN:fee_…-…"),
 * altrimenti il pagamento del lavoro.
 */
export function stripeRefOfEntry(dedupeKey: string | null, paymentIntentId: string | null | undefined): string {
  const fromKey = dedupeKey?.match(/(?:^|[:-])((?:pi|ch|py|du|dp|fee|fr|re|tr|po)_[A-Za-z0-9]+)/)?.[1];
  return fromKey ?? paymentIntentId ?? "";
}

const BOOKING_SELECT = {
  id: true,
  scheduledAt: true,
  recipientName: true,
  recipientSurname: true,
  client: { select: { name: true, surname: true } },
  courtesyDocument: { select: { kind: true, receiptNumber: true, customerName: true } },
  quote: { select: { invoiceRequest: { select: { name: true } }, guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
} as const;

type BookingInfo = {
  id: string;
  scheduledAt: Date;
  recipientName: string | null;
  recipientSurname: string | null;
  client: { name: string | null; surname: string | null };
  courtesyDocument: { kind: string; receiptNumber: string | null; customerName: string | null } | null;
  quote: { invoiceRequest: { name: string } | null; guidedRequest: { description: string; category: { label: string } } } | null;
};

function jobOf(booking: BookingInfo | null | undefined): string {
  if (!booking) return "Altri movimenti";
  const request = booking.quote?.guidedRequest;
  return [request?.category.label, notificationJobLabel(request?.description)].filter(Boolean).join(", ") || "Prenotazione";
}

/** Il cliente come sul documento: dati per la fattura, nome scritto dal professionista, chi riceve il lavoro, l'account (G-04). */
function clientOf(booking: BookingInfo | null | undefined): string | null {
  if (!booking) return null;
  const name =
    booking.quote?.invoiceRequest?.name ??
    booking.courtesyDocument?.customerName ??
    (booking.recipientName ? [booking.recipientName, booking.recipientSurname] : [booking.client.name, booking.client.surname]).filter(Boolean).join(" ");
  return name || null;
}

/**
 * Il documento dato al cliente per quel lavoro, per abbinarlo al pagamento
 * nel foglio di calcolo (G-04): la ricevuta fatta sul sito, o la fattura che
 * chi ha la partita IVA fa col suo programma
 * (docs/changelog/2026-10-30-documenti-snelli.md).
 */
function clientDocumentOf(booking: BookingInfo | null | undefined, receipts: boolean): string {
  if (!receipts) return "Fattura del professionista (dal suo programma)";
  const doc = booking?.courtesyDocument;
  if (doc?.kind !== "RECEIPT") return "Ricevuta non ancora fatta sul sito";
  return courtesyDocumentLabel(doc);
}

type PaymentInfo = { payoutSentAt: Date | null; payoutPaidAt: Date | null; paymentMethod: string };

/** Contestazione in banca su cui la banca non ha ancora deciso (collaudo G-15). */
const DISPUTE_PENDING_STATUSES: readonly string[] = [...BANK_DISPUTE_OPEN_STATUSES, ...BANK_DISPUTE_REVIEW_STATUSES];

/**
 * Dove sono i soldi di un lavoro, con le stesse cifre della scheda del lavoro
 * e di "Pagamenti online" (`toJobPaymentSummary`, collaudo G-14): rimborsati
 * al cliente (G-12), contestati in banca (G-15), bloccati, sbloccati, in banca.
 */
function payoutNoteOf(jp: PaymentInfo, summary: JobPaymentSummary | null, disputeStatus: string | null): string {
  if (jp.paymentMethod === "DIRECT") return "Pagato direttamente a te";
  if (disputeStatus && DISPUTE_PENDING_STATUSES.includes(disputeStatus)) return "Contestato in banca: può tornare al cliente";
  if (disputeStatus === "lost") return "Contestazione persa: soldi tornati al cliente";
  if (summary && (summary.stage === "REFUNDED" || (summary.paidEurCents > 0 && summary.paidEurCents <= summary.refundedEurCents))) return "Rimborsato al cliente";
  const amount = summary?.payoutEurCents ?? 0;
  const yours = amount > 0 ? ` ${formatEurCents(amount)}` : "";
  switch (summary?.payoutStatus) {
    case "PAID":
      return jp.payoutPaidAt ? `Arrivato in banca il ${romeDayLabel(jp.payoutPaidAt)}` : "Arrivato in banca";
    case "SENT":
      return jp.payoutSentAt ? `Bonifico di${yours} partito il ${romeDayLabel(jp.payoutSentAt)}` : `Bonifico di${yours} partito`;
    case "WAITING_FUNDS":
      return `Sbloccati${yours}: bonifico in preparazione`;
    case "FAILED":
      return "Bonifico non riuscito: controlla i dati bancari";
    case "BLOCKED":
      return `Bloccati${yours}: partono quando il cliente conferma`;
    default:
      return summary?.releasedAt ? "Sbloccato: nessun bonifico da fare" : "In attesa del pagamento del cliente";
  }
}

/**
 * Estratto del mese per il professionista e il suo commercialista
 * (decisioni dell'utente del 27/10/2026, docs/CHANGELOG.md §378): pagamenti
 * online e diretti, trattenute con l'IVA, bonifici arrivati, fatture
 * dell'abbonamento. In pagina, in CSV e, con la spunta, per email al
 * commercialista il 1° del mese.
 */
@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
    private readonly invoicesService: InvoicesService,
    private readonly courtesyCopyService: CourtesyCopyService,
  ) {}

  /**
   * Foglio Entrate e uscite dell'anno, allegato all'email di gennaio al
   * commercialista (docs/changelog/2026-11-19-entrate-e-uscite.md). Lo
   * registra CashbookService all'avvio: così questo servizio non dipende da
   * quello (che a sua volta legge l'estratto).
   */
  private yearCsvProvider: ((professionalProfileId: string, year: number) => Promise<{ fileName: string; csv: string; movements: number }>) | null = null;

  setYearCsvProvider(provider: (professionalProfileId: string, year: number) => Promise<{ fileName: string; csv: string; movements: number }>): void {
    this.yearCsvProvider = provider;
  }

  private requireMonth(month: string): void {
    if (!isAccountingMonth(month) || month > romeMonthOf(new Date())) throw new BadRequestException("Mese non valido.");
  }

  async statementFor(userId: string, month: string): Promise<MonthlyStatement> {
    this.requireMonth(month);
    return (await this.build(await this.invoicesService.profileIdOf(userId), month)).statement;
  }

  async csvFor(userId: string, month: string): Promise<{ fileName: string; csv: string }> {
    this.requireMonth(month);
    const { csvRows } = await this.build(await this.invoicesService.profileIdOf(userId), month);
    return { fileName: `estratto-${month}.csv`, csv: statementCsv(csvRows) };
  }

  /** L'estratto in PDF, col nome del professionista (serve al commercialista). */
  async pdfFor(userId: string, month: string): Promise<{ fileName: string; pdf: Buffer }> {
    this.requireMonth(month);
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const [{ statement }, who] = await Promise.all([this.build(professionalProfileId, month), this.whoOf(professionalProfileId)]);
    return { fileName: `estratto-${month}.pdf`, pdf: await renderDocumentPdf(statementPdfModel(statement, who)) };
  }

  private async whoOf(professionalProfileId: string): Promise<string | null> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { businessName: true, fiscalProfile: { select: { businessName: true, fiscalFirstName: true, fiscalLastName: true } } },
    });
    return professionalFiscalName(profile?.fiscalProfile, profile?.businessName);
  }

  /** Il commercialista e la spunta per mandargli l'estratto ogni mese. */
  async updateAccountant(userId: string, input: AccountantSettingsInput): Promise<{ email: string | null; enabled: boolean }> {
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { id: true, accountantStatementsAt: true } });
    if (!fiscal) throw new BadRequestException("Compila prima i dati fiscali.");
    const updated = await this.prisma.professionalFiscalProfile.update({
      where: { professionalProfileId },
      data: {
        accountantEmail: input.email || null,
        accountantStatementsAt: input.enabled ? (fiscal.accountantStatementsAt ?? new Date()) : null,
      },
      select: { accountantEmail: true, accountantStatementsAt: true },
    });
    return { email: updated.accountantEmail, enabled: !!updated.accountantStatementsAt };
  }

  async build(
    professionalProfileId: string,
    month: string,
  ): Promise<{ statement: MonthlyStatement; csvRows: StatementCsvRow[]; movements: number; invoices: Invoice[] }> {
    const { start, end } = romeMonthRange(month);
    const { cash: _cash, ...rest } = await this.collect(professionalProfileId, start, end, month);
    return rest;
  }

  /**
   * I soldi del sito entrati e usciti tra `start` (compreso) ed `end`
   * (escluso), riga per riga, per la scheda Entrate e uscite e le
   * Statistiche (docs/changelog/2026-11-19-entrate-e-uscite.md): lo stesso
   * calcolo dell'estratto, così le cifre coincidono per costruzione. Senza i
   * bonifici (sono soldi già contati quando il cliente ha pagato) e, come nei
   * totali dell'estratto, senza i pagamenti contestati in banca.
   */
  async cashMovements(professionalProfileId: string, start: Date, end: Date): Promise<CashbookMovement[]> {
    return (await this.collect(professionalProfileId, start, end, null)).cash;
  }

  private async collect(
    professionalProfileId: string,
    start: Date,
    end: Date,
    month: string | null,
  ): Promise<{ statement: MonthlyStatement; csvRows: StatementCsvRow[]; movements: number; invoices: Invoice[]; cash: CashbookMovement[] }> {
    const inMonth = { gte: start, lt: end };
    const paymentSelect = { id: true, paymentMethod: true, payoutSentAt: true, payoutPaidAt: true, stripePaymentIntentId: true, stripePayoutId: true, booking: { select: BOOKING_SELECT } } as const;
    const [entries, direct, payouts, otherInvoices, feeInvoice, fiscal, online, issuer] = await Promise.all([
      this.prisma.platformFeeEntry.findMany({
        where: { professionalProfileId, occurredAt: inMonth },
        orderBy: { occurredAt: "asc" },
        include: { invoice: { select: { series: true, year: true, number: true } }, jobPayment: { select: paymentSelect } },
      }),
      this.prisma.jobPayment.findMany({
        where: { booking: { professionalProfileId }, paymentMethod: "DIRECT", directReportedAt: inMonth },
        select: { ...paymentSelect, grossAmountEurCents: true, directReportedAt: true },
      }),
      this.prisma.jobPayment.findMany({ where: { booking: { professionalProfileId }, payoutPaidAt: inMonth }, select: { ...paymentSelect, payoutSentEurCents: true } }),
      this.prisma.invoice.findMany({
        where: { professionalProfileId, type: "MANOVIA_TO_PROFESSIONAL", status: "ISSUED", source: { not: "JOB_FEES" }, issuedAt: inMonth },
        orderBy: { issuedAt: "asc" },
      }),
      month ? this.prisma.invoice.findFirst({ where: { professionalProfileId, source: "JOB_FEES", periodMonth: month, status: "ISSUED" } }) : Promise.resolve(null),
      this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { entityType: true } }),
      // Tutti i pagamenti online: stato dei soldi come in "Pagamenti online" (G-14), rimborsi (G-12) e contestazioni (G-15).
      this.prisma.jobPayment.findMany({
        where: { booking: { professionalProfileId }, paymentMethod: "MANOVIA" },
        include: { booking: { select: { finalAmountEurCents: true, professionalCompletedAt: true, ...BOOKING_SELECT } } },
      }),
      // Le nostre fatture partono con l'apertura del sito: finché non partono l'estratto non le promette (G-16).
      this.invoicesService.activeIssuer(new Date(end.getTime() - 1)),
    ]);
    const feeInvoiceExpected = !!issuer;
    const receipts = fiscal?.entityType === "PRIVATE_INDIVIDUAL";
    // Rimborsi al cliente con la loro data: il registro delle modifiche li
    // scrive tutti (rimborsi.service, annullamenti, segnalazioni), collaudo G-12.
    const refundLogs = online.some((jp) => jp.refundedEurCents > 0)
      ? await this.prisma.auditLog.findMany({
          where: { entityType: "JobPayment", fieldName: "refundedEurCents", entityId: { in: online.filter((jp) => jp.refundedEurCents > 0).map((jp) => jp.id) } },
          select: { entityId: true, oldValue: true, newValue: true, createdAt: true },
        })
      : [];

    type Acc = MonthlyStatementRow & { sortAt: number };
    const rows = new Map<string, Acc>();
    // La data della riga è quella del primo movimento del mese, la stessa del
    // foglio di calcolo, non quella dell'appuntamento (collaudo D-10).
    const rowFor = (id: string | null, booking: BookingInfo | null | undefined, at: Date): Acc => {
      const key = id ?? "other";
      let row = rows.get(key);
      if (!row) {
        row = {
          jobPaymentId: id,
          date: at.toISOString(),
          job: jobOf(booking),
          client: clientOf(booking),
          onlineEurCents: 0,
          directEurCents: 0,
          feesEurCents: 0,
          payoutEurCents: null,
          payoutNote: "",
          refundsEurCents: 0,
          disputed: false,
          sortAt: at.getTime(),
        };
        rows.set(key, row);
      } else if (at.getTime() < row.sortAt) {
        row.date = at.toISOString();
        row.sortAt = at.getTime();
      }
      return row;
    };

    const csvRows: StatementCsvRow[] = [];
    // Le stesse righe per la scheda Entrate e uscite, con la fonte del soldo.
    const cash: (CashbookMovement & { jobPaymentId?: string })[] = [];
    const feeDocument = (invoice: { series: string | null; year: number | null; number: number | null } | null, at: Date) =>
      invoice
        ? `Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)}`
        : feeInvoiceExpected
          ? `Fattura delle trattenute di ${accountingMonthLabel(romeMonthOf(at))}`
          : "Nessuna fattura: prima dell'apertura del sito";
    for (const e of entries) {
      const booking = e.jobPayment?.booking;
      const row = rowFor(e.jobPaymentId, booking, e.occurredAt);
      row.feesEurCents += e.grossEurCents;
      const date = romeDayIso(e.occurredAt);
      const stripeRef = stripeRefOfEntry(e.dedupeKey, e.jobPayment?.stripePaymentIntentId);
      if (e.kind === "HOLD" && e.paymentEurCents > 0) {
        row.onlineEurCents += e.paymentEurCents;
        csvRows.push({ date, kind: "Pagamento online del cliente", job: row.job, client: row.client ?? "", amountEurCents: e.paymentEurCents, taxableEurCents: null, vatEurCents: null, document: clientDocumentOf(booking, receipts), stripeRef });
        cash.push({ date, source: "ONLINE", label: "Pagamento online del cliente", detail: row.job, amountEurCents: e.paymentEurCents, vatEurCents: null, document: clientDocumentOf(booking, receipts), bookingId: booking?.id, jobPaymentId: e.jobPaymentId ?? undefined });
      }
      if (e.grossEurCents !== 0) {
        cash.push({ date, source: "FEE", label: e.kind === "HOLD" ? "Nostra trattenuta" : e.description, detail: row.job, amountEurCents: -e.grossEurCents, vatEurCents: -e.vatEurCents, document: feeDocument(e.invoice, e.occurredAt), bookingId: booking?.id });
      }
      csvRows.push({
        date,
        kind: e.kind === "HOLD" ? "Trattenuta" : e.description,
        job: row.job,
        client: row.client ?? "",
        amountEurCents: -e.grossEurCents,
        taxableEurCents: -e.taxableEurCents,
        vatEurCents: -e.vatEurCents,
        document: feeDocument(e.invoice, e.occurredAt),
        stripeRef,
      });
    }
    for (const jp of direct) {
      const row = rowFor(jp.id, jp.booking, jp.directReportedAt ?? start);
      row.directEurCents += jp.grossAmountEurCents;
      row.payoutNote = payoutNoteOf(jp, null, null);
      csvRows.push({ date: romeDayIso(jp.directReportedAt ?? start), kind: "Pagamento diretto del cliente", job: row.job, client: row.client ?? "", amountEurCents: jp.grossAmountEurCents, taxableEurCents: null, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts) });
      cash.push({ date: romeDayIso(jp.directReportedAt ?? start), source: "DIRECT", label: "Pagamento diretto del cliente", detail: row.job, amountEurCents: jp.grossAmountEurCents, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts), bookingId: jp.booking.id });
    }
    // Acconto online e saldo pagato direttamente (MIXED, §237): il saldo il
    // cliente lo dà al professionista a lavoro finito, nel giorno di "Lavoro
    // terminato". Prima del 19/11 l'estratto non lo mostrava affatto.
    for (const jp of online) {
      const at = jp.booking.professionalCompletedAt;
      if (!jp.balanceDirect || !at || at < start || at >= end || jp.booking.finalAmountEurCents === null) continue;
      const deposit = jp.depositPaidAt ? (jp.depositEurCents ?? 0) : 0;
      const balance = jp.booking.finalAmountEurCents - deposit;
      if (balance <= 0) continue;
      const row = rowFor(jp.id, jp.booking, at);
      row.directEurCents += balance;
      csvRows.push({ date: romeDayIso(at), kind: "Saldo pagato direttamente dal cliente", job: row.job, client: row.client ?? "", amountEurCents: balance, taxableEurCents: null, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts) });
      cash.push({ date: romeDayIso(at), source: "DIRECT", label: "Saldo pagato direttamente dal cliente", detail: row.job, amountEurCents: balance, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts), bookingId: jp.booking.id });
    }
    for (const jp of payouts) {
      const row = rowFor(jp.id, jp.booking, jp.payoutPaidAt ?? start);
      row.payoutEurCents = (row.payoutEurCents ?? 0) + jp.payoutSentEurCents;
      csvRows.push({ date: romeDayIso(jp.payoutPaidAt ?? start), kind: "Bonifico arrivato in banca", job: row.job, client: row.client ?? "", amountEurCents: jp.payoutSentEurCents, taxableEurCents: null, vatEurCents: null, document: "", stripeRef: jp.stripePayoutId ?? "" });
    }
    const summaries = new Map<string, JobPaymentSummary | null>();
    const inThisMonth = (at: Date | null): at is Date => !!at && at >= start && at < end;
    for (const jp of online) {
      summaries.set(jp.id, toJobPaymentSummary(jp, jp.booking.finalAmountEurCents, true));
      const refund = (at: Date, amountEurCents: number, kind: string) => {
        if (amountEurCents <= 0) return;
        const row = rowFor(jp.id, jp.booking, at);
        row.refundsEurCents += amountEurCents;
        csvRows.push({ date: romeDayIso(at), kind, job: row.job, client: row.client ?? "", amountEurCents: -amountEurCents, taxableEurCents: null, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts), stripeRef: jp.stripePaymentIntentId ?? "" });
        cash.push({ date: romeDayIso(at), source: "REFUND", label: kind, detail: row.job, amountEurCents: -amountEurCents, vatEurCents: null, document: clientDocumentOf(jp.booking, receipts), bookingId: jp.booking.id, jobPaymentId: jp.id });
      };
      let logged = 0;
      for (const log of refundLogs) {
        if (log.entityId !== jp.id) continue;
        const amount = Number(log.newValue) - Number(log.oldValue);
        if (!Number.isFinite(amount)) continue;
        logged += amount;
        if (inThisMonth(log.createdAt)) refund(log.createdAt, amount, "Rimborso al cliente");
      }
      // Contestazione persa: la banca restituisce la cifra al cliente senza passare dai rimborsi.
      if (jp.stripeDisputeStatus === "lost" && inThisMonth(jp.stripeDisputeClosedAt)) {
        refund(jp.stripeDisputeClosedAt, jp.refundedEurCents - logged, "Contestazione in banca persa: soldi tornati al cliente");
      }
    }
    for (const jp of online) {
      const row = rows.get(jp.id);
      if (!row) continue;
      row.payoutNote = payoutNoteOf(jp, summaries.get(jp.id) ?? null, jp.stripeDisputeStatus);
      row.disputed = !!jp.stripeDisputeStatus && DISPUTE_PENDING_STATUSES.includes(jp.stripeDisputeStatus);
      if (row.disputed) {
        csvRows.push({
          date: romeDayIso(jp.stripeDisputedAt && jp.stripeDisputedAt < end ? jp.stripeDisputedAt : new Date(end.getTime() - 1)),
          kind: "Contestazione in banca aperta: il pagamento può tornare al cliente",
          job: row.job,
          client: row.client ?? "",
          amountEurCents: 0,
          taxableEurCents: null,
          vatEurCents: null,
          document: "",
          stripeRef: jp.stripeDisputeId ?? "",
        });
      }
    }
    for (const invoice of otherInvoices) {
      cash.push({
        date: romeDayIso(invoice.issuedAt ?? invoice.createdAt),
        source: "PLATFORM_INVOICE",
        label: INVOICE_SOURCE_LABEL[invoice.source],
        detail: "",
        amountEurCents: -invoice.amountEurCents,
        vatEurCents: -(invoice.vatEurCents + invoice.roundingEurCents),
        document: `Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)}`,
      });
      csvRows.push({
        date: romeDayIso(invoice.issuedAt ?? invoice.createdAt),
        kind: INVOICE_SOURCE_LABEL[invoice.source],
        job: "",
        client: "",
        amountEurCents: -invoice.amountEurCents,
        taxableEurCents: -invoice.taxableEurCents,
        vatEurCents: -(invoice.vatEurCents + invoice.roundingEurCents),
        document: `Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)}`,
        stripeRef: invoice.stripeInvoiceId ?? invoice.stripePaymentIntentId ?? "",
      });
    }
    csvRows.sort((a, b) => a.date.localeCompare(b.date));

    const sorted = [...rows.values()].sort((a, b) => a.sortAt - b.sortAt);
    const statementRows: MonthlyStatementRow[] = sorted.map(({ sortAt: _sortAt, ...row }) => row);
    // Gli stessi "Bloccati" di "Pagamenti online" (G-14), senza i contestati in banca (G-15).
    const blockedEurCents = professionalPayoutTotals(
      online.filter((jp) => !jp.stripeDisputeStatus || !DISPUTE_PENDING_STATUSES.includes(jp.stripeDisputeStatus)).map((jp) => summaries.get(jp.id) ?? null),
    ).blockedEurCents;
    const counted = sorted.filter((r) => !r.disputed);
    const disputedIds = new Set(sorted.filter((r) => r.disputed && r.jobPaymentId).map((r) => r.jobPaymentId));
    const cashCounted: CashbookMovement[] = cash
      .filter((m) => !(m.jobPaymentId && disputedIds.has(m.jobPaymentId) && (m.source === "ONLINE" || m.source === "REFUND")))
      .map(({ jobPaymentId: _id, ...m }) => m)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      cash: cashCounted,
      statement: {
        month: month ?? "",
        monthLabel: month ? accountingMonthLabel(month) : "",
        totals: {
          onlineEurCents: counted.reduce((sum, r) => sum + r.onlineEurCents - r.refundsEurCents, 0),
          directEurCents: sorted.reduce((sum, r) => sum + r.directEurCents, 0),
          feesEurCents: sorted.reduce((sum, r) => sum + r.feesEurCents, 0),
          payoutsArrivedEurCents: sorted.reduce((sum, r) => sum + (r.payoutEurCents ?? 0), 0),
          refundsEurCents: counted.reduce((sum, r) => sum + r.refundsEurCents, 0),
          disputedEurCents: sorted.reduce((sum, r) => sum + (r.disputed ? r.onlineEurCents : 0), 0),
        },
        rows: statementRows,
        blockedEurCents,
        feeInvoice: feeInvoice ? { id: feeInvoice.id, number: invoiceNumberLabel(feeInvoice.series, feeInvoice.year, feeInvoice.number) } : null,
        feeInvoiceExpected,
        documentHint: clientDocumentHint(fiscal?.entityType),
      },
      csvRows,
      movements: csvRows.length,
      // Le nostre fatture del mese, allegate all'email al commercialista (docs/changelog/2026-10-30-documenti-migliorie.md).
      invoices: [...(feeInvoice ? [feeInvoice] : []), ...otherInvoices],
    };
  }

  /**
   * Il 1° del mese alle 8 (dopo le fatture delle 7): l'estratto del mese
   * prima al commercialista di chi ha messo la spunta, col PDF e il foglio di
   * calcolo allegati. Solo se nel mese c'è stato qualche movimento. A gennaio
   * anche il riepilogo dell'anno prima dei documenti dati ai clienti (§390),
   * pure senza movimenti a dicembre.
   */
  @ScheduledJob("0 8 1 * *", { timeZone: "Europe/Rome" })
  async sendAccountantStatements(now: Date = new Date()): Promise<number> {
    return this.sendAccountantStatementsFor(previousMonth(romeMonthOf(now)), now);
  }

  /**
   * Estratti di un mese ai commercialisti: dal giro del 1° o dal pulsante di
   * Admin → Finanza se il giro è saltato. Mai due volte per lo stesso mese e
   * professionista (`accountant_statement_sends`, segnata prima di mandare e
   * tolta se l'invio non riesce, così si può riprovare).
   */
  async sendAccountantStatementsFor(month: string, now: Date = new Date()): Promise<number> {
    const closedYear = month.endsWith("-12") ? Number(month.slice(0, 4)) : null;
    const recipients = await this.prisma.professionalFiscalProfile.findMany({
      where: { accountantStatementsAt: { not: null }, accountantEmail: { not: null }, professionalProfile: { user: { deletedAt: null } } },
      select: {
        professionalProfileId: true,
        accountantEmail: true,
        fiscalFirstName: true,
        fiscalLastName: true,
        businessName: true,
        professionalProfile: { select: { businessName: true } },
      },
    });
    let sent = 0;
    const already = new Set(
      (await this.prisma.accountantStatementSend.findMany({ where: { month }, select: { professionalProfileId: true } })).map((row) => row.professionalProfileId),
    );
    for (const r of recipients) {
      if (already.has(r.professionalProfileId)) continue;
      try {
        const { statement, csvRows, movements, invoices } = await this.build(r.professionalProfileId, month);
        const yearly = closedYear !== null ? await this.courtesyCopyService.yearSummaryForProfile(r.professionalProfileId, closedYear) : null;
        const withYearly = yearly && yearly.receipts.length > 0 ? yearly : null;
        const yearSheet = closedYear !== null && this.yearCsvProvider ? await this.yearCsvProvider(r.professionalProfileId, closedYear) : null;
        const withSheet = yearSheet && yearSheet.movements > 0 ? yearSheet : null;
        if (movements === 0 && !withYearly && !withSheet) continue;
        const who = professionalFiscalName(r, r.professionalProfile.businessName) ?? "";
        const email = renderEmail(accountantStatementEmail(who, movements > 0 ? statement : null, withYearly, movements > 0 ? invoices.length : 0, withSheet ? closedYear : null));
        const attachments: { filename: string; content: string | Buffer; contentType: string }[] = [];
        if (movements > 0) {
          attachments.push(
            { filename: `estratto-${month}.pdf`, content: await renderDocumentPdf(statementPdfModel(statement, who)), contentType: "application/pdf" },
            { filename: `estratto-${month}.csv`, content: statementCsv(csvRows), contentType: "text/csv; charset=utf-8" },
          );
          for (const invoice of invoices) {
            const view = await this.invoicesService.invoiceView(invoice);
            attachments.push({
              filename: pdfFileName(`${view.creditNote ? "nota-di-credito" : "fattura"}-${view.number}`),
              content: await renderDocumentPdf(invoicePdfModel(view)),
              contentType: "application/pdf",
            });
          }
        }
        if (withYearly) {
          attachments.push(
            { filename: `documenti-clienti-${withYearly.year}.pdf`, content: await renderDocumentPdf(courtesyYearPdfModel(withYearly, now)), contentType: "application/pdf" },
            { filename: `documenti-clienti-${withYearly.year}.csv`, content: courtesyYearCsv(withYearly), contentType: "text/csv; charset=utf-8" },
          );
        }
        if (withSheet) attachments.push({ filename: withSheet.fileName, content: withSheet.csv, contentType: "text/csv; charset=utf-8" });
        if (!(await this.claimStatementSend(r.professionalProfileId, month))) continue;
        const ok = await this.emailService.send({ to: r.accountantEmail!, subject: email.subject, html: email.html, text: email.text, attachments });
        if (ok) sent += 1;
        else await this.releaseStatementSend(r.professionalProfileId, month);
      } catch (err) {
        this.logger.error(`Estratto di ${month} non mandato al commercialista (${r.professionalProfileId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }

  /** `false` se l'estratto di quel mese è già partito (o sta partendo) per questo professionista. */
  private async claimStatementSend(professionalProfileId: string, month: string): Promise<boolean> {
    try {
      await this.prisma.accountantStatementSend.create({ data: { professionalProfileId, month } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  private async releaseStatementSend(professionalProfileId: string, month: string): Promise<void> {
    await this.prisma.accountantStatementSend.deleteMany({ where: { professionalProfileId, month } });
  }
}

/**
 * Email al commercialista: chi è il cliente, i totali, e perché la riceve. A
 * gennaio c'è anche (o solo) il riepilogo dell'anno dei documenti dati ai
 * clienti (§390).
 */
export function accountantStatementEmail(
  who: string,
  statement: MonthlyStatement | null,
  yearly: CourtesyYearSummary | null = null,
  invoiceCount = 0,
  cashbookYear: number | null = null,
): EmailContent {
  const eur = (cents: number) => `${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const yearlyWhat = "le ricevute per prestazione occasionale date ai clienti nell'anno, in PDF e nel foglio di calcolo";
  const sheetLine = cashbookYear
    ? [`In allegato anche il foglio **Entrate e uscite del ${cashbookYear}**: i soldi entrati e usciti nell'anno, nel giorno in cui si sono mossi, con le spese che ${who} ha segnato sul sito.`]
    : [];
  const year = yearly?.year ?? cashbookYear ?? "";
  return {
    kind: "external",
    subject: statement
      ? `Estratto di ${statement.monthLabel}${yearly ? ` e riepilogo del ${yearly.year}` : ""} di ${who}`
      : `Riepilogo del ${year} di ${who}`,
    greeting: null,
    title: statement ? `Estratto di ${statement.monthLabel}` : `Riepilogo del ${year}`,
    paragraphs: statement
      ? [
          `Le mandiamo l'estratto di **${statement.monthLabel}** di **${who}**, come ci ha chiesto. In allegato l'estratto in PDF e il foglio di calcolo con ogni movimento.`,
          ...(yearly ? [`C'è anche il **riepilogo del ${yearly.year}**: ${yearlyWhat}.`] : []),
          invoiceCount > 0
            ? `In allegato anche ${invoiceCount === 1 ? "la nostra fattura del mese" : `le nostre ${invoiceCount} fatture del mese`} in PDF. L'originale elettronico è nel cassetto fiscale del professionista.`
            : "Le fatture elettroniche arrivano anche al cassetto fiscale del professionista.",
          ...sheetLine,
        ]
      : [
          yearly
            ? `Le mandiamo il **riepilogo del ${year}** di **${who}**, come ci ha chiesto: ${yearlyWhat}. A dicembre non ci sono stati movimenti, quindi niente estratto del mese.`
            : `Le mandiamo il **riepilogo del ${year}** di **${who}**, come ci ha chiesto. A dicembre non ci sono stati movimenti, quindi niente estratto del mese.`,
          ...sheetLine,
        ],
    details: [
      ...(statement
        ? [
            { label: "Pagamenti online dei clienti", value: eur(statement.totals.onlineEurCents) },
            ...(statement.totals.refundsEurCents > 0 ? [{ label: "Rimborsati ai clienti (già tolti)", value: eur(statement.totals.refundsEurCents) }] : []),
            ...(statement.totals.disputedEurCents > 0 ? [{ label: "Contestati in banca (fuori dai totali)", value: eur(statement.totals.disputedEurCents) }] : []),
            { label: "Pagamenti diretti dichiarati", value: eur(statement.totals.directEurCents) },
            { label: "Nostre trattenute (IVA compresa)", value: eur(statement.totals.feesEurCents) },
            { label: "Bonifici arrivati in banca", value: eur(statement.totals.payoutsArrivedEurCents) },
          ]
        : []),
      ...(yearly && yearly.receipts.length > 0 ? [{ label: `Ricevute del ${yearly.year}`, value: eur(courtesyYearPart(yearly.receipts).totalEurCents) }] : []),
    ],
    after: [`La riceve perché ${who} ha indicato questo indirizzo nel suo profilo su ${EMAIL_BRAND.name}. Per non riceverla più basta che tolga la spunta.`],
  };
}

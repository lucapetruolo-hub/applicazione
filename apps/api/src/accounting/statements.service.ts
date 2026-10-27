import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { PrismaClient } from "@professionisti/database";
import {
  INVOICE_SOURCE_LABEL,
  accountingMonthLabel,
  clientDocumentHint,
  invoiceNumberLabel,
  isAccountingMonth,
  notificationJobLabel,
  onlineFeeWithVatEurCents,
  statementCsv,
  type AccountantSettingsInput,
  type MonthlyStatement,
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
import { statementPdfModel } from "./document-pdf-models";
import { professionalFiscalName } from "./invoice-documents";

const BOOKING_SELECT = {
  scheduledAt: true,
  client: { select: { name: true, surname: true } },
  quote: { select: { guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
} as const;

type BookingInfo = {
  scheduledAt: Date;
  client: { name: string | null; surname: string | null };
  quote: { guidedRequest: { description: string; category: { label: string } } } | null;
};

function jobOf(booking: BookingInfo | null | undefined): string {
  if (!booking) return "Altri movimenti";
  const request = booking.quote?.guidedRequest;
  return [request?.category.label, notificationJobLabel(request?.description)].filter(Boolean).join(", ") || "Prenotazione";
}

function clientOf(booking: BookingInfo | null | undefined): string | null {
  const name = [booking?.client.name, booking?.client.surname].filter(Boolean).join(" ");
  return name || null;
}

type PaymentInfo = { releasedAt: Date | null; payoutSentAt: Date | null; payoutPaidAt: Date | null; paymentMethod: string };

function payoutNoteOf(jp: PaymentInfo): string {
  if (jp.paymentMethod === "DIRECT") return "Pagato direttamente a te";
  if (jp.payoutPaidAt) return `Arrivato in banca il ${romeDayLabel(jp.payoutPaidAt)}`;
  if (jp.payoutSentAt) return `Bonifico partito il ${romeDayLabel(jp.payoutSentAt)}`;
  if (!jp.releasedAt) return "In attesa della conferma del cliente";
  return "In arrivo sul tuo conto";
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
  ) {}

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

  async build(professionalProfileId: string, month: string): Promise<{ statement: MonthlyStatement; csvRows: StatementCsvRow[]; movements: number }> {
    const { start, end } = romeMonthRange(month);
    const inMonth = { gte: start, lt: end };
    const paymentSelect = { id: true, paymentMethod: true, releasedAt: true, payoutSentAt: true, payoutPaidAt: true, booking: { select: BOOKING_SELECT } } as const;
    const [entries, direct, payouts, otherInvoices, feeInvoice, fiscal, blocked] = await Promise.all([
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
      this.prisma.invoice.findFirst({ where: { professionalProfileId, source: "JOB_FEES", periodMonth: month, status: "ISSUED" } }),
      this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { entityType: true } }),
      this.prisma.jobPayment.findMany({
        where: { booking: { professionalProfileId }, paymentMethod: "MANOVIA", releasedAt: null, paidEurCents: { gt: 0 } },
        select: { paidEurCents: true, refundedEurCents: true, applicationFeeEurCents: true, stripeFeeEurCents: true },
      }),
    ]);

    type Acc = MonthlyStatementRow & { sortAt: number };
    const rows = new Map<string, Acc>();
    const rowFor = (id: string | null, booking: BookingInfo | null | undefined, payment: PaymentInfo | null): Acc => {
      const key = id ?? "other";
      let row = rows.get(key);
      if (!row) {
        row = {
          jobPaymentId: id,
          date: booking ? booking.scheduledAt.toISOString() : start.toISOString(),
          job: jobOf(booking),
          client: clientOf(booking),
          onlineEurCents: 0,
          directEurCents: 0,
          feesEurCents: 0,
          payoutEurCents: null,
          payoutNote: payment ? payoutNoteOf(payment) : "",
          sortAt: booking?.scheduledAt.getTime() ?? 0,
        };
        rows.set(key, row);
      }
      return row;
    };

    const csvRows: StatementCsvRow[] = [];
    const feeDocument = (invoice: { series: string | null; year: number | null; number: number | null } | null) =>
      invoice ? `Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)}` : `Fattura delle trattenute di ${accountingMonthLabel(month)}`;
    for (const e of entries) {
      const booking = e.jobPayment?.booking;
      const row = rowFor(e.jobPaymentId, booking, e.jobPayment);
      row.feesEurCents += e.grossEurCents;
      const date = romeDayIso(e.occurredAt);
      if (e.kind === "HOLD" && e.paymentEurCents > 0) {
        row.onlineEurCents += e.paymentEurCents;
        csvRows.push({ date, kind: "Pagamento online del cliente", job: row.job, client: row.client ?? "", amountEurCents: e.paymentEurCents, taxableEurCents: null, vatEurCents: null, document: "Documento del professionista al cliente" });
      }
      csvRows.push({
        date,
        kind: e.kind === "HOLD" ? "Trattenuta" : e.description,
        job: row.job,
        client: row.client ?? "",
        amountEurCents: -e.grossEurCents,
        taxableEurCents: -e.taxableEurCents,
        vatEurCents: -e.vatEurCents,
        document: feeDocument(e.invoice),
      });
    }
    for (const jp of direct) {
      const row = rowFor(jp.id, jp.booking, jp);
      row.directEurCents += jp.grossAmountEurCents;
      csvRows.push({ date: romeDayIso(jp.directReportedAt ?? start), kind: "Pagamento diretto del cliente", job: row.job, client: row.client ?? "", amountEurCents: jp.grossAmountEurCents, taxableEurCents: null, vatEurCents: null, document: "Documento del professionista" });
    }
    for (const jp of payouts) {
      const row = rowFor(jp.id, jp.booking, jp);
      row.payoutEurCents = (row.payoutEurCents ?? 0) + jp.payoutSentEurCents;
      row.payoutNote = payoutNoteOf(jp);
      csvRows.push({ date: romeDayIso(jp.payoutPaidAt ?? start), kind: "Bonifico arrivato in banca", job: row.job, client: row.client ?? "", amountEurCents: jp.payoutSentEurCents, taxableEurCents: null, vatEurCents: null, document: "" });
    }
    for (const invoice of otherInvoices) {
      csvRows.push({
        date: romeDayIso(invoice.issuedAt ?? invoice.createdAt),
        kind: INVOICE_SOURCE_LABEL[invoice.source],
        job: "",
        client: "",
        amountEurCents: -invoice.amountEurCents,
        taxableEurCents: -invoice.taxableEurCents,
        vatEurCents: -(invoice.vatEurCents + invoice.roundingEurCents),
        document: `Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)}`,
      });
    }
    csvRows.sort((a, b) => a.date.localeCompare(b.date));

    const sorted = [...rows.values()].sort((a, b) => a.sortAt - b.sortAt);
    const statementRows: MonthlyStatementRow[] = sorted.map(({ sortAt: _sortAt, ...row }) => row);
    const blockedEurCents = blocked.reduce((sum, jp) => {
      const kept = jp.paidEurCents - jp.refundedEurCents;
      const fee = jp.applicationFeeEurCents > 0 ? jp.applicationFeeEurCents : onlineFeeWithVatEurCents(kept);
      return sum + Math.max(0, kept - fee - jp.stripeFeeEurCents);
    }, 0);
    return {
      statement: {
        month,
        monthLabel: accountingMonthLabel(month),
        totals: {
          onlineEurCents: sorted.reduce((sum, r) => sum + r.onlineEurCents, 0),
          directEurCents: sorted.reduce((sum, r) => sum + r.directEurCents, 0),
          feesEurCents: sorted.reduce((sum, r) => sum + r.feesEurCents, 0),
          payoutsArrivedEurCents: sorted.reduce((sum, r) => sum + (r.payoutEurCents ?? 0), 0),
        },
        rows: statementRows,
        blockedEurCents,
        feeInvoice: feeInvoice ? { id: feeInvoice.id, number: invoiceNumberLabel(feeInvoice.series, feeInvoice.year, feeInvoice.number) } : null,
        documentHint: clientDocumentHint(fiscal?.entityType),
      },
      csvRows,
      movements: csvRows.length,
    };
  }

  /**
   * Il 1° del mese alle 8 (dopo le fatture delle 7): l'estratto del mese
   * prima al commercialista di chi ha messo la spunta, col PDF e il foglio di
   * calcolo allegati. Solo se nel mese c'è stato qualche movimento.
   */
  @Cron("0 8 1 * *", { timeZone: "Europe/Rome" })
  async sendAccountantStatements(now: Date = new Date()): Promise<number> {
    const month = previousMonth(romeMonthOf(now));
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
    for (const r of recipients) {
      try {
        const { statement, csvRows, movements } = await this.build(r.professionalProfileId, month);
        if (movements === 0) continue;
        const who = professionalFiscalName(r, r.professionalProfile.businessName) ?? "";
        const email = renderEmail(accountantStatementEmail(who, statement));
        const ok = await this.emailService.send({
          to: r.accountantEmail!,
          subject: email.subject,
          html: email.html,
          text: email.text,
          attachments: [
            { filename: `estratto-${month}.pdf`, content: await renderDocumentPdf(statementPdfModel(statement, who)), contentType: "application/pdf" },
            { filename: `estratto-${month}.csv`, content: statementCsv(csvRows), contentType: "text/csv; charset=utf-8" },
          ],
        });
        if (ok) sent += 1;
      } catch (err) {
        this.logger.error(`Estratto di ${month} non mandato al commercialista (${r.professionalProfileId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }
}

/** Email al commercialista: chi è il cliente, i totali, e perché la riceve. */
export function accountantStatementEmail(who: string, statement: MonthlyStatement): EmailContent {
  const eur = (cents: number) => `${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  return {
    kind: "external",
    subject: `Estratto di ${statement.monthLabel} di ${who}`,
    greeting: null,
    title: `Estratto di ${statement.monthLabel}`,
    paragraphs: [
      `Le mandiamo l'estratto di **${statement.monthLabel}** di **${who}**, come ci ha chiesto. In allegato l'estratto in PDF e il foglio di calcolo con ogni movimento.`,
      statement.feeInvoice ? `La fattura delle nostre trattenute è la ${statement.feeInvoice.number}.` : "Le fatture elettroniche arrivano anche al cassetto fiscale del professionista.",
    ],
    details: [
      { label: "Pagamenti online dei clienti", value: eur(statement.totals.onlineEurCents) },
      { label: "Pagamenti diretti dichiarati", value: eur(statement.totals.directEurCents) },
      { label: "Nostre trattenute (IVA compresa)", value: eur(statement.totals.feesEurCents) },
      { label: "Bonifici arrivati in banca", value: eur(statement.totals.payoutsArrivedEurCents) },
    ],
    after: [`La riceve perché ${who} ha indicato questo indirizzo nel suo profilo su ${EMAIL_BRAND.name}. Per non riceverla più basta che tolga la spunta.`],
  };
}

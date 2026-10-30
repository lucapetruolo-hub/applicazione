import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  COURTESY_VAT_RATES,
  STAMP_DUTY_THRESHOLD_EUR_CENTS,
  WITHHOLDING_RATE_PERCENT,
  accountingDateLabel,
  clientInvoiceLines,
  courtesyAmountChanged,
  courtesyDocumentLabel,
  courtesyLinesTaxable,
  courtesyReceiptNumber,
  courtesyTotalEurCents,
  professionalChargesVat,
  splitVatEurCents,
  type AdminCourtesyDocumentRow,
  type CourtesyCopyView,
  type CourtesyDetailsInput,
  type CourtesyDocumentSummary,
  type CourtesyVatRate,
  type CourtesyYearRow,
  type CourtesyYearSummary,
  type InvoiceParty,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { invoiceRequestView } from "../client-invoice-requests/client-invoice-requests.service";
import { InvoicesService } from "./invoices.service";
import { professionalFiscalName, recipientFromFiscal, recipientParty } from "./invoice-documents";
import { romeMonthOf, romeMonthRange } from "./accounting-dates";
import { COURTESY_BOOKING_FIELDS, COURTESY_DOCUMENT_FIELDS, courtesyDocumentSummary } from "./courtesy-documents";

/**
 * Copia di cortesia del documento che il professionista dà al cliente
 * (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md §378): fattura
 * per chi ha la partita IVA, ricevuta per prestazione occasionale per il
 * privato. Solo una pagina da stampare: il documento valido lo emette lui,
 * noi non mandiamo nulla all'Agenzia delle Entrate. Il numero della
 * ricevuta lo diamo noi, quello della fattura lo scrive lui (§379); l'elenco
 * dei documenti preparati lo vede l'admin per l'assistenza (§380). Dopo il
 * collaudo del 29/10/2026 (docs/changelog/2026-10-30-documenti-fiscali.md)
 * si prepara solo a lavoro terminato, con le voci del lavoro, il nome del
 * cliente e, per la fattura, numero e data della fattura vera.
 */
@Injectable()
export class CourtesyCopyService {
  private readonly logger = new Logger(CourtesyCopyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly invoicesService: InvoicesService,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async forProfessional(userId: string, bookingId: string): Promise<CourtesyCopyView> {
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const booking = await this.loadBooking(bookingId);
    // Solo il professionista del lavoro, e solo dopo l'accettazione (CLAUDE.md §5 punto 9).
    if (!booking || booking.professionalProfileId !== professionalProfileId || booking.status === "CANCELED") throw new NotFoundException("Lavoro non trovato.");
    // Prima del lavoro niente documento: data, importo e "Pagato" sarebbero sbagliati (collaudo C-02, C-03, B-02).
    if (booking.status !== "COMPLETED") throw new ConflictException(NOT_COMPLETED_MESSAGE);
    return this.build(booking, true);
  }

  /**
   * La copia per il cliente, dai documenti della sua richiesta (decisione
   * dell'utente, docs/CHANGELOG.md §386): solo dopo che il professionista ha
   * scaricato il PDF e con lo stesso importo, senza dare numeri nuovi.
   */
  async forClient(clientUserId: string, bookingId: string): Promise<CourtesyCopyView> {
    const [booking, saved] = await Promise.all([
      this.loadBooking(bookingId),
      this.prisma.courtesyDocument.findUnique({ where: { bookingId }, select: { pdfDownloadedAt: true, pdfTotalEurCents: true } }),
    ]);
    if (!booking || booking.clientId !== clientUserId || booking.status !== "COMPLETED" || !saved?.pdfDownloadedAt) throw new NotFoundException("Documento non trovato.");
    if (courtesyAmountChanged(saved.pdfTotalEurCents, courtesyTotalEurCents(booking.jobPayment))) throw new NotFoundException("Documento non trovato.");
    return this.build(booking, false, "client");
  }

  /**
   * Il PDF scaricato dal professionista: ci segniamo quando e con che
   * importo, così in assistenza si sa cosa ha in mano il cliente (§380).
   * Al primo PDF, o se l'importo è cambiato, avvisiamo il cliente che la
   * copia è nei documenti della richiesta (§387).
   */
  async forProfessionalPdf(userId: string, bookingId: string): Promise<CourtesyCopyView> {
    const copy = await this.forProfessional(userId, bookingId);
    if (copy.missing.length > 0) throw new BadRequestException(`Prima di scaricare il documento scrivi ${joinMissing(copy.missing)}.`);
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const previous = await this.prisma.courtesyDocument.findUnique({ where: { bookingId }, select: { pdfDownloadedAt: true, pdfTotalEurCents: true } });
    const downloaded = { pdfDownloadedAt: new Date(), pdfTotalEurCents: copy.totalEurCents };
    const saved = await this.prisma.courtesyDocument.upsert({
      where: { bookingId },
      create: { bookingId, professionalProfileId, kind: copy.kind, year: yearOf(copy.date), ownNumber: copy.kind === "INVOICE" ? copy.number : null, ...downloaded },
      update: downloaded,
      select: { kind: true, number: true, year: true, ownNumber: true },
    });
    const updated = !!previous?.pdfDownloadedAt;
    if (copy.totalEurCents !== null && (!updated || courtesyAmountChanged(previous?.pdfTotalEurCents ?? null, copy.totalEurCents))) {
      await this.notifyClientDocumentReady(bookingId, saved, updated);
    }
    return copy;
  }

  private async notifyClientDocumentReady(bookingId: string, doc: { kind: string; number: number | null; year: number; ownNumber: string | null }, updated: boolean): Promise<void> {
    try {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { clientId: true, quote: { select: { guidedRequestId: true, guidedRequest: { select: { category: { select: { label: true } } } } } } },
      });
      if (!booking) return;
      const kind = doc.kind === "RECEIPT" ? "RECEIPT" : "INVOICE";
      await this.notificationsService.notify(booking.clientId, "JOB_DOCUMENT_READY", {
        bookingId,
        guidedRequestId: booking.quote?.guidedRequestId ?? null,
        category: booking.quote?.guidedRequest.category.label ?? null,
        kind,
        // Come nei documenti della richiesta: senza il numero, "Copia della fattura".
        label: kind === "INVOICE" && !doc.ownNumber ? "Copia della fattura" : courtesyDocumentLabel(doc),
        updated,
      });
    } catch (err) {
      this.logger.error(`Avviso al cliente della copia pronta non mandato (${bookingId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** I documenti dati ai clienti, dal più recente: in "Fatture e documenti" col totale dell'anno (§381). */
  async listForProfessional(userId: string): Promise<CourtesyDocumentSummary[]> {
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const documents = await this.prisma.courtesyDocument.findMany({
      // Solo lavori terminati: un documento preparato prima non vale (collaudo C-06).
      where: { professionalProfileId, booking: { status: "COMPLETED" } },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      take: 500,
      select: { ...COURTESY_DOCUMENT_FIELDS, booking: { select: COURTESY_BOOKING_FIELDS } },
    });
    return documents.map((doc) => courtesyDocumentSummary(doc, doc.booking));
  }

  /**
   * Riepilogo dell'anno per il commercialista (docs/CHANGELOG.md §382): le
   * ricevute in ordine di numero, le copie delle fatture in ordine di data,
   * con l'importo del documento dato al cliente (G-10). Contano solo i lavori
   * terminati (C-06).
   */
  async yearSummaryForProfessional(userId: string, year: number): Promise<CourtesyYearSummary> {
    const summary = await this.yearSummaryForProfile(await this.invoicesService.profileIdOf(userId), year);
    if (summary.receipts.length + summary.invoices.length === 0) throw new NotFoundException("Nessun documento dato ai clienti in quell'anno.");
    return summary;
  }

  /** Lo stesso riepilogo per profilo, anche vuoto: a gennaio va al commercialista con l'estratto (§390). */
  async yearSummaryForProfile(professionalProfileId: string, year: number): Promise<CourtesyYearSummary> {
    const [profile, documents] = await Promise.all([
      this.prisma.professionalProfile.findUnique({
        where: { id: professionalProfileId },
        select: { businessName: true, fiscalProfile: { select: { entityType: true, chargesVat: true, businessName: true, fiscalFirstName: true, fiscalLastName: true } } },
      }),
      this.prisma.courtesyDocument.findMany({
        where: { professionalProfileId, year, booking: { status: "COMPLETED" } },
        orderBy: { createdAt: "asc" },
        select: {
          ...COURTESY_DOCUMENT_FIELDS,
          ownDate: true,
          customerTaxCode: true,
          vatRatePercent: true,
          withholding: true,
          booking: {
            select: {
              ...COURTESY_BOOKING_FIELDS,
              scheduledAt: true,
              professionalCompletedAt: true,
              jobPayment: {
                select: { ...COURTESY_BOOKING_FIELDS.jobPayment.select, balancePaidAt: true, depositPaidAt: true, directReportedAt: true },
              },
              quote: { select: { invoiceRequest: true, guidedRequest: { select: { category: { select: { label: true } } } } } },
            },
          },
        },
      }),
    ]);

    const fiscal = profile?.fiscalProfile;
    const chargesVat = professionalChargesVat(fiscal?.entityType, fiscal?.chargesVat);
    const receipts: { sort: number; row: CourtesyYearRow }[] = [];
    const invoices: CourtesyYearRow[] = [];
    for (const doc of documents) {
      const booking = doc.booking;
      const summary = courtesyDocumentSummary(doc, booking);
      // L'importo del PDF dato al cliente; quello di oggi a parte, se è cambiato (G-10).
      const total = doc.pdfTotalEurCents ?? summary.totalEurCents;
      const request = booking.quote?.invoiceRequest ? invoiceRequestView(booking.quote.invoiceRequest) : null;
      const receipt = summary.kind === "RECEIPT";
      const vat = !receipt && chargesVat && total !== null ? splitVatEurCents(total, vatRateOf(doc.vatRatePercent) * 100) : null;
      const withholding = receipt && request?.kind === "VAT" && doc.withholding !== false && total !== null ? withholdingOf(total) : null;
      const paidAt = paidAtOf(booking);
      const row: CourtesyYearRow = {
        number: receipt ? (doc.number !== null ? courtesyReceiptNumber(doc.number, doc.year) : null) : doc.ownNumber,
        date: (!receipt && doc.ownDate ? doc.ownDate : courtesyDateOf(booking)).toISOString(),
        customerName: summary.customerName,
        customerHasVatNumber: request?.kind === "VAT",
        customerTaxId: request ? (request.kind === "VAT" ? request.vatNumber : request.taxCode) : doc.customerTaxCode,
        paidAt: paidAt?.toISOString() ?? null,
        jobLabel: summary.jobLabel,
        totalEurCents: total,
        currentEurCents: summary.totalEurCents,
        withholdingEurCents: withholding,
        vatEurCents: vat ? vat.vatEurCents + vat.roundingEurCents : null,
        stampDuty: !(chargesVat && !receipt) && total !== null && total > STAMP_DUTY_THRESHOLD_EUR_CENTS,
        amountChanged: summary.amountChanged,
      };
      if (receipt) receipts.push({ sort: doc.number ?? Number.MAX_SAFE_INTEGER, row });
      else invoices.push(row);
    }
    return {
      year,
      who: professionalFiscalName(fiscal, profile?.businessName),
      receipts: receipts.sort((a, b) => a.sort - b.sort || a.row.date.localeCompare(b.row.date)).map((r) => r.row),
      invoices: invoices.sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  /**
   * Il 15 dicembre alle 9 (docs/CHANGELOG.md §391): a chi ha documenti
   * dell'anno da sistemare, con l'importo cambiato dopo il PDF o senza
   * importo, un avviso con l'elenco, così il riepilogo dell'anno (anche
   * quello che a gennaio parte al commercialista) arriva pulito. Per chi fa
   * le ricevute anche i lavori terminati senza ricevuta o con la ricevuta
   * mai scaricata (§387): nel riepilogo mancherebbero o il cliente non l'ha.
   */
  @Cron("0 9 15 12 *", { timeZone: "Europe/Rome" })
  async remindDocumentsToFix(now: Date = new Date()): Promise<number> {
    const year = Number(romeMonthOf(now).slice(0, 4));
    const range = { gte: romeMonthRange(`${year}-01`).start, lt: romeMonthRange(`${year}-12`).end };
    const [documents, withoutReceipt] = await Promise.all([
      this.prisma.courtesyDocument.findMany({
        where: { year, booking: { status: "COMPLETED" } },
        orderBy: { createdAt: "asc" },
        select: {
          ...COURTESY_DOCUMENT_FIELDS,
          professionalProfileId: true,
          booking: { select: { ...COURTESY_BOOKING_FIELDS, status: true } },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          status: "COMPLETED",
          courtesyDocument: { is: null },
          professionalProfile: { fiscalProfile: { is: { entityType: "PRIVATE_INDIVIDUAL" } } },
          OR: [{ professionalCompletedAt: range }, { professionalCompletedAt: null, scheduledAt: range }],
        },
        select: {
          professionalProfileId: true,
          professionalCompletedAt: true,
          scheduledAt: true,
          jobPayment: { select: { balancePaidAt: true, directReportedAt: true } },
          client: { select: { name: true, surname: true, deletedAt: true } },
          quote: { select: { guidedRequest: { select: { category: { select: { label: true } } } } } },
        },
      }),
    ]);
    type Row = { label: string; customerName: string | null; reason: "AMOUNT_CHANGED" | "MISSING_AMOUNT" | "NOT_DOWNLOADED" | "NO_RECEIPT" };
    const toFix = new Map<string, Row[]>();
    const add = (profileId: string, row: Row) => toFix.set(profileId, [...(toFix.get(profileId) ?? []), row]);
    for (const doc of documents) {
      const summary = courtesyDocumentSummary(doc, doc.booking);
      const reason = summary.amountChanged
        ? "AMOUNT_CHANGED"
        : summary.totalEurCents === null
          ? "MISSING_AMOUNT"
          : summary.kind === "RECEIPT" && !summary.pdfDownloadedAt && doc.booking.status === "COMPLETED"
            ? "NOT_DOWNLOADED"
            : null;
      if (reason) add(doc.professionalProfileId, { label: summary.label, customerName: summary.customerName, reason });
    }
    const missing = withoutReceipt.map((booking) => ({ booking, date: courtesyDateOf(booking) })).filter(({ date }) => yearOf(date) === year);
    for (const { booking, date } of missing.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const job = booking.quote?.guidedRequest?.category.label ?? "Lavoro";
      const customerName = booking.client.deletedAt ? null : [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null;
      add(booking.professionalProfileId, { label: `${job} del ${accountingDateLabel(date.toISOString())}`, customerName, reason: "NO_RECEIPT" });
    }
    if (toFix.size === 0) return 0;
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { id: { in: [...toFix.keys()] }, user: { deletedAt: null } },
      select: { id: true, userId: true, fiscalProfile: { select: { accountantStatementsAt: true, accountantEmail: true } } },
    });
    let sent = 0;
    for (const profile of profiles) {
      try {
        await this.notificationsService.notify(profile.userId, "CLIENT_DOCUMENTS_TO_FIX", {
          year,
          accountant: !!profile.fiscalProfile?.accountantStatementsAt && !!profile.fiscalProfile.accountantEmail,
          documents: toFix.get(profile.id) ?? [],
        });
        sent += 1;
      } catch (err) {
        this.logger.error(`Avviso dei documenti da sistemare non mandato (${profile.id}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return sent;
  }

  /** La stessa copia vista dall'admin: solo se il professionista l'ha preparata, senza dare numeri nuovi, e resta nel registro azioni. */
  async forAdmin(bookingId: string, adminUserId: string): Promise<CourtesyCopyView> {
    const [booking, saved] = await Promise.all([this.loadBooking(bookingId), this.prisma.courtesyDocument.findUnique({ where: { bookingId }, select: { id: true } })]);
    if (!booking || !saved) throw new NotFoundException("Documento non trovato.");
    await this.auditLogService.record({ entityType: "CourtesyDocument", entityId: bookingId, fieldName: "read", changedByUserId: adminUserId, reason: "PDF del documento dato al cliente aperto da un admin" });
    return this.build(booking, false);
  }

  /**
   * Admin → Documenti ai clienti (docs/CHANGELOG.md §380): i più recenti per
   * primi. `q` cerca il numero ("4/2026", "12/A") o il nome del
   * professionista o del cliente.
   */
  async adminList(filter: { q?: string; kind?: "RECEIPT" | "INVOICE"; year?: number; bookingId?: string }): Promise<AdminCourtesyDocumentRow[]> {
    const q = filter.q?.trim();
    const receipt = q?.match(/^(\d{1,6})(?:\s*\/\s*(\d{4}))?$/);
    const search: Prisma.CourtesyDocumentWhereInput[] = q
      ? [
          ...(receipt ? [{ kind: "RECEIPT", number: Number(receipt[1]), ...(receipt[2] ? { year: Number(receipt[2]) } : {}) }] : []),
          { ownNumber: { contains: q, mode: "insensitive" } },
          { booking: { professionalProfile: { businessName: { contains: q, mode: "insensitive" } } } },
          { booking: { client: { name: { contains: q, mode: "insensitive" } } } },
          { booking: { client: { surname: { contains: q, mode: "insensitive" } } } },
        ]
      : [];
    const documents = await this.prisma.courtesyDocument.findMany({
      where: {
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.year ? { year: filter.year } : {}),
        ...(filter.bookingId ? { bookingId: filter.bookingId } : {}),
        ...(search.length > 0 ? { OR: search } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            scheduledAt: true,
            city: true,
            jobPayment: true,
            client: { select: { id: true, name: true, surname: true, deletedAt: true } },
            professionalProfile: { select: { id: true, userId: true, businessName: true } },
            quote: { select: { invoiceRequest: { select: { id: true } }, guidedRequest: { select: { id: true, city: true, category: { select: { label: true } } } } } },
          },
        },
      },
    });
    return documents.map((doc) => {
      const booking = doc.booking;
      const request = booking.quote?.guidedRequest ?? null;
      return {
        bookingId: booking.id,
        kind: doc.kind === "RECEIPT" ? "RECEIPT" : "INVOICE",
        label: courtesyDocumentLabel(doc),
        year: doc.year,
        createdAt: doc.createdAt.toISOString(),
        pdfDownloadedAt: doc.pdfDownloadedAt?.toISOString() ?? null,
        pdfTotalEurCents: doc.pdfTotalEurCents,
        totalEurCents: courtesyTotalEurCents(booking.jobPayment),
        invoiceRequested: !!booking.quote?.invoiceRequest,
        categoryLabel: request?.category.label ?? null,
        city: request?.city ?? booking.city ?? null,
        scheduledAt: booking.scheduledAt.toISOString(),
        bookingCanceled: booking.status === "CANCELED",
        guidedRequestId: request?.id ?? null,
        professional: { profileId: booking.professionalProfile.id, userId: booking.professionalProfile.userId, businessName: booking.professionalProfile.businessName },
        client: {
          userId: booking.client.id,
          name: booking.client.deletedAt ? null : [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
          accountDeleted: booking.client.deletedAt !== null,
        },
      };
    });
  }

  private loadBooking(bookingId: string) {
    return this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { select: { name: true, surname: true } },
        jobPayment: true,
        finalItems: { select: { name: true, priceEurCents: true } },
        professionalProfile: { select: { businessName: true, fiscalProfile: true } },
        quote: { select: { invoiceRequest: true, guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
      },
    });
  }

  /**
   * `assignNumber`: la prima volta che il professionista apre la ricevuta le
   * diamo il numero; l'admin e il cliente non ne danno mai. I consigli per
   * il professionista (la ritenuta, il codice fiscale da chiedere) restano
   * sullo schermo, mai nel documento (collaudo C-04).
   */
  private async build(
    booking: NonNullable<Awaited<ReturnType<CourtesyCopyService["loadBooking"]>>>,
    assignNumber: boolean,
    audience: "professional" | "client" = "professional",
  ): Promise<CourtesyCopyView> {
    const bookingId = booking.id;
    const professionalProfileId = booking.professionalProfileId;
    const saved = await this.prisma.courtesyDocument.findUnique({ where: { bookingId } });

    const fiscal = booking.professionalProfile.fiscalProfile;
    const issuerSnapshot = recipientFromFiscal(fiscal, booking.professionalProfile.businessName);
    const chargesVat = professionalChargesVat(fiscal?.entityType, fiscal?.chargesVat);
    const kind = fiscal?.entityType === "PRIVATE_INDIVIDUAL" ? "RECEIPT" : "INVOICE";
    const receipt = kind === "RECEIPT";

    // Il cliente: i dati che ha dato per il documento, altrimenti quelli che
    // scrive il professionista, partendo dal nome della prenotazione (C-05, G-07).
    const request = booking.quote?.invoiceRequest ? invoiceRequestView(booking.quote.invoiceRequest) : null;
    const accountName = bookingCustomerName(booking);
    const customerFields = request ? null : { name: saved?.customerName ?? accountName ?? "", taxCode: saved?.customerTaxCode ?? "" };
    const address = [
      [booking.street, booking.houseNumber].filter(Boolean).join(" "),
      [booking.postalCode, booking.city, booking.province ? `(${booking.province})` : null].filter(Boolean).join(" "),
    ].filter(Boolean);
    const customer: InvoiceParty = request
      ? // Sulla ricevuta niente codice destinatario o PEC: servono solo alla fattura elettronica (C-01).
        { name: request.name, lines: clientInvoiceLines(request).slice(1).filter((line) => !receipt || !/^(Codice destinatario|PEC) /.test(line)) }
      : { name: customerFields?.name ?? "", lines: [customerFields?.taxCode ? `Codice fiscale ${customerFields.taxCode}` : null, ...address].filter((line): line is string => !!line) };

    const jp = booking.jobPayment;
    const total = courtesyTotalEurCents(jp);
    const rate = vatRateOf(saved?.vatRatePercent);
    const vat = chargesVat && total !== null ? splitVatEurCents(total, rate * 100) : null;
    const workDate = courtesyDateOf(booking);
    const ownDate = !receipt && saved?.ownDate ? saved.ownDate : null;
    const date = ownDate ?? workDate;
    const number =
      kind === "RECEIPT"
        ? saved?.number
          ? courtesyReceiptNumber(saved.number, saved.year)
          : assignNumber
            ? await this.assignReceiptNumber(bookingId, professionalProfileId, yearOf(date))
            : null
        : (saved?.ownNumber ?? null);

    // Le voci del lavoro terminato (B-03, C-18, D-15): se non tornano col
    // totale (un rimborso), una riga sola col mestiere.
    const category = booking.quote?.guidedRequest?.category.label ?? null;
    const items = booking.finalItems.filter((item) => item.priceEurCents > 0);
    const itemsTotal = items.reduce((sum, item) => sum + item.priceEurCents, 0);
    const grossLines =
      total !== null && items.length > 0 && itemsTotal === total
        ? items.map((item) => ({ description: item.name, amountEurCents: item.priceEurCents }))
        : [{ description: category ? `Lavoro: ${category}` : "Lavoro", amountEurCents: total ?? 0 }];
    const lines = vat ? courtesyLinesTaxable(grossLines, vat.taxableEurCents) : grossLines;

    const withholdingApplies = receipt && request?.kind === "VAT" ? saved?.withholding !== false : null;
    const withholding =
      withholdingApplies === null || total === null
        ? null
        : { applies: withholdingApplies, amountEurCents: withholdingApplies ? withholdingOf(total) : 0, netEurCents: total - (withholdingApplies ? withholdingOf(total) : 0) };

    const notes: string[] = [];
    if (fiscal?.entityType === "SOLE_PROPRIETOR" && chargesVat === false) {
      notes.push("Operazione senza IVA, effettuata ai sensi dell'art. 1, commi 54-89, della Legge n. 190/2014 (regime forfettario).");
      if (request?.kind === "VAT") notes.push("Compenso non soggetto a ritenuta d'acconto ai sensi dell'art. 1, comma 67, della Legge n. 190/2014.");
    }
    if (receipt) {
      notes.push("Prestazione occasionale, senza partita IVA (art. 67, comma 1, lettera l, del TUIR).");
      notes.push("Operazione fuori campo IVA ai sensi dell'art. 5 del DPR n. 633/1972.");
    }
    if (!chargesVat && total !== null && total > STAMP_DUTY_THRESHOLD_EUR_CENTS) {
      notes.push(receipt ? "Marca da bollo da 2 € sull'originale (importo oltre 77,47 €)." : "Imposta di bollo da 2 € assolta in modo virtuale (importo oltre 77,47 €).");
    }

    const hints: string[] = [];
    if (audience === "professional") {
      if (withholding) {
        hints.push(
          "Il cliente ha la partita IVA: se è un'azienda, di solito trattiene il 20% di ritenuta d'acconto, la versa per te e a inizio anno ti manda la Certificazione Unica. Se non la trattiene, togli la spunta.",
        );
      }
      if (!receipt && !request && !customerFields?.taxCode) {
        hints.push("Per la fattura elettronica a un privato serve il suo codice fiscale: chiediglielo e scrivilo qui sotto.");
      }
    }

    // Prima di scaricare (D-14, G-03): per la fattura numero e data della
    // fattura vera; per tutti il nome del cliente e il pagamento completo.
    const missing: string[] = [];
    if (!receipt && !saved?.ownNumber) missing.push("il numero della tua fattura");
    if (!receipt && !saved?.ownDate) missing.push("la data della tua fattura");
    if (!customer.name.trim()) missing.push("il nome del cliente");
    if (total === null) missing.push("l'importo finale del lavoro");
    if (jp && onlineBalanceUnpaid(jp)) missing.push("il saldo online, quando il cliente lo paga");

    return {
      kind,
      issuer: recipientParty({ ...issuerSnapshot, sdiRecipientCode: null, pecEmail: null }),
      customer,
      date: date.toISOString(),
      ownDate: ownDate ? ownDate.toISOString().slice(0, 10) : null,
      lines,
      totalEurCents: total,
      vat: vat ? { taxableEurCents: vat.taxableEurCents, vatEurCents: vat.vatEurCents + vat.roundingEurCents, ratePercent: rate } : null,
      withholding,
      paidHow: paidHowOf(jp),
      notes,
      hints,
      invoiceRequested: !!request,
      customerFields: audience === "professional" ? customerFields : null,
      number,
      missing,
      pdfTotalEurCents: saved?.pdfTotalEurCents ?? null,
    };
  }

  /**
   * Quello che il professionista scrive sulla copia (collaudo del
   * 29/10/2026): numero e data della sua fattura, aliquota, nome e codice
   * fiscale del cliente quando il cliente non li ha dati, ritenuta sulle
   * ricevute a una partita IVA. Un campo vuoto toglie il valore.
   */
  async saveDetails(userId: string, bookingId: string, input: CourtesyDetailsInput): Promise<CourtesyCopyView> {
    const copy = await this.forProfessional(userId, bookingId);
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const invoice = copy.kind === "INVOICE";
    const ownDate = invoice && input.date !== undefined ? (input.date ? new Date(`${input.date}T00:00:00Z`) : null) : undefined;
    if (ownDate && ownDate.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new BadRequestException("La data della fattura non può essere nel futuro.");
    const data = {
      ...(invoice && input.number !== undefined ? { ownNumber: input.number.trim() || null } : {}),
      ...(ownDate !== undefined ? { ownDate, ...(ownDate ? { year: ownDate.getUTCFullYear() } : {}) } : {}),
      ...(copy.vat && input.vatRatePercent !== undefined ? { vatRatePercent: input.vatRatePercent } : {}),
      ...(copy.customerFields && input.customerName !== undefined ? { customerName: input.customerName.trim() || null } : {}),
      ...(copy.customerFields && input.customerTaxCode !== undefined ? { customerTaxCode: input.customerTaxCode.trim().toUpperCase() || null } : {}),
      ...(copy.withholding && input.withholding !== undefined ? { withholding: input.withholding } : {}),
    };
    await this.prisma.courtesyDocument.upsert({
      where: { bookingId },
      create: { bookingId, professionalProfileId, kind: copy.kind, year: yearOf(ownDate ?? copy.date), ...data },
      update: data,
    });
    return this.forProfessional(userId, bookingId);
  }

  /**
   * Prossimo numero della ricevuta del professionista per l'anno, dato una
   * volta sola per lavoro: riaprendo la copia resta lo stesso. Due copie
   * aperte nello stesso istante si contendono il numero: chi perde prende
   * il successivo.
   */
  private async assignReceiptNumber(bookingId: string, professionalProfileId: string, year: number): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const last = await this.prisma.courtesyDocument.aggregate({ where: { professionalProfileId, year, number: { not: null } }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      try {
        const saved = await this.prisma.courtesyDocument.upsert({
          where: { bookingId },
          create: { bookingId, professionalProfileId, kind: "RECEIPT", year, number },
          update: { kind: "RECEIPT", year, number },
        });
        return courtesyReceiptNumber(saved.number ?? number, saved.year);
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    throw new ConflictException("Non riusciamo a dare il numero alla ricevuta: riprova tra un attimo.");
  }
}

const NOT_COMPLETED_MESSAGE = "La ricevuta o la copia della fattura si prepara dopo \"Lavoro terminato\", con l'importo finale e la data del pagamento.";

type PaymentDates = {
  paymentMethod?: string;
  balanceDirect?: boolean;
  balancePaidAt: Date | null;
  depositPaidAt?: Date | null;
  directReportedAt: Date | null;
  paidEurCents?: number;
  grossAmountEurCents?: number;
};

/**
 * Quando il cliente ha pagato: il saldo online, o il lavoro terminato per il
 * pagamento diretto (e per il saldo diretto dopo l'acconto online).
 */
function paidAtOf(booking: { professionalCompletedAt: Date | null; jobPayment: PaymentDates | null }): Date | null {
  const jp = booking.jobPayment;
  if (!jp) return null;
  if (jp.paymentMethod === "MANOVIA" && !jp.balanceDirect) {
    if (jp.balancePaidAt) return jp.balancePaidAt;
    // L'acconto bastava a coprire il lavoro: pagato con l'acconto.
    return jp.paidEurCents !== undefined && jp.grossAmountEurCents !== undefined && jp.paidEurCents >= jp.grossAmountEurCents ? (jp.depositPaidAt ?? null) : null;
  }
  return jp.directReportedAt ?? booking.professionalCompletedAt;
}

/** Data del documento: il pagamento, altrimenti il lavoro terminato o l'appuntamento (collaudo C-02). */
function courtesyDateOf(booking: { professionalCompletedAt: Date | null; scheduledAt: Date; jobPayment: PaymentDates | null }): Date {
  return paidAtOf(booking) ?? booking.professionalCompletedAt ?? booking.scheduledAt;
}

/** Saldo online non ancora pagato: il documento aspetta (si scriverebbe solo l'acconto). */
function onlineBalanceUnpaid(jp: { paymentMethod: string; balanceDirect: boolean; balancePaidAt: Date | null; paidEurCents: number; grossAmountEurCents: number }): boolean {
  return jp.paymentMethod === "MANOVIA" && !jp.balanceDirect && !jp.balancePaidAt && jp.paidEurCents < jp.grossAmountEurCents;
}

function paidHowOf(jp: { paymentMethod: string; balanceDirect: boolean; paidEurCents: number } | null): string | null {
  if (!jp) return null;
  if (jp.paymentMethod !== "MANOVIA" || jp.paidEurCents === 0) return "Pagato direttamente al professionista";
  return jp.balanceDirect ? "Acconto pagato online, saldo direttamente al professionista" : "Pagato online";
}

/** Aliquota scelta sulla copia; 22% se non l'ha cambiata (B-04). */
function vatRateOf(value: number | null | undefined): CourtesyVatRate {
  return (COURTESY_VAT_RATES as readonly number[]).includes(value ?? 22) ? ((value ?? 22) as CourtesyVatRate) : 22;
}

/** Ritenuta d'acconto del 20% sul compenso lordo (C-04). */
function withholdingOf(totalEurCents: number): number {
  return Math.round((totalEurCents * WITHHOLDING_RATE_PERCENT) / 100);
}

/** Nome del cliente sulla prenotazione: chi riceve il lavoro, o il titolare dell'account. */
function bookingCustomerName(booking: { recipientName: string | null; recipientSurname: string | null; client: { name: string | null; surname: string | null } }): string | null {
  const name = booking.recipientName
    ? [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ")
    : [booking.client.name, booking.client.surname].filter(Boolean).join(" ");
  return name || null;
}

/** "il numero, la data e il nome del cliente". */
function joinMissing(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Anno del documento, in ora italiana. */
function yearOf(date: Date | string): number {
  return Number(romeMonthOf(new Date(date)).slice(0, 4));
}

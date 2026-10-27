import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  STAMP_DUTY_THRESHOLD_EUR_CENTS,
  clientInvoiceLines,
  courtesyDocumentLabel,
  courtesyReceiptNumber,
  professionalChargesVat,
  splitVatEurCents,
  type AdminCourtesyDocumentRow,
  type CourtesyCopyView,
  type CourtesyNumberInput,
  type InvoiceParty,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { invoiceRequestView } from "../client-invoice-requests/client-invoice-requests.service";
import { InvoicesService } from "./invoices.service";
import { recipientFromFiscal, recipientParty } from "./invoice-documents";
import { romeMonthOf } from "./accounting-dates";

/**
 * Copia di cortesia del documento che il professionista dà al cliente
 * (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md §372): fattura
 * per chi ha la partita IVA, ricevuta per prestazione occasionale per il
 * privato. Solo una pagina da stampare: il documento valido lo emette lui,
 * noi non mandiamo nulla all'Agenzia delle Entrate. Il numero della
 * ricevuta lo diamo noi, quello della fattura lo scrive lui (§374); l'elenco
 * dei documenti preparati lo vede l'admin per l'assistenza (§375).
 */
@Injectable()
export class CourtesyCopyService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly invoicesService: InvoicesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async forProfessional(userId: string, bookingId: string): Promise<CourtesyCopyView> {
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const booking = await this.loadBooking(bookingId);
    // Solo il professionista del lavoro, e solo dopo l'accettazione (CLAUDE.md §5 punto 9).
    if (!booking || booking.professionalProfileId !== professionalProfileId || booking.status === "CANCELED") throw new NotFoundException("Lavoro non trovato.");
    return this.build(booking, true);
  }

  /**
   * Il PDF scaricato dal professionista: ci segniamo quando e con che
   * importo, così in assistenza si sa cosa ha in mano il cliente (§375).
   */
  async forProfessionalPdf(userId: string, bookingId: string): Promise<CourtesyCopyView> {
    const copy = await this.forProfessional(userId, bookingId);
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const downloaded = { pdfDownloadedAt: new Date(), pdfTotalEurCents: copy.totalEurCents };
    await this.prisma.courtesyDocument.upsert({
      where: { bookingId },
      create: { bookingId, professionalProfileId, kind: copy.kind, year: yearOf(copy.date), ownNumber: copy.kind === "INVOICE" ? copy.number : null, ...downloaded },
      update: downloaded,
    });
    return copy;
  }

  /** La stessa copia vista dall'admin: solo se il professionista l'ha preparata, senza dare numeri nuovi, e resta nel registro azioni. */
  async forAdmin(bookingId: string, adminUserId: string): Promise<CourtesyCopyView> {
    const [booking, saved] = await Promise.all([this.loadBooking(bookingId), this.prisma.courtesyDocument.findUnique({ where: { bookingId }, select: { id: true } })]);
    if (!booking || !saved) throw new NotFoundException("Documento non trovato.");
    await this.auditLogService.record({ entityType: "CourtesyDocument", entityId: bookingId, fieldName: "read", changedByUserId: adminUserId, reason: "PDF del documento dato al cliente aperto da un admin" });
    return this.build(booking, false);
  }

  /**
   * Admin → Documenti ai clienti (docs/CHANGELOG.md §375): i più recenti per
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
        professionalProfile: { select: { businessName: true, fiscalProfile: true } },
        quote: { select: { invoiceRequest: true, guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
      },
    });
  }

  /** `assignNumber`: la prima volta che il professionista apre la ricevuta le diamo il numero; l'admin non ne dà mai. */
  private async build(booking: NonNullable<Awaited<ReturnType<CourtesyCopyService["loadBooking"]>>>, assignNumber: boolean): Promise<CourtesyCopyView> {
    const bookingId = booking.id;
    const professionalProfileId = booking.professionalProfileId;
    const saved = await this.prisma.courtesyDocument.findUnique({ where: { bookingId } });

    const fiscal = booking.professionalProfile.fiscalProfile;
    const issuerSnapshot = recipientFromFiscal(fiscal, booking.professionalProfile.businessName);
    const chargesVat = professionalChargesVat(fiscal?.entityType, fiscal?.chargesVat);
    const kind = fiscal?.entityType === "PRIVATE_INDIVIDUAL" ? "RECEIPT" : "INVOICE";

    const request = booking.quote?.invoiceRequest ? invoiceRequestView(booking.quote.invoiceRequest) : null;
    const customer: InvoiceParty = request
      ? { name: request.name, lines: clientInvoiceLines(request).slice(1) }
      : {
          name: [booking.client.name, booking.client.surname].filter(Boolean).join(" "),
          lines: [[booking.street, booking.houseNumber].filter(Boolean).join(" "), [booking.postalCode, booking.city, booking.province ? `(${booking.province})` : null].filter(Boolean).join(" ")].filter(Boolean),
        };

    const jp = booking.jobPayment;
    const total = courtesyTotalEurCents(jp);
    const vat = chargesVat && total !== null ? splitVatEurCents(total) : null;
    const date = booking.professionalCompletedAt ?? jp?.balancePaidAt ?? jp?.directReportedAt ?? booking.scheduledAt;
    const number =
      kind === "RECEIPT"
        ? saved?.number
          ? courtesyReceiptNumber(saved.number, saved.year)
          : assignNumber
            ? await this.assignReceiptNumber(bookingId, professionalProfileId, yearOf(date))
            : null
        : (saved?.ownNumber ?? null);
    const guided = booking.quote?.guidedRequest;
    const description = [guided?.category.label, guided?.description.split(/\r?\n/)[0]?.trim()].filter(Boolean).join(": ") || "Lavoro";

    const notes: string[] = [];
    if (fiscal?.entityType === "SOLE_PROPRIETOR" && chargesVat === false) {
      notes.push("Operazione senza IVA, effettuata ai sensi dell'art. 1, commi 54-89, della Legge n. 190/2014 (regime forfettario).");
    }
    if (kind === "RECEIPT") notes.push("Prestazione occasionale, senza partita IVA (art. 67, comma 1, lettera l, del TUIR).");
    if (!chargesVat && total !== null && total > STAMP_DUTY_THRESHOLD_EUR_CENTS) {
      notes.push(kind === "RECEIPT" ? "Marca da bollo da 2 € sull'originale (importo oltre 77,47 €)." : "Imposta di bollo da 2 € assolta in modo virtuale (importo oltre 77,47 €).");
    }
    if (kind === "RECEIPT" && request?.kind === "VAT") {
      notes.push("Se il cliente è un'azienda o ha la partita IVA, di solito trattiene il 20% di ritenuta d'acconto e la versa per te: chiedi al tuo commercialista.");
    }

    return {
      kind,
      issuer: recipientParty({ ...issuerSnapshot, sdiRecipientCode: null, pecEmail: null }),
      customer,
      date: date.toISOString(),
      description,
      totalEurCents: total,
      vat: vat ? { taxableEurCents: vat.taxableEurCents, vatEurCents: vat.vatEurCents + vat.roundingEurCents, ratePercent: 22 } : null,
      paidHow: jp ? (jp.paymentMethod === "MANOVIA" ? "Pagato online con carta" : "Pagato direttamente al professionista") : null,
      notes,
      invoiceRequested: !!request,
      number,
    };
  }

  /** Il numero della fattura del professionista, da riportare sulla copia (vuoto per toglierlo). */
  async setOwnNumber(userId: string, bookingId: string, input: CourtesyNumberInput): Promise<CourtesyCopyView> {
    const copy = await this.forProfessional(userId, bookingId);
    if (copy.kind === "INVOICE") {
      const ownNumber = input.number?.trim() || null;
      const professionalProfileId = await this.invoicesService.profileIdOf(userId);
      await this.prisma.courtesyDocument.upsert({
        where: { bookingId },
        create: { bookingId, professionalProfileId, kind: "INVOICE", year: yearOf(copy.date), ownNumber },
        update: { kind: "INVOICE", ownNumber },
      });
      return { ...copy, number: ownNumber };
    }
    return copy;
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

/** Anno del documento, in ora italiana. */
function yearOf(date: Date | string): number {
  return Number(romeMonthOf(new Date(date)).slice(0, 4));
}

/** Importo del documento: quanto è stato pagato online (meno i rimborsi), o il totale del lavoro. */
function courtesyTotalEurCents(jp: { paymentMethod: string; paidEurCents: number; refundedEurCents: number; grossAmountEurCents: number } | null): number | null {
  if (!jp) return null;
  return jp.paymentMethod === "MANOVIA" && jp.paidEurCents > 0 ? jp.paidEurCents - jp.refundedEurCents : jp.grossAmountEurCents;
}

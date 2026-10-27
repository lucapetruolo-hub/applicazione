import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  STAMP_DUTY_THRESHOLD_EUR_CENTS,
  clientInvoiceLines,
  professionalChargesVat,
  splitVatEurCents,
  type CourtesyCopyView,
  type InvoiceParty,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { invoiceRequestView } from "../client-invoice-requests/client-invoice-requests.service";
import { InvoicesService } from "./invoices.service";
import { recipientFromFiscal, recipientParty } from "./invoice-documents";

/**
 * Copia di cortesia del documento che il professionista dà al cliente
 * (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md §372): fattura
 * per chi ha la partita IVA, ricevuta per prestazione occasionale per il
 * privato. Solo una pagina da stampare: il documento valido lo emette lui,
 * noi non mandiamo nulla all'Agenzia delle Entrate.
 */
@Injectable()
export class CourtesyCopyService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly invoicesService: InvoicesService,
  ) {}

  async forProfessional(userId: string, bookingId: string): Promise<CourtesyCopyView> {
    const professionalProfileId = await this.invoicesService.profileIdOf(userId);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { select: { name: true, surname: true } },
        jobPayment: true,
        professionalProfile: { select: { businessName: true, fiscalProfile: true } },
        quote: { select: { invoiceRequest: true, guidedRequest: { select: { description: true, category: { select: { label: true } } } } } },
      },
    });
    // Solo il professionista del lavoro, e solo dopo l'accettazione (CLAUDE.md §5 punto 9).
    if (!booking || booking.professionalProfileId !== professionalProfileId || booking.status === "CANCELED") throw new NotFoundException("Lavoro non trovato.");

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
    const total = jp ? (jp.paymentMethod === "MANOVIA" && jp.paidEurCents > 0 ? jp.paidEurCents - jp.refundedEurCents : jp.grossAmountEurCents) : null;
    const vat = chargesVat && total !== null ? splitVatEurCents(total) : null;
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
      date: (booking.professionalCompletedAt ?? jp?.balancePaidAt ?? jp?.directReportedAt ?? booking.scheduledAt).toISOString(),
      description,
      totalEurCents: total,
      vat: vat ? { taxableEurCents: vat.taxableEurCents, vatEurCents: vat.vatEurCents + vat.roundingEurCents, ratePercent: 22 } : null,
      paidHow: jp ? (jp.paymentMethod === "MANOVIA" ? "Pagato online con carta" : "Pagato direttamente al professionista") : null,
      notes,
      invoiceRequested: !!request,
    };
  }
}

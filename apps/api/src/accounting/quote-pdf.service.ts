import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  accountingDateLabel,
  cancellationNoticeLabel,
  clientPaymentOffer,
  formatAppointmentDate,
  formatAppointmentTimeRange,
  formatEurCents,
  formatJobDays,
  formatServicePriceRange,
  jobPaymentChoiceCopy,
  professionalChargesVat,
  professionalKindOf,
  quotePaymentSplit,
  quotePaymentSplitLine,
  quotePriceTaxNote,
  quotePriceTotals,
  TRADER_STATUS_COPY,
  UPFRONT_PAYMENT_NOTE,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { stripeVerified } from "../professional-fiscal/public-visibility";
import { quoteExecutor } from "../guided-requests/guided-requests.service";
import { EMAIL_BRAND } from "../email/email-brand";
import type { PdfBlock, PdfDocumentModel } from "./document-pdf";
import { JobDocumentsService } from "./job-documents.service";

const STATUS_LABEL: Record<string, string> = {
  SENT: "Da accettare",
  MODIFICATION_REQUESTED: "Nuova data proposta, in attesa",
  ACCEPTED: "Accettato",
  REJECTED: "Rifiutato",
  WITHDRAWN: "Ritirato dal professionista",
};

/** "martedì 10 novembre 2026 · 09:00–12:00", o i giorni di un lavoro lungo. */
function whenLabel(start: Date, end: Date | null): string {
  const days = end ? formatJobDays(start, end) : null;
  if (days) return `${days} · ogni giorno ${formatAppointmentTimeRange(start, end)}`;
  return `${formatAppointmentDate(start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · ${formatAppointmentTimeRange(start, end)}`;
}

/**
 * PDF del preventivo, dalla voce "Documenti" del menu della richiesta
 * (richiesta di Luca del 05/11/2026,
 * docs/changelog/2026-11-05-scheda-preventivo-semplice.md): tutto quello
 * che il cliente legge nella scheda, da conservare o stampare. Lo scaricano
 * il cliente della richiesta e il professionista che l'ha mandato. Niente
 * contatti del cliente: prima dell'accettazione il professionista non li
 * vede (CLAUDE.md §5 punto 9), quindi nel PDF solo la città del lavoro.
 */
@Injectable()
export class QuotePdfService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jobDocuments: JobDocumentsService,
  ) {}

  async forUser(userId: string, quoteId: string): Promise<{ model: PdfDocumentModel; fileName: string }> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        items: { orderBy: { id: "asc" } },
        guidedRequest: { select: { clientId: true, description: true, city: true, serviceMode: true, category: { select: { label: true } } } },
        professionalProfile: {
          select: {
            userId: true,
            businessName: true,
            city: true,
            cancellationNoticeHours: true,
            fiscalProfile: {
              select: {
                stripePayoutsEnabled: true,
                entityType: true,
                chargesVat: true,
                businessName: true,
                fiscalFirstName: true,
                fiscalLastName: true,
                vatNumber: true,
                registeredCity: true,
                registeredProvince: true,
              },
            },
          },
        },
        booking: { select: { createdAt: true } },
      },
    });
    const allowed = quote && (quote.guidedRequest.clientId === userId || quote.professionalProfile.userId === userId);
    if (!quote || !allowed) throw new NotFoundException("Preventivo non trovato.");

    const pro = quote.professionalProfile;
    const fiscal = pro.fiscalProfile;
    const totals = quotePriceTotals(quote.items);
    const hasPrice = totals.totalMinEurCents > 0 || totals.totalMaxEurCents > 0;
    const offer = clientPaymentOffer(quote, stripeVerified(fiscal), totals.totalMaxEurCents);
    const executor = quoteExecutor(fiscal);
    const isPrivate = professionalKindOf(fiscal?.entityType) === "PRIVATE";
    const taxNote = quotePriceTaxNote(professionalChargesVat(fiscal?.entityType, fiscal?.chargesVat));
    const notice = quote.cancellationNoticeHours ?? pro.cancellationNoticeHours;
    const request = quote.guidedRequest;

    const blocks: PdfBlock[] = [];
    if (hasPrice) blocks.push({ type: "highlight", label: "Totale", value: formatServicePriceRange(totals.totalMinEurCents, totals.totalMaxEurCents), detail: taxNote, badge: STATUS_LABEL[quote.status] ?? null });
    blocks.push({
      type: "meta",
      items: [
        { label: "Inviato il", value: accountingDateLabel((quote.resentAt ?? quote.createdAt).toISOString()) },
        ...(quote.booking ? [{ label: "Accettato il", value: accountingDateLabel(quote.booking.createdAt.toISOString()) }] : []),
        // Lo stato è già nel bollino accanto al totale.
        ...(hasPrice ? [] : [{ label: "Stato", value: STATUS_LABEL[quote.status] ?? quote.status }]),
      ],
    });
    blocks.push({
      type: "parties",
      parties: [
        {
          label: "Da",
          name: executor?.name ?? pro.businessName,
          lines: [
            ...(executor && executor.name !== pro.businessName ? [pro.businessName] : []),
            ...(executor?.vatNumber ? [`P.IVA ${executor.vatNumber}`] : []),
            ...(executor?.seat ? [`Sede a ${executor.seat}`] : []),
            ...(!executor && isPrivate ? [TRADER_STATUS_COPY.PRIVATE.note] : []),
          ],
        },
        {
          label: "Lavoro",
          name: request.category.label,
          lines: [request.serviceMode === "ONLINE" ? "Online" : `A ${request.city}`],
        },
      ],
    });
    if (request.description) blocks.push({ type: "heading", text: "La richiesta" }, { type: "text", lines: [request.description] });
    blocks.push({ type: "heading", text: "Quando" }, { type: "text", lines: [whenLabel(quote.estimatedStartDate, quote.estimatedEndDate)] });
    if (quote.items.length > 0) {
      blocks.push({ type: "heading", text: "Prezzo" });
      blocks.push({ type: "rows", rows: quote.items.map((item) => ({ label: item.name, value: formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents) })) });
      if (hasPrice) blocks.push({ type: "totals", rows: [], total: { label: "Totale", value: formatServicePriceRange(totals.totalMinEurCents, totals.totalMaxEurCents), detail: taxNote } });
    }

    // Pagamento: con le cifre di ora e di dopo, come nella scheda.
    const paymentLines = offer.paymentOptions.map((choice) => {
      const title = jobPaymentChoiceCopy(choice, offer.depositPercent, offer.paymentOptions.length === 1).title;
      return quotePaymentSplit(choice, totals, offer.depositPercent) ? `${title}: ${quotePaymentSplitLine(choice, totals, offer.depositPercent, true)}` : title;
    });
    if (offer.paymentOptions.length > 1) paymentLines.push("Il modo si sceglie accettando.");
    const anyOnline = offer.paymentOptions.some((choice) => quotePaymentSplit(choice, totals, offer.depositPercent));
    const full = offer.paymentOptions.some((choice) => quotePaymentSplit(choice, totals, offer.depositPercent)?.restMaxEurCents === 0);
    blocks.push({ type: "heading", text: "Pagamento" }, { type: "text", lines: paymentLines });
    if (anyOnline) {
      blocks.push({
        type: "note",
        tone: "green",
        lines: [full ? UPFRONT_PAYMENT_NOTE : "Online si paga con carta sul sito. Il professionista riceve i soldi quando confermi che il lavoro è fatto."],
      });
    }

    blocks.push({ type: "heading", text: "Annullare" }, { type: "text", lines: [`Avvisa almeno ${cancellationNoticeLabel(notice)} prima.`] });
    if (quote.lateCancelKeepsDeposit && anyOnline) blocks.push({ type: "text", muted: true, lines: ["Se annulli più tardi e hai pagato l'acconto online, l'acconto resta al professionista."] });
    if (quote.notes?.trim()) blocks.push({ type: "heading", text: "Messaggio del professionista" }, { type: "text", lines: [quote.notes.trim()] });
    blocks.push({
      type: "text",
      muted: true,
      lines: [`Preventivo di ${pro.businessName}, inviato tramite ${EMAIL_BRAND.name}. Recesso e annullamento: pagina Termini del sito.`],
    });

    const base = `preventivo-${pro.businessName}-${quote.estimatedStartDate.toISOString().slice(0, 10)}`;
    return {
      model: { title: "Preventivo", subtitle: request.category.label, blocks, issuedBy: pro.businessName },
      fileName: base,
    };
  }

  /**
   * Riepilogo dei pagamenti di un lavoro per il cliente (05/11/2026): nella
   * finestra "Documenti" i pagamenti si vedevano ma non si scaricavano. Non è
   * una fattura né una ricevuta: quella la fa il professionista.
   */
  async paymentsForClient(userId: string, bookingId: string): Promise<{ model: PdfDocumentModel; fileName: string }> {
    const view = await this.jobDocuments.forUser(userId, bookingId);
    if (view.audience !== "CLIENT" || view.movements.length === 0) throw new NotFoundException("Nessun pagamento su questo lavoro.");
    const booking = await this.prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { professionalProfile: { select: { businessName: true } } } });
    const businessName = booking.professionalProfile.businessName;
    // Per il cliente i pagamenti sono in negativo e i rimborsi in positivo.
    const paid = -view.movements.reduce((sum, m) => sum + m.amountEurCents, 0);
    const model: PdfDocumentModel = {
      title: "Riepilogo dei pagamenti",
      subtitle: businessName,
      blocks: [
        { type: "rows", rows: view.movements.map((m) => ({ label: m.label, detail: accountingDateLabel(m.date), value: formatEurCents(Math.abs(m.amountEurCents)) })) },
        { type: "totals", rows: [], total: { label: "Totale pagato", value: formatEurCents(paid) } },
        {
          type: "text",
          muted: true,
          lines: [`Riepilogo di ${EMAIL_BRAND.name}: non è una fattura né una ricevuta. La fattura o la ricevuta del lavoro la fa il professionista.`],
        },
      ],
    };
    return { model, fileName: `pagamenti-${businessName}` };
  }
}

import type { Prisma } from "@professionisti/database";
import { courtesyAmountChanged, courtesyDocumentLabel, courtesyTotalEurCents, type CourtesyDocumentSummary } from "@professionisti/shared";

/** Campi del documento che servono al riepilogo (docs/CHANGELOG.md §381). */
export const COURTESY_DOCUMENT_FIELDS = {
  bookingId: true,
  kind: true,
  number: true,
  year: true,
  pdfDownloadedAt: true,
  pdfTotalEurCents: true,
  customerName: true,
} satisfies Prisma.CourtesyDocumentSelect;

/** Campi del lavoro che servono al riepilogo: importo, nome del cliente, mestiere. */
export const COURTESY_BOOKING_FIELDS = {
  recipientName: true,
  recipientSurname: true,
  jobPayment: { select: { paymentMethod: true, balanceDirect: true, paidEurCents: true, refundedEurCents: true, grossAmountEurCents: true } },
  client: { select: { name: true, surname: true, deletedAt: true } },
  quote: { select: { invoiceRequest: { select: { name: true } }, guidedRequest: { select: { category: { select: { label: true } } } } } },
} satisfies Prisma.BookingSelect;

type CourtesyDocumentFields = Prisma.CourtesyDocumentGetPayload<{ select: typeof COURTESY_DOCUMENT_FIELDS }>;

type CourtesyBookingFields = {
  recipientName: string | null;
  recipientSurname: string | null;
  jobPayment: { paymentMethod: string; balanceDirect: boolean; paidEurCents: number; refundedEurCents: number; grossAmountEurCents: number } | null;
  client: { name: string | null; surname: string | null; deletedAt: Date | null };
  quote: { invoiceRequest: { name: string } | null; guidedRequest: { category: { label: string } } | null } | null;
};

/**
 * Il nome sul documento (collaudo C-05, D-04): quello dei dati chiesti dal
 * cliente, poi quello scritto dal professionista, poi chi riceve il lavoro o
 * il titolare dell'account (mai di un account chiuso).
 */
export function courtesyCustomerName(doc: { customerName: string | null }, booking: CourtesyBookingFields): string | null {
  if (booking.quote?.invoiceRequest?.name) return booking.quote.invoiceRequest.name;
  if (doc.customerName) return doc.customerName;
  if (booking.recipientName) return [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ");
  if (booking.client.deletedAt) return null;
  return [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null;
}

/** Il documento come lo vede il professionista: nome, cliente, importo e se è cambiato dopo il PDF. */
export function courtesyDocumentSummary(doc: CourtesyDocumentFields, booking: CourtesyBookingFields): CourtesyDocumentSummary {
  const total = courtesyTotalEurCents(booking.jobPayment);
  return {
    bookingId: doc.bookingId,
    kind: "RECEIPT",
    label: courtesyDocumentLabel(doc),
    year: doc.year,
    customerName: courtesyCustomerName(doc, booking),
    jobLabel: booking.quote?.guidedRequest?.category.label ?? null,
    totalEurCents: total,
    pdfDownloadedAt: doc.pdfDownloadedAt?.toISOString() ?? null,
    pdfTotalEurCents: doc.pdfTotalEurCents,
    amountChanged: courtesyAmountChanged(doc.pdfTotalEurCents, total),
  };
}

import type { Prisma } from "@professionisti/database";
import { courtesyAmountChanged, courtesyDocumentLabel, courtesyTotalEurCents, type CourtesyDocumentSummary } from "@professionisti/shared";

/** Campi del documento che servono al riepilogo (docs/CHANGELOG.md §377). */
export const COURTESY_DOCUMENT_FIELDS = {
  bookingId: true,
  kind: true,
  number: true,
  year: true,
  ownNumber: true,
  pdfDownloadedAt: true,
  pdfTotalEurCents: true,
} satisfies Prisma.CourtesyDocumentSelect;

type CourtesyDocumentFields = Prisma.CourtesyDocumentGetPayload<{ select: typeof COURTESY_DOCUMENT_FIELDS }>;

type CourtesyBookingFields = {
  jobPayment: { paymentMethod: string; paidEurCents: number; refundedEurCents: number; grossAmountEurCents: number } | null;
  client: { name: string | null; surname: string | null; deletedAt: Date | null };
  quote: { guidedRequest: { category: { label: string } } | null } | null;
};

/** Il documento come lo vede il professionista: nome, cliente, importo e se è cambiato dopo il PDF. */
export function courtesyDocumentSummary(doc: CourtesyDocumentFields, booking: CourtesyBookingFields): CourtesyDocumentSummary {
  const total = courtesyTotalEurCents(booking.jobPayment);
  return {
    bookingId: doc.bookingId,
    kind: doc.kind === "RECEIPT" ? "RECEIPT" : "INVOICE",
    label: courtesyDocumentLabel(doc),
    year: doc.year,
    customerName: booking.client.deletedAt ? null : [booking.client.name, booking.client.surname].filter(Boolean).join(" ") || null,
    jobLabel: booking.quote?.guidedRequest?.category.label ?? null,
    totalEurCents: total,
    pdfDownloadedAt: doc.pdfDownloadedAt?.toISOString() ?? null,
    pdfTotalEurCents: doc.pdfTotalEurCents,
    amountChanged: courtesyAmountChanged(doc.pdfTotalEurCents, total),
  };
}

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  accountingMonthLabel,
  courtesyAmountChanged,
  courtesyDocumentLabel,
  courtesyTotalEurCents,
  invoiceNumberLabel,
  type JobDocumentMovement,
  type JobDocumentsView,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { romeMonthOf } from "./accounting-dates";

/**
 * I documenti contabili di un lavoro, dalla voce "Documenti" del menu della
 * richiesta (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md §386).
 * Il professionista vede la sua ricevuta (solo nel lavoro occasionale), i movimenti
 * con le nostre trattenute e gli estratti dei mesi. Il cliente vede i suoi
 * pagamenti e la copia del documento solo dopo che il professionista ha
 * scaricato il PDF, con lo stesso importo; le nostre trattenute no.
 */
@Injectable()
export class JobDocumentsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async forUser(userId: string, bookingId: string): Promise<JobDocumentsView> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        clientId: true,
        status: true,
        professionalProfile: { select: { userId: true, fiscalProfile: { select: { entityType: true } } } },
        courtesyDocument: { select: { kind: true, number: true, year: true, ownNumber: true, pdfDownloadedAt: true, pdfTotalEurCents: true } },
        quote: { select: { invoiceRequest: { select: { id: true } } } },
        jobPayment: {
          select: {
            paymentMethod: true,
            balanceDirect: true,
            grossAmountEurCents: true,
            depositEurCents: true,
            depositPaidAt: true,
            balancePaidAt: true,
            paidEurCents: true,
            refundedEurCents: true,
            directReportedAt: true,
            payoutSentEurCents: true,
            payoutPaidAt: true,
            refunds: { where: { status: "PROCESSED" }, select: { amountEurCents: true, processedAt: true, createdAt: true } },
            feeEntries: {
              orderBy: { occurredAt: "asc" },
              select: { kind: true, grossEurCents: true, description: true, occurredAt: true, invoice: { select: { id: true, series: true, year: true, number: true } } },
            },
          },
        },
      },
    });
    const audience = booking?.professionalProfile.userId === userId ? "PROFESSIONAL" : booking?.clientId === userId ? "CLIENT" : null;
    if (!booking || !audience) throw new NotFoundException("Lavoro non trovato.");
    const pro = audience === "PROFESSIONAL";
    const ownInvoice = booking.professionalProfile.fiscalProfile?.entityType !== "PRIVATE_INDIVIDUAL";
    const invoiceRequested = !!booking.quote?.invoiceRequest;

    // La ricevuta: al cliente solo se il professionista l'ha scaricata e
    // l'importo è ancora quello. Niente più copie della fattura
    // (docs/changelog/2026-10-30-documenti-snelli.md).
    const jp = booking.jobPayment;
    const doc = booking.courtesyDocument?.kind === "RECEIPT" ? booking.courtesyDocument : null;
    const amountChanged = doc ? courtesyAmountChanged(doc.pdfTotalEurCents, courtesyTotalEurCents(jp)) : false;
    const clientDocument =
      !doc || booking.status !== "COMPLETED" || (!pro && (!doc.pdfDownloadedAt || amountChanged))
        ? null
        : { label: courtesyDocumentLabel(doc), kind: "RECEIPT" as const, amountChanged: pro && amountChanged };

    const movements: JobDocumentMovement[] = [];
    const push = (date: Date | null, label: string, amountEurCents: number, invoice: JobDocumentMovement["invoice"] = null) => {
      if (date && amountEurCents !== 0) movements.push({ date: date.toISOString(), label, amountEurCents, invoice });
    };
    if (jp) {
      // Chi paga è il cliente: per lui i pagamenti escono, per il professionista entrano.
      const sign = pro ? 1 : -1;
      if (jp.paymentMethod === "MANOVIA") {
        const deposit = jp.depositPaidAt ? (jp.depositEurCents ?? 0) : 0;
        push(jp.depositPaidAt, pro ? "Acconto pagato online dal cliente" : "Acconto pagato online", sign * deposit);
        push(jp.balancePaidAt, pro ? "Saldo pagato online dal cliente" : "Saldo pagato online", sign * (jp.paidEurCents - deposit));
      } else {
        push(jp.directReportedAt, pro ? "Pagamento diretto del cliente" : "Pagato direttamente al professionista", sign * jp.grossAmountEurCents);
      }
      for (const refund of jp.refunds) push(refund.processedAt ?? refund.createdAt, pro ? "Rimborso al cliente" : "Rimborso ricevuto", -sign * refund.amountEurCents);
      if (pro) {
        for (const entry of jp.feeEntries) {
          const invoice = entry.invoice ? { id: entry.invoice.id, number: invoiceNumberLabel(entry.invoice.series, entry.invoice.year, entry.invoice.number) } : null;
          push(entry.occurredAt, entry.kind === "HOLD" ? "Nostra trattenuta (IVA compresa)" : entry.description, -entry.grossEurCents, invoice);
        }
        push(jp.payoutPaidAt, "Bonifico arrivato in banca", jp.payoutSentEurCents);
      }
    }
    movements.sort((a, b) => a.date.localeCompare(b.date));

    const months = pro ? [...new Set(movements.map((m) => romeMonthOf(new Date(m.date))))].sort() : [];
    return {
      audience,
      bookingId: booking.id,
      clientDocument,
      // Solo a lavoro terminato, con l'importo finale (collaudo C-02, B-02), e solo per chi lavora senza partita IVA.
      clientDocumentAvailable: booking.status === "COMPLETED" && !ownInvoice,
      ownInvoice,
      invoiceRequested,
      movements,
      statementMonths: months.map((month) => ({ month, label: accountingMonthLabel(month) })),
    };
  }
}

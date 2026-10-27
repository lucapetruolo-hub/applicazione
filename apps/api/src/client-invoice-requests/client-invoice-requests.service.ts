import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import {
  clientInvoiceLines,
  notificationJobLabel,
  parseInvoiceRecipient,
  type ClientInvoiceKind,
  type ClientInvoiceRequestInput,
  type ClientInvoiceRequestView,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

type InvoiceRequestRow = {
  kind: string;
  name: string;
  taxCode: string | null;
  vatNumber: string | null;
  sdiRecipientCode: string | null;
  pecEmail: string | null;
  street: string;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  updatedAt: Date;
};

export function invoiceRequestView(row: InvoiceRequestRow): ClientInvoiceRequestView {
  return {
    kind: row.kind as ClientInvoiceKind,
    name: row.name,
    taxCode: row.taxCode,
    vatNumber: row.vatNumber,
    sdiRecipientCode: row.sdiRecipientCode,
    pecEmail: row.pecEmail,
    street: row.street,
    houseNumber: row.houseNumber,
    postalCode: row.postalCode,
    city: row.city,
    province: row.province,
    requestedAt: row.updatedAt.toISOString(),
  };
}

/** Dati da salvare, normalizzati (CF e P.IVA in maiuscolo e senza spazi). */
function rowData(input: ClientInvoiceRequestInput) {
  const recipient = parseInvoiceRecipient(input.recipient);
  if (!recipient.ok) throw new BadRequestException(recipient.error);
  const clean = (value: string | undefined) => value?.toUpperCase().replace(/\s/g, "") || null;
  return {
    kind: input.kind,
    name: input.name,
    taxCode: clean(input.taxCode),
    vatNumber: input.kind === "VAT" ? clean(input.vatNumber)?.replace(/^IT/, "") ?? null : null,
    // Al codice destinatario serve una P.IVA: per una persona la fattura va nel suo cassetto fiscale.
    sdiRecipientCode: input.kind === "VAT" ? recipient.sdiRecipientCode : null,
    pecEmail: input.kind === "VAT" ? recipient.pecEmail : null,
    street: input.street,
    houseNumber: input.houseNumber || null,
    postalCode: input.postalCode,
    city: input.city,
    province: input.province || null,
  };
}

/**
 * Fattura chiesta dal cliente al professionista (decisione dell'utente del
 * 27/10/2026, docs/CHANGELOG.md §372): la fa il professionista, noi gli
 * passiamo i dati. Si chiede accettando il preventivo o dopo, dalla scheda
 * del lavoro. Il professionista la legge nell'avviso "Preventivo accettato"
 * e sulla scheda del lavoro, mai prima dell'accettazione (CLAUDE.md §5
 * punto 9). Il codice fiscale è cifrato nel database.
 */
@Injectable()
export class ClientInvoiceRequestsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Ultimi dati usati dal cliente, per non riscriverli ogni volta. */
  async lastForClient(clientId: string): Promise<ClientInvoiceRequestView | null> {
    const row = await this.prisma.clientInvoiceRequest.findFirst({ where: { clientId }, orderBy: { updatedAt: "desc" } });
    return row ? invoiceRequestView(row) : null;
  }

  /** All'accettazione: salva (o toglie) la richiesta, prima che nasca il lavoro. */
  async saveAtAcceptance(clientId: string, quoteId: string, input: ClientInvoiceRequestInput | undefined): Promise<void> {
    if (!input) {
      await this.prisma.clientInvoiceRequest.deleteMany({ where: { quoteId, clientId } });
      return;
    }
    const data = rowData(input);
    await this.prisma.clientInvoiceRequest.upsert({ where: { quoteId }, create: { quoteId, clientId, ...data }, update: data });
  }

  /** Per l'avviso "Preventivo accettato": c'è una richiesta e le righe da copiare. */
  async forAcceptedNotice(quoteId: string): Promise<{ invoiceRequested: true; invoiceLines: string[] } | Record<string, never>> {
    const row = await this.prisma.clientInvoiceRequest.findUnique({ where: { quoteId } });
    return row ? { invoiceRequested: true, invoiceLines: clientInvoiceLines(invoiceRequestView(row)) } : {};
  }

  /**
   * Dopo l'accettazione, dalla scheda del lavoro: il cliente chiede la
   * fattura o cambia i dati, e il professionista lo sa subito.
   */
  async saveAfterAcceptance(clientId: string, quoteId: string, input: ClientInvoiceRequestInput): Promise<ClientInvoiceRequestView> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        guidedRequest: { select: { clientId: true, description: true, category: { select: { label: true } } } },
        booking: { select: { id: true, status: true } },
        professionalProfile: { select: { userId: true } },
        invoiceRequest: { select: { id: true } },
      },
    });
    if (!quote) throw new NotFoundException("Preventivo non trovato.");
    if (quote.guidedRequest.clientId !== clientId) throw new ForbiddenException("Questo preventivo non è associato a una tua richiesta.");
    if (!quote.booking || quote.booking.status === "CANCELED") throw new BadRequestException("Puoi chiedere la fattura per un lavoro accettato.");
    const data = rowData(input);
    const row = await this.prisma.clientInvoiceRequest.upsert({ where: { quoteId }, create: { quoteId, clientId, ...data }, update: { ...data, professionalSeenAt: null } });
    const view = invoiceRequestView(row);
    await this.notificationsService.notify(quote.professionalProfile.userId, "JOB_INVOICE_REQUESTED", {
      bookingId: quote.booking.id,
      guidedRequestId: quote.guidedRequestId,
      category: quote.guidedRequest.category.label,
      jobLabel: notificationJobLabel(quote.guidedRequest.description),
      changed: !!quote.invoiceRequest,
      invoiceLines: clientInvoiceLines(view),
    });
    return view;
  }

  /** Il cliente non vuole più la fattura. */
  async removeForClient(clientId: string, quoteId: string): Promise<void> {
    await this.prisma.clientInvoiceRequest.deleteMany({ where: { quoteId, clientId } });
  }
}

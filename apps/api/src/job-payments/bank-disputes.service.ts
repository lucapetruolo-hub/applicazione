import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { Prisma, PrismaClient } from "@professionisti/database";
import {
  BANK_DISPUTE_OPEN_STATUSES,
  BANK_DISPUTE_REVIEW_STATUSES,
  formatEur,
  type AdminBankDispute,
  type BankDisputeEvidenceInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { renderDocumentPdf, type PdfBlock, type PdfDocumentModel } from "../accounting/document-pdf";

/** Messaggi nel PDF: gli ultimi, abbastanza per la banca senza farne un libro. */
const MAX_MESSAGES = 80;

const JOB_INCLUDE = {
  booking: {
    include: {
      client: { select: { name: true, surname: true, email: true } },
      professionalProfile: { select: { businessName: true, city: true } },
      finalItems: true,
      issue: { select: { type: true, status: true, createdAt: true } },
      quote: { include: { items: true, guidedRequest: { select: { id: true, description: true, createdAt: true, category: { select: { label: true } } } } } },
    },
  },
} as const;

type Job = Prisma.JobPaymentGetPayload<{ include: typeof JOB_INCLUDE }>;

const day = (date: Date) => date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
const dayTime = (date: Date) => date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const businessName = (job: Job) => job.booking.professionalProfile.businessName ?? "Professionista";
const clientName = (job: Job) => [job.booking.client.name, job.booking.client.surname].filter(Boolean).join(" ") || job.booking.client.email || "Cliente";
const range = (min: number | null, max: number | null) => (min !== null && max !== null && min !== max ? `${formatEur(min)} - ${formatEur(max)}` : formatEur(max ?? min ?? 0));

/**
 * Contestazioni in banca dei pagamenti online dei lavori (richiesta di Luca
 * del 28/10/2026, docs/changelog/2026-10-28-stripe-prova.md): Admin →
 * Pagamenti le elenca, propone le prove già scritte e le manda alla banca
 * tramite Stripe, con un PDF del lavoro allegato.
 */
@Injectable()
export class BankDisputesService {
  private readonly logger = new Logger(BankDisputesService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  /** Contestazioni aperte o in mano alla banca, la scadenza più vicina prima. */
  async listOpen(): Promise<AdminBankDispute[]> {
    const jobs = await this.prisma.jobPayment.findMany({
      where: { stripeDisputeId: { not: null }, stripeDisputeStatus: { in: [...BANK_DISPUTE_OPEN_STATUSES, ...BANK_DISPUTE_REVIEW_STATUSES] } },
      include: JOB_INCLUDE,
      orderBy: { stripeDisputedAt: "asc" },
    });
    const rows = await Promise.all(jobs.map((job) => this.row(job)));
    return rows.sort((a, b) => (a.dueBy ?? "9999").localeCompare(b.dueBy ?? "9999"));
  }

  /**
   * Manda le prove (o le salva soltanto) sulla contestazione: PDF del lavoro
   * caricato su Stripe come documentazione del servizio, poi i campi. Dopo
   * l'invio alla banca non si possono più cambiare.
   */
  async saveEvidence(adminUserId: string, jobPaymentId: string, input: BankDisputeEvidenceInput): Promise<AdminBankDispute> {
    const stripe = this.stripe;
    if (!stripe) throw new BadRequestException("Stripe non è configurato su questo ambiente.");
    const job = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId }, include: JOB_INCLUDE });
    if (!job?.stripeDisputeId) throw new NotFoundException("Contestazione non trovata.");
    const options = this.requestOptions(job);
    const current = await stripe.disputes.retrieve(job.stripeDisputeId, {}, options);
    if (!(BANK_DISPUTE_OPEN_STATUSES as readonly string[]).includes(current.status)) {
      throw new BadRequestException("Le prove di questa contestazione sono già state mandate alla banca.");
    }

    const pdf = await renderDocumentPdf(await this.documentationWithMessages(job));
    const file = await stripe.files.create(
      { purpose: "dispute_evidence", file: { data: pdf, name: `lavoro-${job.bookingId.slice(0, 8)}.pdf`, type: "application/pdf" } },
      options,
    );
    const updated = await stripe.disputes.update(
      job.stripeDisputeId,
      {
        evidence: {
          product_description: input.productDescription,
          customer_name: input.customerName || undefined,
          customer_email_address: input.customerEmail || undefined,
          service_date: input.serviceDate || undefined,
          uncategorized_text: input.explanation,
          service_documentation: file.id,
        },
        submit: input.submit,
      },
      options,
    );
    await this.prisma.jobPayment.update({ where: { id: job.id }, data: { stripeDisputeStatus: updated.status } });
    await this.auditLogService.record({
      entityType: "JobPayment",
      entityId: job.id,
      fieldName: "stripeDisputeEvidence",
      newValue: { disputeId: job.stripeDisputeId, submitted: input.submit, status: updated.status },
      changedByUserId: adminUserId,
      reason: input.submit ? "Prove della contestazione mandate alla banca." : "Prove della contestazione salvate su Stripe.",
    });
    return this.row(job, updated);
  }

  /** PDF del lavoro per la banca, lo stesso che si allega alle prove. */
  async documentationPdf(jobPaymentId: string): Promise<Buffer> {
    const job = await this.prisma.jobPayment.findUnique({ where: { id: jobPaymentId }, include: JOB_INCLUDE });
    if (!job?.stripeDisputeId) throw new NotFoundException("Contestazione non trovata.");
    return renderDocumentPdf(await this.documentationWithMessages(job));
  }

  /** Addebito diretto: la contestazione sta sul conto del professionista. */
  private requestOptions(job: Job): Stripe.RequestOptions {
    return job.stripeDirectCharge && job.stripeDestinationAccountId ? { stripeAccount: job.stripeDestinationAccountId } : {};
  }

  private async row(job: Job, known?: Stripe.Dispute): Promise<AdminBankDispute> {
    let dispute = known ?? null;
    if (!dispute && this.stripe) {
      dispute = await this.stripe.disputes.retrieve(job.stripeDisputeId!, {}, this.requestOptions(job)).catch((err: Error) => {
        this.logger.warn(`Contestazione ${job.stripeDisputeId} non riletta da Stripe: ${err.message}`);
        return null;
      });
    }
    const status = dispute?.status ?? job.stripeDisputeStatus ?? "needs_response";
    const dueBy = dispute?.evidence_details?.due_by;
    return {
      jobPaymentId: job.id,
      bookingId: job.bookingId,
      disputeId: job.stripeDisputeId!,
      businessName: businessName(job),
      clientName: clientName(job),
      amountEurCents: dispute?.amount ?? job.paidEurCents,
      reason: dispute?.reason ?? null,
      status,
      dueBy: dueBy ? new Date(dueBy * 1000).toISOString() : null,
      submitted: !(BANK_DISPUTE_OPEN_STATUSES as readonly string[]).includes(status),
      draft: this.draft(job, dispute?.reason ?? null),
    };
  }

  /** Campi già scritti dal sito: l'admin li rilegge e li corregge se serve. */
  draft(job: Job, reason: string | null): AdminBankDispute["draft"] {
    const b = job.booking;
    const category = b.quote?.guidedRequest.category.label ?? "Lavoro";
    const items = (b.finalItems.length ? b.finalItems.map((i) => i.name) : (b.quote?.items ?? []).map((i) => i.name)).join(", ");
    const where = b.serviceMode === "ONLINE" ? "online" : `a domicilio${b.city ? ` a ${b.city}` : ""}`;
    const lines: string[] = [
      `Il cliente ${clientName(job)} ha chiesto un preventivo a ${businessName(job)} (${category}) tramite il nostro sito${b.quote ? ` il ${day(b.quote.guidedRequest.createdAt)}` : ""}.`,
      `Ha accettato il preventivo e pagato online il ${day(job.depositPaidAt ?? b.createdAt)}, con la sua carta e la sua conferma su una pagina di pagamento Stripe.`,
      `Appuntamento ${where} il ${day(b.scheduledAt)}.`,
    ];
    if (b.professionalCompletedAt) {
      lines.push(`Il professionista ha segnato il lavoro come terminato il ${day(b.professionalCompletedAt)}${b.finalAmountEurCents !== null ? `, per ${formatEur(b.finalAmountEurCents)}` : ""}.`);
    }
    if (b.clientConfirmedCompletedAt) lines.push(`Il cliente ha confermato sul sito che il lavoro era terminato il ${day(b.clientConfirmedCompletedAt)}.`);
    else if (b.completionAutoClosedAt) lines.push(`Il cliente non ha segnalato problemi nei giorni previsti e il lavoro si è chiuso il ${day(b.completionAutoClosedAt)}.`);
    lines.push(b.issue ? `Il cliente ha aperto una segnalazione sul sito il ${day(b.issue.createdAt)} (stato: ${b.issue.status}).` : "Il cliente non ha mai segnalato problemi sul sito, dove poteva farlo in ogni momento.");
    if (reason === "fraudulent" || reason === "unrecognized") {
      lines.push("Il pagamento è stato fatto dall'account del cliente sul nostro sito, lo stesso da cui ha scritto al professionista: in allegato i messaggi.");
    }
    if (job.refundedEurCents > 0) lines.push(`Gli è già stato rimborsato ${formatEur(job.refundedEurCents)}.`);
    lines.push("In allegato il riepilogo del lavoro: preventivo, pagamenti, chiusura e messaggi tra cliente e professionista.");
    return {
      productDescription: `${category} ${where}: ${items || "lavoro su preventivo"}.`,
      customerName: clientName(job),
      customerEmail: b.client.email ?? undefined,
      serviceDate: b.scheduledAt.toISOString().slice(0, 10),
      explanation: lines.join("\n"),
    };
  }

  documentation(job: Job): PdfDocumentModel {
    const b = job.booking;
    const blocks: PdfBlock[] = [
      {
        type: "parties",
        parties: [
          { label: "Professionista", name: businessName(job), lines: b.professionalProfile.city ? [b.professionalProfile.city] : [] },
          { label: "Cliente", name: clientName(job), lines: b.client.email ? [b.client.email] : [] },
        ],
      },
      { type: "heading", text: "Date" },
      {
        type: "rows",
        rows: [
          ...(b.quote ? [{ label: "Richiesta del cliente", value: dayTime(b.quote.guidedRequest.createdAt) }] : []),
          { label: "Preventivo accettato e acconto pagato", value: dayTime(job.depositPaidAt ?? b.createdAt) },
          { label: "Appuntamento", value: dayTime(b.scheduledAt) },
          ...(b.professionalCompletedAt ? [{ label: "Lavoro terminato (professionista)", value: dayTime(b.professionalCompletedAt) }] : []),
          ...(b.clientConfirmedCompletedAt ? [{ label: "Lavoro confermato dal cliente", value: dayTime(b.clientConfirmedCompletedAt) }] : []),
          ...(b.completionAutoClosedAt ? [{ label: "Chiuso senza segnalazioni del cliente", value: dayTime(b.completionAutoClosedAt) }] : []),
        ],
      },
    ];
    if (b.quote) {
      blocks.push(
        { type: "heading", text: "Richiesta del cliente" },
        { type: "text", lines: [b.quote.guidedRequest.description] },
        { type: "heading", text: "Preventivo accettato" },
        { type: "table", columns: [{ label: "Voce", width: 3 }, { label: "Prezzo", width: 1, align: "right" }], rows: b.quote.items.map((i) => ({ cells: [i.name, range(i.priceMinEurCents, i.priceMaxEurCents)] })) },
      );
      if (b.quote.notes) blocks.push({ type: "text", lines: [b.quote.notes], muted: true });
    }
    blocks.push({
      type: "heading",
      text: "Pagamenti online",
    });
    blocks.push({
      type: "rows",
      rows: [
        ...(job.depositPaidAt ? [{ label: "Acconto", detail: dayTime(job.depositPaidAt), value: formatEur(job.depositEurCents ?? 0) }] : []),
        ...(job.balancePaidAt ? [{ label: "Saldo", detail: dayTime(job.balancePaidAt), value: formatEur(job.paidEurCents - (job.depositEurCents ?? 0)) }] : []),
        ...(job.refundedEurCents > 0 ? [{ label: "Già rimborsato", value: `- ${formatEur(job.refundedEurCents)}` }] : []),
      ],
    });
    if (b.finalItems.length) {
      blocks.push(
        { type: "heading", text: "Lavoro terminato" },
        { type: "table", columns: [{ label: "Voce", width: 3 }, { label: "Importo", width: 1, align: "right" }], rows: b.finalItems.map((i) => ({ cells: [i.name, formatEur(i.priceEurCents)] })) },
      );
      if (b.professionalCompletionNote) blocks.push({ type: "text", lines: [b.professionalCompletionNote], muted: true });
    }
    return { title: "Riepilogo del lavoro", subtitle: `Contestazione ${job.stripeDisputeId} · ${formatEur(job.paidEurCents)} pagati online`, blocks };
  }

  /** Messaggi tra cliente e professionista, in fondo al PDF. */
  async documentationWithMessages(job: Job): Promise<PdfDocumentModel> {
    const model = this.documentation(job);
    const guidedRequestId = job.booking.quote?.guidedRequest.id;
    if (!guidedRequestId) return model;
    const events = await this.prisma.conversationEvent.findMany({
      where: { guidedRequestId, professionalProfileId: job.booking.professionalProfileId, automatic: false, actor: { in: ["CLIENT", "PROFESSIONAL"] } },
      orderBy: { createdAt: "desc" },
      take: MAX_MESSAGES,
      select: { actor: true, message: true, mediaUrls: true, createdAt: true },
    });
    if (!events.length) return model;
    const who = (actor: string) => (actor === "CLIENT" ? clientName(job) : businessName(job));
    const lines = events
      .reverse()
      .map((e) => `${dayTime(e.createdAt)} · ${who(e.actor)}: ${e.message || ""}${e.mediaUrls.length ? ` (${e.mediaUrls.length} foto)` : ""}`);
    return { ...model, blocks: [...model.blocks, { type: "heading", text: "Messaggi tra cliente e professionista" }, { type: "text", lines }] };
  }
}

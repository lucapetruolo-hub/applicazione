import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type Stripe from "stripe";
import type { Invoice, Prisma, PrismaClient } from "@professionisti/database";
import {
  FOUNDER_FREE_MONTHS,
  INVOICE_SERIES,
  INVOICE_SOURCE_LABEL,
  PLATFORM_VAT_RATE_BASIS_POINTS,
  accountingMonthLabel,
  freePeriodSummary,
  invoiceNumberLabel,
  isAccountingMonth,
  notificationJobLabel,
  subscriptionTierInfo,
  type BillingInterval,
  type DocumentsOverview,
  type InvoiceSdiStatusValue,
  type PlatformInvoiceAdminRow,
  type PlatformInvoiceLine,
  type PlatformInvoiceSettingsInput,
  type PlatformInvoiceSettingsView,
  type PlatformInvoiceSource,
  type PlatformInvoiceSummary,
  type PlatformInvoiceView,
  type SdiSandboxTestResult,
  type SubscriptionTier,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";
import { encryptFiscal, readFiscal } from "../common/fiscal-crypto";
import { subscriptionState } from "../subscriptions/subscription-rules";
import { lastDayOfMonth, previousMonth, romeDayIso, romeDayLabel, romeDayStart, romeMonthOf, romeMonthRange } from "./accounting-dates";
import { buildFatturaPaXml } from "./invoice-xml";
import {
  fatturaPaCustomer,
  fatturaPaIssuer,
  invoiceTotals,
  issuerParty,
  issuerSnapshot,
  monthlyFeeInvoiceDraft,
  recipientComplete,
  recipientFromFiscal,
  recipientName,
  recipientParty,
  sandboxTestInvoiceXml,
  sdiCompanyOf,
  sdiProgressive,
  xmlLineDescription,
  type IssuerSnapshot,
  type RecipientSnapshot,
} from "./invoice-documents";
import { sdiProviderFromEnv, type SdiProvider } from "./sdi-provider";

/** Lo SdI accetta una fattura entro 12 giorni dalla sua data: dopo non si riprova da soli. */
const SDI_RETRY_DAYS = 12;
/** Per quanti giorni dall'invio leggiamo l'esito: lo SdI risponde entro 5 giorni. */
const SDI_OUTCOME_DAYS = 30;
/** Nella prova d'invio, attesa tra una lettura dell'esito simulato e l'altra. */
const SDI_TEST_WAIT_MS = 1500;
const DAY_MS = 24 * 60 * 60 * 1000;

type NewInvoice = {
  professionalProfileId: string;
  source: PlatformInvoiceSource;
  creditNote: boolean;
  relatedInvoiceId: string | null;
  periodMonth: string | null;
  /** Data del documento (AAAA-MM-GG, ora di Roma). */
  date: string;
  lines: PlatformInvoiceLine[];
  grossEurCents: number;
  dedupeKey: string;
  stripeInvoiceId?: string | null;
  stripePaymentIntentId?: string | null;
  feeEntryIds?: string[];
  issuer: IssuerSnapshot;
};

function readRecipient(value: Prisma.JsonValue | null): RecipientSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as unknown as RecipientSnapshot;
  return { ...r, taxCode: readFiscal(r.taxCode ?? null) };
}

function readIssuer(value: Prisma.JsonValue | null): IssuerSnapshot | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as unknown as IssuerSnapshot) : null;
}

function readLines(value: Prisma.JsonValue | null): PlatformInvoiceLine[] {
  return Array.isArray(value) ? (value as unknown as PlatformInvoiceLine[]) : [];
}

function summaryOf(row: Invoice): PlatformInvoiceSummary {
  return {
    id: row.id,
    number: invoiceNumberLabel(row.series, row.year, row.number),
    source: row.source,
    creditNote: row.creditNote,
    issuedAt: (row.issuedAt ?? row.createdAt).toISOString(),
    periodMonth: row.periodMonth,
    totalEurCents: row.amountEurCents,
    sdiStatus: row.sdiStatus as InvoiceSdiStatusValue,
  };
}

/**
 * Le nostre fatture al professionista (decisioni dell'utente del 27/10/2026,
 * docs/CHANGELOG.md §378): una al mese per le trattenute sui pagamenti online
 * (serie COM, fattura differita), una per ogni abbonamento, quota di
 * passaggio o pacchetto di visibilità pagato (serie ABB). Numerazione senza
 * buchi per serie e anno, mai cancellate: un mese con più restituito che
 * trattenuto diventa una nota di credito. Partono solo con i dati della
 * nostra società in Admin → Finanza; l'invio allo SdI passa da Openapi
 * (`OPENAPI_TOKEN_SDI`), senza chiave l'admin scarica l'XML.
 */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);
  private readonly sdi: SdiProvider | null = sdiProviderFromEnv();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  // --- Dati della nostra società -------------------------------------------

  async settingsView(): Promise<PlatformInvoiceSettingsView> {
    const row = await this.prisma.platformInvoiceSettings.findUnique({ where: { id: "default" } });
    return {
      companyName: row?.companyName ?? null,
      vatNumber: row?.vatNumber ?? null,
      taxCode: row?.taxCode ?? null,
      street: row?.street ?? null,
      houseNumber: row?.houseNumber ?? null,
      postalCode: row?.postalCode ?? null,
      city: row?.city ?? null,
      province: row?.province ?? null,
      taxRegime: row?.taxRegime ?? "RF01",
      reaOffice: row?.reaOffice ?? null,
      reaNumber: row?.reaNumber ?? null,
      shareCapital: row?.shareCapital ?? null,
      pecEmail: row?.pecEmail ?? null,
      invoicesFrom: row?.invoicesFrom ? romeDayIso(row.invoicesFrom) : null,
      ready: !!issuerSnapshot(row),
      sdiConfigured: !!this.sdi,
      sdiSandbox: !!this.sdi?.sandbox,
    };
  }

  async updateSettings(input: PlatformInvoiceSettingsInput): Promise<PlatformInvoiceSettingsView> {
    const data = {
      companyName: input.companyName,
      vatNumber: input.vatNumber.replace(/^IT/i, ""),
      taxCode: input.taxCode || null,
      street: input.street,
      houseNumber: input.houseNumber || null,
      postalCode: input.postalCode,
      city: input.city,
      province: input.province,
      taxRegime: input.taxRegime,
      reaOffice: input.reaOffice || null,
      reaNumber: input.reaNumber || null,
      shareCapital: input.shareCapital || null,
      pecEmail: input.pecEmail || null,
      // Dal giorno scelto, a mezzanotte di Roma.
      invoicesFrom: input.invoicesFrom ? romeDayStart(input.invoicesFrom) : null,
    };
    await this.prisma.platformInvoiceSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    return this.settingsView();
  }

  /** I nostri dati se a quella data le fatture sono attive, altrimenti null (solo estratto). */
  async activeIssuer(at: Date): Promise<IssuerSnapshot | null> {
    const row = await this.prisma.platformInvoiceSettings.findUnique({ where: { id: "default" } });
    const issuer = issuerSnapshot(row);
    if (!issuer || (row?.invoicesFrom && row.invoicesFrom.getTime() > at.getTime())) return null;
    return issuer;
  }

  private async recipientOf(professionalProfileId: string): Promise<RecipientSnapshot> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { businessName: true, fiscalProfile: true },
    });
    return recipientFromFiscal(profile?.fiscalProfile ?? null, profile?.businessName ?? "");
  }

  // --- Emissione -----------------------------------------------------------

  /** Crea la fattura con il numero successivo della sua serie, poi la manda allo SdI. */
  private async createInvoice(input: NewInvoice): Promise<Invoice | null> {
    const existing = await this.prisma.invoice.findUnique({ where: { dedupeKey: input.dedupeKey } });
    if (existing) return existing;
    const recipient = await this.recipientOf(input.professionalProfileId);
    const totals = invoiceTotals(input.lines, input.grossEurCents);
    const series = INVOICE_SERIES[input.source];
    const year = Number(input.date.slice(0, 4));
    const invoice = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.invoiceCounter.upsert({
        where: { series_year: { series, year } },
        create: { series, year, last: 1 },
        update: { last: { increment: 1 } },
      });
      const created = await tx.invoice.create({
        data: {
          type: "MANOVIA_TO_PROFESSIONAL",
          source: input.source,
          creditNote: input.creditNote,
          relatedInvoiceId: input.relatedInvoiceId,
          professionalProfileId: input.professionalProfileId,
          series,
          year,
          number: counter.last,
          periodMonth: input.periodMonth,
          amountEurCents: input.grossEurCents,
          taxableEurCents: totals.taxableEurCents,
          vatEurCents: totals.vatEurCents,
          roundingEurCents: totals.roundingEurCents,
          vatRateBasisPoints: PLATFORM_VAT_RATE_BASIS_POINTS,
          lines: input.lines as unknown as Prisma.InputJsonValue,
          recipient: { ...recipient, taxCode: recipient.taxCode ? encryptFiscal(recipient.taxCode) : null } as unknown as Prisma.InputJsonValue,
          issuer: input.issuer as unknown as Prisma.InputJsonValue,
          status: "ISSUED",
          // La data del documento (per le trattenute l'ultimo giorno del mese).
          issuedAt: new Date(`${input.date}T12:00:00Z`),
          dedupeKey: input.dedupeKey,
          stripeInvoiceId: input.stripeInvoiceId ?? null,
          stripePaymentIntentId: input.stripePaymentIntentId ?? null,
        },
      });
      if (input.feeEntryIds?.length) {
        const assigned = await tx.platformFeeEntry.updateMany({ where: { id: { in: input.feeEntryIds }, invoiceId: null }, data: { invoiceId: created.id } });
        // Un altro giro ha già fatturato questi movimenti: si annulla tutto, numero compreso.
        if (assigned.count !== input.feeEntryIds.length) throw new Error("Movimenti della trattenuta già fatturati");
      }
      return created;
    });
    await this.prepareAndSend(invoice.id, recipient);
    return invoice;
  }

  /** Genera l'XML (cifrato nel database) e, con Openapi configurato, lo manda allo SdI. */
  private async prepareAndSend(invoiceId: string, recipientOverride?: RecipientSnapshot): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice?.series || !invoice.year || !invoice.number) return;
    const issuer = readIssuer(invoice.issuer);
    const recipient = recipientOverride ?? readRecipient(invoice.recipient);
    if (!issuer || !recipient) return;
    if (!recipientComplete(recipient)) {
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { xml: null, sdiMessage: "Dati fiscali del professionista incompleti: indirizzo, partita IVA o codice fiscale." } });
      return;
    }
    const related = invoice.relatedInvoiceId ? await this.prisma.invoice.findUnique({ where: { id: invoice.relatedInvoiceId } }) : null;
    const progressive = sdiProgressive(invoice.series, invoice.year, invoice.number, invoice.sdiAttempts);
    const date = romeDayIso(invoice.issuedAt ?? invoice.createdAt);
    const xml = buildFatturaPaXml({
      progressive,
      recipientCode: recipient.sdiRecipientCode,
      recipientPec: recipient.pecEmail,
      issuer: fatturaPaIssuer(issuer),
      customer: fatturaPaCustomer(recipient),
      documentType: invoice.creditNote ? "TD04" : invoice.source === "JOB_FEES" ? "TD24" : "TD01",
      date,
      number: invoiceNumberLabel(invoice.series, invoice.year, invoice.number),
      lines: readLines(invoice.lines).map((line) => ({ description: xmlLineDescription(line), taxableEurCents: line.taxableEurCents })),
      vatRateBasisPoints: invoice.vatRateBasisPoints,
      taxableEurCents: invoice.taxableEurCents,
      vatEurCents: invoice.vatEurCents,
      roundingEurCents: invoice.roundingEurCents,
      totalEurCents: invoice.amountEurCents,
      paymentMethod: invoice.source === "JOB_FEES" ? "MP22" : "MP08",
      related: related?.series && related.year && related.number ? { number: invoiceNumberLabel(related.series, related.year, related.number), date: romeDayIso(related.issuedAt ?? related.createdAt) } : null,
      causale: invoice.source === "JOB_FEES"
        ? [`${invoice.creditNote ? "Trattenute restituite" : "Trattenute sui pagamenti online"} di ${accountingMonthLabel(invoice.periodMonth ?? date.slice(0, 7))}, già trattenute dagli incassi.`]
        : [`${INVOICE_SOURCE_LABEL[invoice.source]}, pagato con carta.`],
    });
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { xml: encryptFiscal(xml), sdiMessage: null, ...(recipientOverride ? { recipient: { ...recipient, taxCode: recipient.taxCode ? encryptFiscal(recipient.taxCode) : null } as unknown as Prisma.InputJsonValue } : {}) },
    });
    if (!this.sdi) return;
    try {
      await this.sdi.ensureRegistered(sdiCompanyOf(issuer));
      const { sdiId } = await this.sdi.send(xml);
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { sdiStatus: "SENT", sdiId, sdiSentAt: new Date(), sdiMessage: null, sdiAttempts: { increment: 1 } } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Fattura ${invoiceNumberLabel(invoice.series, invoice.year, invoice.number)} non inviata allo SdI: ${message}`);
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { sdiMessage: message.slice(0, 500), sdiAttempts: { increment: 1 } } });
    }
  }

  /**
   * Fattura delle trattenute di un mese per ogni professionista: i movimenti
   * del mese (e quelli arrivati in ritardo dai mesi prima, da quando le
   * fatture sono attive) non ancora fatturati.
   */
  async issueMonthlyFeeInvoices(month: string): Promise<number> {
    const { start, end } = romeMonthRange(month);
    const issuer = await this.activeIssuer(new Date(end.getTime() - 1));
    if (!issuer) return 0;
    const settings = await this.prisma.platformInvoiceSettings.findUnique({ where: { id: "default" }, select: { invoicesFrom: true } });
    const from = settings?.invoicesFrom && settings.invoicesFrom < start ? settings.invoicesFrom : start;
    const entries = await this.prisma.platformFeeEntry.findMany({
      where: { invoiceId: null, occurredAt: { gte: from, lt: end } },
      orderBy: { occurredAt: "asc" },
      include: { jobPayment: { select: { booking: { select: { scheduledAt: true, quote: { select: { guidedRequest: { select: { description: true, category: { select: { label: true } } } } } } } } } } },
    });
    const byProfessional = new Map<string, typeof entries>();
    for (const entry of entries) byProfessional.set(entry.professionalProfileId, [...(byProfessional.get(entry.professionalProfileId) ?? []), entry]);
    let issued = 0;
    for (const [professionalProfileId, own] of byProfessional) {
      const draft = monthlyFeeInvoiceDraft(
        own.map((e) => {
          const booking = e.jobPayment?.booking;
          const request = booking?.quote?.guidedRequest;
          const what = [request?.category.label, notificationJobLabel(request?.description)].filter(Boolean).join(", ");
          return {
            description: e.description,
            grossEurCents: e.grossEurCents,
            taxableEurCents: e.taxableEurCents,
            paymentEurCents: e.paymentEurCents,
            jobLabel: booking ? `Lavoro del ${romeDayLabel(booking.scheduledAt)}${what ? ` (${what})` : ""}` : "Altri movimenti",
          };
        }),
      );
      if (!draft) continue;
      const related = draft.creditNote
        ? await this.prisma.invoice.findFirst({ where: { professionalProfileId, source: "JOB_FEES", creditNote: false }, orderBy: { issuedAt: "desc" }, select: { id: true } })
        : null;
      try {
        const invoice = await this.createInvoice({
          professionalProfileId,
          source: "JOB_FEES",
          creditNote: draft.creditNote,
          relatedInvoiceId: related?.id ?? null,
          periodMonth: month,
          date: lastDayOfMonth(month),
          lines: draft.lines,
          grossEurCents: draft.grossEurCents,
          dedupeKey: `JOB_FEES:${professionalProfileId}:${month}`,
          feeEntryIds: own.map((e) => e.id),
          issuer,
        });
        if (invoice) issued += 1;
      } catch (err) {
        this.logger.error(`Fattura delle trattenute di ${month} non emessa (${professionalProfileId}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return issued;
  }

  /**
   * Abbonamento, rinnovo o quota di passaggio pagati: la fattura di Stripe
   * diventa la nostra fattura elettronica, con le stesse righe.
   */
  async issueForStripeInvoice(invoice: Stripe.Invoice, tierOfPrice: (priceId: string | undefined) => { tier: SubscriptionTier; interval: BillingInterval } | null): Promise<void> {
    if (!invoice.id || (invoice.amount_paid ?? 0) <= 0) return;
    const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : new Date();
    const issuer = await this.activeIssuer(paidAt);
    if (!issuer) return;
    const subscriptionRef = invoice.parent?.subscription_details?.subscription;
    const stripeSubscriptionId = subscriptionRef ? (typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id) : null;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
    const metadata = invoice.metadata ?? {};
    const professionalProfileId =
      metadata.professionalProfileId ??
      (stripeSubscriptionId ? (await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId }, select: { professionalProfileId: true } }))?.professionalProfileId : undefined) ??
      (customerId ? (await this.prisma.professionalProfile.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id : undefined);
    if (!professionalProfileId) {
      this.logger.warn(`Fattura Stripe ${invoice.id} pagata senza professionista collegato: nessuna fattura emessa.`);
      return;
    }
    const source: PlatformInvoiceSource = metadata.kind === "tier_upgrade_fee" ? "UPGRADE_FEE" : metadata.kind === "boost" ? "VISIBILITY_BOOST" : stripeSubscriptionId ? "SUBSCRIPTION" : "UPGRADE_FEE";
    const lines: PlatformInvoiceLine[] = (invoice.lines?.data ?? [])
      .filter((line) => line.amount !== 0)
      .map((line) => {
        const priceRef = line.pricing?.price_details?.price;
        const price = tierOfPrice(typeof priceRef === "string" ? priceRef : priceRef?.id);
        const period = line.period ? `dal ${romeDayLabel(new Date(line.period.start * 1000))} al ${romeDayLabel(new Date(line.period.end * 1000))}` : null;
        const description = price
          ? `Abbonamento ${subscriptionTierInfo(price.tier).label} ${price.interval === "YEAR" ? "annuale" : "mensile"}`
          : (line.description ?? INVOICE_SOURCE_LABEL[source]);
        return { description, detail: source === "SUBSCRIPTION" ? period : null, taxableEurCents: line.amount };
      });
    const taxable = invoice.total_excluding_tax ?? lines.reduce((sum, line) => sum + line.taxableEurCents, 0);
    const linesTotal = lines.reduce((sum, line) => sum + line.taxableEurCents, 0);
    if (taxable !== linesTotal) lines.push({ description: "Sconto", taxableEurCents: taxable - linesTotal });
    try {
      await this.createInvoice({
        professionalProfileId,
        source,
        creditNote: false,
        relatedInvoiceId: null,
        periodMonth: null,
        date: romeDayIso(paidAt),
        lines,
        grossEurCents: invoice.amount_paid,
        dedupeKey: `STRIPE:${invoice.id}`,
        stripeInvoiceId: invoice.id,
        issuer,
      });
    } catch (err) {
      // Mai un errore verso Stripe per la fattura: l'abbonamento è già pagato e attivo.
      this.logger.error(`Fattura per ${invoice.id} non emessa: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Pacchetto di visibilità pagato con il Checkout: totale con l'IVA dentro. */
  async issueForBoostCheckout(session: Stripe.Checkout.Session, professionalProfileId: string, label: string): Promise<void> {
    const gross = session.amount_total ?? 0;
    if (gross <= 0) return;
    const issuer = await this.activeIssuer(new Date());
    if (!issuer) return;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? session.id);
    const taxable = Math.round((gross * 10_000) / (10_000 + PLATFORM_VAT_RATE_BASIS_POINTS));
    try {
      await this.createInvoice({
        professionalProfileId,
        source: "VISIBILITY_BOOST",
        creditNote: false,
        relatedInvoiceId: null,
        periodMonth: null,
        date: romeDayIso(new Date()),
        lines: [{ description: label, taxableEurCents: taxable }],
        grossEurCents: gross,
        dedupeKey: `BOOST:${paymentIntentId}`,
        stripePaymentIntentId: paymentIntentId,
        issuer,
      });
    } catch (err) {
      this.logger.error(`Fattura del pacchetto di visibilità non emessa: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- SdI ------------------------------------------------------------------

  /** Ogni ora: riprova gli invii non riusciti (entro i 12 giorni) e legge gli esiti. */
  @Cron("20 * * * *")
  async syncSdi(now: Date = new Date()): Promise<void> {
    if (!this.sdi) return;
    const pending = await this.prisma.invoice.findMany({
      where: { sdiStatus: "NOT_SENT", xml: { not: null }, issuedAt: { gte: new Date(now.getTime() - SDI_RETRY_DAYS * DAY_MS) }, sdiAttempts: { lt: 5 } },
      select: { id: true },
      take: 50,
    });
    for (const invoice of pending) await this.prepareAndSend(invoice.id);
    // Esiti: Openapi li dà fattura per fattura (`/invoices_notifications/{uuid}`), per quelle inviate negli ultimi 30 giorni.
    const sent = await this.prisma.invoice.findMany({
      where: { sdiStatus: "SENT", sdiId: { not: null }, sdiSentAt: { gte: new Date(now.getTime() - SDI_OUTCOME_DAYS * DAY_MS) } },
      select: { id: true, sdiId: true, series: true, year: true, number: true },
      orderBy: { sdiSentAt: "asc" },
      take: 100,
    });
    for (const invoice of sent) {
      if (!invoice.sdiId) continue;
      try {
        const note = await this.sdi.outcome(invoice.sdiId);
        if (!note) continue;
        await this.prisma.invoice.update({ where: { id: invoice.id }, data: { sdiStatus: note.status, sdiMessage: note.status === "REJECTED" ? (note.message ?? "Scartata dallo SdI") : null } });
        if (note.status === "REJECTED") {
          const number = invoiceNumberLabel(invoice.series, invoice.year, invoice.number);
          await this.notifyFinanceAdmins("ADMIN_FEE_RECONCILIATION", { kind: "sdi", month: null, alerts: [`La fattura ${number} è stata scartata dallo SdI: ${note.message ?? "motivo non indicato"}. Correggi e rimandala da Finanza.`] });
        }
      } catch (err) {
        this.logger.warn(`Esito SdI non letto: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Prova d'invio nella prova di Openapi (`OPENAPI_SANDBOX=true`, docs/CHANGELOG.md
   * §379): registra la società, manda una fattura di prova da 1 € (mai salvata
   * tra le nostre e senza numero della serie), fa arrivare un esito finto e lo
   * legge. In produzione non parte: la fattura arriverebbe davvero all'Agenzia.
   */
  async adminSdiSandboxTest(now: Date = new Date()): Promise<SdiSandboxTestResult> {
    const steps: SdiSandboxTestResult["steps"] = [];
    const stop = (label: string, detail: string): SdiSandboxTestResult => ({ ok: false, steps: [...steps, { label, ok: false, detail }] });
    const sdi = this.sdi;
    if (!sdi) return stop("Collegamento a Openapi", "Manca OPENAPI_TOKEN_SDI su Render.");
    if (!sdi.sandbox) return stop("Ambiente di prova", "La prova si fa solo con OPENAPI_SANDBOX=true su Render: in produzione la fattura di prova arriverebbe davvero all'Agenzia.");
    const issuer = issuerSnapshot(await this.prisma.platformInvoiceSettings.findUnique({ where: { id: "default" } }));
    if (!issuer) return stop("Dati della società", "Compila e salva prima i dati della società qui sopra.");
    if (!issuer.pecEmail) return stop("Dati della società", "Scrivi la PEC della società: Openapi la usa per la conservazione delle fatture.");

    /** Un passo: se non riesce si ferma lì, col motivo. */
    const attempt = async (label: string, run: () => Promise<string | null>): Promise<boolean> => {
      try {
        steps.push({ label, ok: true, detail: await run() });
        return true;
      } catch (err) {
        steps.push({ label, ok: false, detail: err instanceof Error ? err.message : String(err) });
        return false;
      }
    };

    let sdiId = "";
    const passed =
      (await attempt("Società registrata su Openapi", async () => {
        await sdi.ensureRegistered(sdiCompanyOf(issuer));
        return null;
      })) &&
      (await attempt("Fattura di prova inviata", async () => {
        sdiId = (await sdi.send(sandboxTestInvoiceXml(issuer, now))).sdiId;
        return `Identificativo Openapi: ${sdiId}`;
      })) &&
      (await attempt("Esito di consegna simulato", async () => {
        await sdi.simulateOutcome(sdiId, "RC");
        return null;
      }));
    if (!passed) return { ok: false, steps };
    const read = await attempt("Esito letto", async () => {
      for (let i = 0; i < 4; i += 1) {
        const note = await sdi.outcome(sdiId);
        if (note?.status === "DELIVERED") return "Consegnata: l'invio e la lettura degli esiti funzionano.";
        if (note?.status === "REJECTED") throw new Error(`Scartata: ${note.message ?? "motivo non indicato"}`);
        await new Promise((resolve) => setTimeout(resolve, SDI_TEST_WAIT_MS));
      }
      throw new Error("L'esito non è ancora arrivato: riprova tra un minuto.");
    });
    return { ok: read, steps };
  }

  // --- Giro del mese ---------------------------------------------------------

  /** Il 1° del mese alle 7: fatture delle trattenute del mese prima e riepilogo ai professionisti. */
  @Cron("0 7 1 * *", { timeZone: "Europe/Rome" })
  async runMonthly(now: Date = new Date()): Promise<void> {
    const month = previousMonth(romeMonthOf(now));
    const issued = await this.issueMonthlyFeeInvoices(month);
    const notified = await this.sendMonthlyDocuments(month);
    this.logger.log(`Documenti di ${month}: ${issued} fatture delle trattenute, ${notified} riepiloghi mandati.`);
  }

  /**
   * Riepilogo del mese a ogni professionista con un documento: trattenute,
   * fatture dell'abbonamento e i mesi gratuiti a 0 € (decisione dell'utente
   * del 27/10/2026: non è una fattura, solo un riepilogo).
   */
  async sendMonthlyDocuments(month: string): Promise<number> {
    const { start, end } = romeMonthRange(month);
    if (!(await this.activeIssuer(new Date(end.getTime() - 1)))) return 0;
    const invoices = await this.prisma.invoice.findMany({
      where: { type: "MANOVIA_TO_PROFESSIONAL", status: "ISSUED", OR: [{ periodMonth: month }, { source: { not: "JOB_FEES" }, issuedAt: { gte: start, lt: end } }] },
      orderBy: { issuedAt: "asc" },
    });
    const trialing = await this.prisma.subscription.findMany({ where: { trialEndsAt: { gt: start } } });
    const lines = new Map<string, { label: string; amountEurCents: number }[]>();
    const push = (id: string, line: { label: string; amountEurCents: number }) => lines.set(id, [...(lines.get(id) ?? []), line]);
    for (const sub of trialing) {
      for (const at of [new Date(end.getTime() - 1), start]) {
        const free = freePeriodSummary(
          { state: subscriptionState(sub, at), trialEndsAt: sub.trialEndsAt?.toISOString() ?? null, bonusMonthGranted: !!sub.bonusMonthGrantedAt, founder: sub.founderNumber ? { months: FOUNDER_FREE_MONTHS, currentMonth: null } : null },
          at,
        );
        if (free) {
          push(sub.professionalProfileId, { label: `Abbonamento: ${free.label}`, amountEurCents: 0 });
          break;
        }
      }
    }
    for (const invoice of invoices) {
      const label = invoice.source === "JOB_FEES" ? (invoice.creditNote ? "Trattenute restituite" : "Trattenute sui pagamenti online") : INVOICE_SOURCE_LABEL[invoice.source];
      push(invoice.professionalProfileId, { label, amountEurCents: invoice.creditNote ? -invoice.amountEurCents : invoice.amountEurCents });
    }
    let sent = 0;
    for (const [professionalProfileId, own] of lines) {
      const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { userId: true, user: { select: { deletedAt: true } } } });
      if (!profile || profile.user.deletedAt) continue;
      await this.notificationsService.notify(profile.userId, "MONTHLY_DOCUMENTS_READY", {
        month,
        monthLabel: accountingMonthLabel(month),
        totalEurCents: own.reduce((sum, line) => sum + line.amountEurCents, 0),
        lines: own,
      });
      sent += 1;
    }
    return sent;
  }

  async notifyFinanceAdmins(type: string, payload: Prisma.InputJsonValue): Promise<void> {
    const admins = await this.prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null }, select: { id: true, adminRoles: true } });
    for (const admin of admins) {
      const roles = admin.adminRoles ?? [];
      if (roles.length === 0 || roles.includes("SUPER") || roles.includes("FINANCE")) await this.notificationsService.notify(admin.id, type, payload);
    }
  }

  // --- Pagina del professionista ------------------------------------------------

  async profileIdOf(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Profilo professionista non trovato.");
    return profile.id;
  }

  /** Fatture, mesi e commercialista; i documenti dati ai clienti li aggiunge CourtesyCopyService (§381). */
  async overview(userId: string): Promise<Omit<DocumentsOverview, "clientDocuments" | "missingDocuments">> {
    const professionalProfileId = await this.profileIdOf(userId);
    const [invoices, fiscal, issuer, entries, payments] = await Promise.all([
      this.prisma.invoice.findMany({ where: { professionalProfileId, type: "MANOVIA_TO_PROFESSIONAL", status: "ISSUED" }, orderBy: [{ issuedAt: "desc" }, { number: "desc" }] }),
      this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { accountantEmail: true, accountantStatementsAt: true } }),
      this.activeIssuer(new Date()),
      this.prisma.platformFeeEntry.findMany({ where: { professionalProfileId }, select: { occurredAt: true } }),
      this.prisma.jobPayment.findMany({
        where: { booking: { professionalProfileId }, OR: [{ directReportedAt: { not: null } }, { payoutPaidAt: { not: null } }] },
        select: { directReportedAt: true, payoutPaidAt: true },
      }),
    ]);
    const months = new Set<string>();
    for (const e of entries) months.add(romeMonthOf(e.occurredAt));
    for (const p of payments) {
      if (p.directReportedAt) months.add(romeMonthOf(p.directReportedAt));
      if (p.payoutPaidAt) months.add(romeMonthOf(p.payoutPaidAt));
    }
    for (const i of invoices) months.add(i.periodMonth ?? romeMonthOf(i.issuedAt ?? i.createdAt));
    return {
      invoices: invoices.map(summaryOf),
      months: [...months].filter(isAccountingMonth).sort().reverse().slice(0, 24),
      invoicesActive: !!issuer,
      accountant: { email: fiscal?.accountantEmail ?? null, enabled: !!fiscal?.accountantStatementsAt },
    };
  }

  private async ownInvoice(userId: string, invoiceId: string): Promise<Invoice> {
    const professionalProfileId = await this.profileIdOf(userId);
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.professionalProfileId !== professionalProfileId || invoice.type !== "MANOVIA_TO_PROFESSIONAL") throw new NotFoundException("Fattura non trovata.");
    return invoice;
  }

  async invoiceView(invoice: Invoice): Promise<PlatformInvoiceView> {
    const issuer = readIssuer(invoice.issuer);
    const recipient = readRecipient(invoice.recipient);
    const related = invoice.relatedInvoiceId ? await this.prisma.invoice.findUnique({ where: { id: invoice.relatedInvoiceId }, select: { series: true, year: true, number: true } }) : null;
    const onlinePaid = invoice.source === "JOB_FEES"
      ? (await this.prisma.platformFeeEntry.aggregate({ where: { invoiceId: invoice.id }, _sum: { paymentEurCents: true } }))._sum.paymentEurCents ?? 0
      : null;
    return {
      ...summaryOf(invoice),
      issuer: issuer ? issuerParty(issuer) : { name: "", lines: [] },
      recipient: recipient ? recipientParty(recipient) : { name: "", lines: [] },
      lines: readLines(invoice.lines),
      taxableEurCents: invoice.taxableEurCents,
      vatEurCents: invoice.vatEurCents,
      roundingEurCents: invoice.roundingEurCents,
      vatRatePercent: invoice.vatRateBasisPoints / 100,
      relatedNumber: related ? invoiceNumberLabel(related.series, related.year, related.number) : null,
      vatRecoverable: recipient?.chargesVat ?? null,
      onlinePaidEurCents: onlinePaid,
    };
  }

  async invoiceForProfessional(userId: string, invoiceId: string): Promise<PlatformInvoiceView> {
    return this.invoiceView(await this.ownInvoice(userId, invoiceId));
  }

  async xmlForProfessional(userId: string, invoiceId: string): Promise<{ fileName: string; xml: string }> {
    return this.xmlOf(await this.ownInvoice(userId, invoiceId));
  }

  private xmlOf(invoice: Invoice): { fileName: string; xml: string } {
    const xml = readFiscal(invoice.xml);
    if (!xml) throw new NotFoundException("Il file della fattura elettronica non è ancora pronto.");
    return { fileName: `${invoiceNumberLabel(invoice.series, invoice.year, invoice.number).replace(/\//g, "-")}.xml`, xml };
  }

  // --- Admin → Finanza --------------------------------------------------------

  async adminList(month?: string): Promise<PlatformInvoiceAdminRow[]> {
    const range = month && isAccountingMonth(month) ? romeMonthRange(month) : null;
    const rows = await this.prisma.invoice.findMany({
      where: { type: "MANOVIA_TO_PROFESSIONAL", status: "ISSUED", ...(range ? { issuedAt: { gte: range.start, lt: range.end } } : {}) },
      orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
      take: 300,
    });
    return rows.map((row) => {
      const recipient = readRecipient(row.recipient);
      return {
        ...summaryOf(row),
        professionalProfileId: row.professionalProfileId,
        recipientName: recipient ? recipientName(recipient) : "",
        sdiMessage: row.sdiMessage,
        hasXml: !!row.xml,
      };
    });
  }

  async adminXml(invoiceId: string): Promise<{ fileName: string; xml: string }> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("Fattura non trovata.");
    return this.xmlOf(invoice);
  }

  async adminView(invoiceId: string): Promise<PlatformInvoiceView> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("Fattura non trovata.");
    return this.invoiceView(invoice);
  }

  /** Emette a mano le fatture di un mese (se il giro del 1° non è partito). Mai doppie. */
  async adminRunMonth(month: string): Promise<{ issued: number }> {
    if (!isAccountingMonth(month) || month >= romeMonthOf(new Date())) throw new BadRequestException("Scegli un mese già concluso.");
    return { issued: await this.issueMonthlyFeeInvoices(month) };
  }

  /**
   * Rimanda allo SdI una fattura scartata o mai partita, con i dati fiscali
   * di adesso (il professionista può averli corretti).
   */
  async adminResend(invoiceId: string): Promise<PlatformInvoiceAdminRow> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException("Fattura non trovata.");
    if (invoice.sdiStatus === "SENT" || invoice.sdiStatus === "DELIVERED") throw new BadRequestException("La fattura è già stata inviata.");
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { sdiStatus: "NOT_SENT" } });
    await this.prepareAndSend(invoiceId, await this.recipientOf(invoice.professionalProfileId));
    const updated = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const recipient = readRecipient(updated.recipient);
    return { ...summaryOf(updated), professionalProfileId: updated.professionalProfileId, recipientName: recipient ? recipientName(recipient) : "", sdiMessage: updated.sdiMessage, hasXml: !!updated.xml };
  }
}

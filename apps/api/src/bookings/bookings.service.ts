import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional, type OnModuleInit } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import type Stripe from "stripe";
import {
  onlineLimitCompletionProblem,
  JOB_ISSUE_LABEL,
  completionDeviation,
  completionDeviationText,
  clientCanReview,
  BAD_WORK_REPORT_DAYS,
  jobIssueTypesAllowed,
  jobIssueLateAllowed,
  clientCanUpdateReview,
  jobIssueAssisted,
  JOB_ISSUE_LATE_NOTE,
  toJobIssueSummary,
  jobPaidOnline,
  quotePriceTotals,
  formatBookingAddress,
  toJobPaymentSummary,
  type JobPaymentChoice,
  paymentChoiceIsOnline,
  quotePaymentOffer,
  onlineDepositEurCents,
  ONLINE_MIN_CHARGE_EUR_CENTS,
  jobIssueCanEscalate,
  jobIssueEvidenceDueAt,
  type JobIssueResponseInput,
  type ReportJobIssueInput,
  PROFESSIONAL_JOB_PROBLEM_REASONS,
  formatEurCents,
  completionDeclaration,
  wallClockNow,
  wallClockToday,
  PROFESSIONAL_JOB_PROBLEM_REPORT_PREFIX,
  type ReportProfessionalJobProblemInput,
  notificationJobLabel,
  type CancelBookingByProfessionalInput, type ClientConfirmCompleteInput, type CompleteBookingInput,
  cancellationNoticeLabel,
  DEFAULT_CANCELLATION_NOTICE_HOURS,
  isLateCancellation,
  type ClientInvoiceRequestInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { BOOKING_CALENDAR_INCLUDE, bookingCalendar } from "../email/booking-calendar";
import { cancellationNoticeFor, hasOtherJob, isOtherJobViolation, lockGuidedRequest } from "./one-job-per-request";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { TimelineService } from "../timeline/timeline.service";
import { JobPaymentsService } from "../job-payments/job-payments.service";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";
import { professionalOnlineLimit } from "../job-payments/online-limit";
import { stripeVerified } from "../professional-fiscal/public-visibility";
import { JobIssueOutcomeService } from "../job-issues/job-issue-outcome.service";
import { PROFESSIONAL_BUSY_MESSAGE, capacityAt, countOverlapping, loadCommitments, lockProfessionalAgenda } from "../agenda/commitments";
import { AuthService } from "../auth/auth.service";
import { ClientInvoiceRequestsService } from "../client-invoice-requests/client-invoice-requests.service";
import { bookingDateChange } from "../quotes/booked-date-change";

/** Il cliente ha già un lavoro per questa richiesta (docs/CHANGELOG.md §346). */
const CLIENT_CANCEL_TOO_LATE = "L'appuntamento è già cominciato e non si può più annullare. Se qualcosa non va, usa \"C'è un problema\".";
const OTHER_JOB_MESSAGE = "Hai già accettato un altro preventivo per questa richiesta. Per cambiare professionista annulla prima l'appuntamento.";

type AcceptableQuote = Awaited<ReturnType<BookingsService["loadAcceptableQuote"]>>;

/** Nota per il cliente sui lavori annullati perché il professionista ha chiuso l'account (docs/CHANGELOG.md §348). */
export const ACCOUNT_CLOSED_NOTE = "Il professionista ha chiuso il suo account.";

/** L'appuntamento è in un giorno dopo oggi (ora italiana). */
function startsAfterToday(scheduledAt: Date): boolean {
  return scheduledAt.toISOString().slice(0, 10) > wallClockNow().toISOString().slice(0, 10);
}

@Injectable()
export class BookingsService implements OnModuleInit {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly timelineService: TimelineService,
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly jobIssueOutcomeService: JobIssueOutcomeService,
    // Facoltativo solo per i test che costruiscono il servizio a mano.
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly clientInvoiceRequestsService?: ClientInvoiceRequestsService,
  ) {}

  onModuleInit(): void {
    this.authService?.onProfessionalAccountClosed(async (professionalProfileId, userId) => {
      await this.cancelFutureJobsOfClosedAccount(professionalProfileId, userId);
    });
  }

  /**
   * Il professionista chiude l'account (docs/CHANGELOG.md §348): i lavori non
   * ancora cominciati si annullano subito, l'acconto torna al cliente e il
   * cliente riceve l'avviso. Prima restavano confermati e il cliente vedeva
   * solo "Questo appuntamento non si farà".
   */
  async cancelFutureJobsOfClosedAccount(professionalProfileId: string, professionalUserId: string): Promise<number> {
    const jobs = await this.prisma.booking.findMany({
      where: { professionalProfileId, status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { gt: wallClockNow() } },
      include: { quote: { select: { guidedRequestId: true } } },
    });
    for (const job of jobs) {
      await this.prisma.booking.update({
        where: { id: job.id },
        data: { status: "CANCELED", canceledBy: "PROFESSIONAL", cancellationNote: ACCOUNT_CLOSED_NOTE },
      });
      await this.jobPaymentsService.refundOnCancel(job.id, professionalUserId);
      await this.notificationsService.notify(job.clientId, "BOOKING_CANCELED_BY_PROFESSIONAL", {
        bookingId: job.id,
        cancellationNote: ACCOUNT_CLOSED_NOTE,
        accountClosed: true,
        guidedRequestId: job.quote?.guidedRequestId,
      });
      if (job.quote) {
        await this.timelineService.log(job.quote.guidedRequestId, professionalProfileId, "PROFESSIONAL", "Il professionista ha chiuso l'account: l'appuntamento è annullato.");
      }
    }
    return jobs.length;
  }

  /**
   * Il cliente accetta un preventivo: crea la prenotazione, chiude la
   * richiesta e copia sulla prenotazione l'indirizzo di lavoro strutturato
   * già raccolto sulla GuidedRequest fin dall'invio della richiesta
   * (richiesta esplicita dell'utente: "voglio che li inserisca subito
   * appena [invia] un preventivo... ma verranno visualizzati al
   * professionista... solo quando si è conclusa la trattativa" — prima
   * questi campi arrivavano da un input separato raccolto solo qui, in una
   * schermata dedicata all'accettazione).
   */
  async createFromQuote(
    clientId: string,
    quoteId: string,
    paymentMethod: JobPaymentChoice = "DIRECT",
    invoiceRequest?: ClientInvoiceRequestInput,
  ): Promise<{ bookingId: string | null; paymentMethod: JobPaymentChoice; checkoutUrl: string | null }> {
    const quote = await this.loadAcceptableQuote(clientId, quoteId, paymentMethod);
    if (paymentChoiceIsOnline(paymentMethod) && !onlinePaymentsEnabled()) {
      throw new BadRequestException("Il pagamento online non è ancora disponibile: scegli il pagamento diretto al professionista.");
    }
    // Fattura chiesta al professionista (docs/CHANGELOG.md §378): salvata ora,
    // anche prima dell'acconto online, e letta quando nasce il lavoro.
    await this.clientInvoiceRequestsService?.saveAtAcceptance(clientId, quote.id, invoiceRequest);
    // Con l'acconto online il lavoro si conferma solo a pagamento riuscito
    // (decisione dell'utente, docs/CHANGELOG.md §240): fino ad allora il
    // preventivo resta in attesa e i contatti del cliente restano nascosti
    // (CLAUDE.md §5 punto 9). La prenotazione la crea `confirmQuoteDeposit`.
    if (paymentChoiceIsOnline(paymentMethod)) {
      // Solo un professionista verificato su Stripe può ricevere l'acconto (§241).
      const fiscal = await this.prisma.professionalFiscalProfile.findUnique({
        where: { professionalProfileId: quote.professionalProfileId },
        select: { stripePayoutsEnabled: true },
      });
      if (!stripeVerified(fiscal)) {
        throw new BadRequestException("Questo professionista non può ancora ricevere pagamenti online: scegli il pagamento diretto.");
      }
      // Acconto sotto il minimo di Stripe (collaudo I-01): il pagamento non partirebbe davvero.
      if (this.quoteDepositEurCents(quote) < ONLINE_MIN_CHARGE_EUR_CENTS) {
        throw new BadRequestException("L'acconto di questo preventivo è troppo basso per pagarlo con la carta: scegli il pagamento diretto.");
      }
      // Prima di far pagare l'acconto: niente pagamento per un'ora già occupata (§310).
      await this.assertProfessionalFree(this.prisma, quote);
      const { url } = await this.jobPaymentsService.createQuoteDepositCheckout({
        clientUserId: clientId,
        quoteId: quote.id,
        guidedRequestId: quote.guidedRequestId,
        paymentMethod,
        amountEurCents: this.quoteDepositEurCents(quote),
        businessName: quote.professionalProfile.businessName,
        professionalProfileId: quote.professionalProfileId,
      });
      if (!url) throw new BadRequestException("Il pagamento online non è partito: riprova tra poco.");
      return { bookingId: null, paymentMethod, checkoutUrl: url };
    }
    const bookingId = await this.confirmAcceptedQuote(quote, clientId, paymentMethod);
    return { bookingId, paymentMethod, checkoutUrl: null };
  }

  private quoteDepositEurCents(quote: AcceptableQuote): number {
    return onlineDepositEurCents(quotePriceTotals(quote.items).totalMaxEurCents, quotePaymentOffer(quote).depositPercent);
  }

  /** Il preventivo esiste, è del cliente, si può ancora accettare e offre il modo di pagamento scelto. */
  private async loadAcceptableQuote(clientId: string, quoteId: string, paymentMethod: JobPaymentChoice) {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        guidedRequest: { include: { client: { select: { name: true, surname: true, phone: true } }, category: { select: { label: true } } } },
        booking: true,
        professionalProfile: true,
        items: true,
      },
    });
    if (!quote) {
      throw new NotFoundException("Preventivo non trovato.");
    }
    if (quote.guidedRequest.clientId !== clientId) {
      throw new ForbiddenException("Questo preventivo non è associato a una tua richiesta.");
    }
    if (quote.booking) {
      throw new ForbiddenException("Questo preventivo è già stato accettato.");
    }
    // Bug reale scoperto in verifica: mancava un controllo sullo stato del
    // preventivo — un preventivo REJECTED (rifiutato dallo stesso cliente)
    // o WITHDRAWN (ritirato dal professionista) restava comunque
    // accettabile, perché l'unica guardia era "non ha già una booking".
    if (quote.status === "REJECTED" || quote.status === "WITHDRAWN") {
      throw new ForbiddenException("Questo preventivo non è più disponibile.");
    }
    // Richiesta eliminata dal cliente (§343): i suoi preventivi non si accettano più.
    if (quote.guidedRequest.closedReason === "CANCELED_BY_CLIENT") {
      throw new ForbiddenException("Hai eliminato questa richiesta: il preventivo non è più disponibile.");
    }
    // Un solo lavoro per richiesta (docs/CHANGELOG.md §346): accettato un
    // preventivo, gli altri della stessa richiesta non si accettano più. Prima
    // il controllo c'era solo per l'acconto online e con il pagamento diretto
    // nasceva un secondo lavoro.
    await this.assertNoOtherJob(this.prisma, quote.guidedRequestId);
    // Il cliente sceglie solo tra i modi offerti dal professionista nel preventivo (docs/CHANGELOG.md §237).
    const offer = quotePaymentOffer(quote);
    if (!offer.paymentOptions.includes(paymentMethod)) {
      throw new BadRequestException("Il professionista non ha offerto questo modo di pagamento: scegline uno tra quelli del preventivo.");
    }

    return quote;
  }

  /** La richiesta non ha già un lavoro non annullato (un preventivo accettato), escluso `exceptBookingId`. */
  private async assertNoOtherJob(db: PrismaClient | Prisma.TransactionClient, guidedRequestId: string, exceptBookingId?: string): Promise<void> {
    if (await hasOtherJob(db, guidedRequestId, exceptBookingId)) throw new ConflictException(OTHER_JOB_MESSAGE);
  }

  /**
   * Webhook Stripe dell'acconto pagato accettando il preventivo (§240):
   * crea il lavoro e registra l'acconto. Se nel frattempo il preventivo è
   * cambiato, è stato ritirato o il cliente ha già scelto un altro
   * professionista, l'acconto torna tutto al cliente. Idempotente sul
   * payment intent: Stripe può mandare lo stesso evento più volte.
   */
  async confirmQuoteDeposit(session: Stripe.Checkout.Session): Promise<void> {
    const { quoteId, clientUserId } = session.metadata ?? {};
    const paymentMethod = session.metadata?.paymentMethod as JobPaymentChoice | undefined;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!quoteId || !clientUserId || !paymentMethod || !paymentIntentId) return;

    const existing = await this.prisma.booking.findUnique({ where: { quoteId }, include: { jobPayment: true } });
    if (existing?.jobPayment?.stripePaymentIntentId === paymentIntentId) return;
    // Lavoro creato da un tentativo precedente interrotto prima di registrare
    // l'acconto, oppure acconto pagato una seconda volta da un'altra scheda
    // (collaudo I-02): la registrazione tiene solo il primo pagamento e
    // rimborsa subito il secondo, dicendolo al cliente.
    if (existing?.jobPayment && existing.clientId === clientUserId && (existing.jobPayment.onlineStage === "AWAITING_DEPOSIT" || existing.jobPayment.stripePaymentIntentId)) {
      await this.jobPaymentsService.recordQuoteDeposit(existing.jobPayment.id, session);
      return;
    }

    let quote: AcceptableQuote | null = null;
    let refundReason: string | null = null;
    try {
      quote = await this.loadAcceptableQuote(clientUserId, quoteId, paymentMethod);
    } catch (err) {
      refundReason = err instanceof Error ? err.message : "Preventivo non più disponibile.";
    }
    if (quote) {
      const otherJob = await this.prisma.booking.findFirst({ where: { quote: { guidedRequestId: quote.guidedRequestId }, status: { not: "CANCELED" } }, select: { id: true } });
      if (otherJob) refundReason = "Il cliente ha già accettato un altro preventivo per questa richiesta.";
      else if ((session.amount_total ?? 0) !== this.quoteDepositEurCents(quote)) refundReason = "Il preventivo è cambiato durante il pagamento.";
    }
    let bookingId: string | null = null;
    if (quote && !refundReason) {
      try {
        bookingId = await this.confirmAcceptedQuote(quote, clientUserId, paymentMethod);
      } catch (err) {
        // Nel frattempo il professionista ha preso un altro lavoro a quell'ora
        // (§310). Se invece il lavoro c'è già (stesso evento arrivato due volte
        // o acconto pagato anche da un'altra scheda), si registra lì: un
        // secondo pagamento torna subito al cliente. Senza ancora il pagamento
        // del lavoro Stripe riprova e il controllo in cima lo riconosce.
        if (!(err instanceof ConflictException)) throw err;
        const job = await this.prisma.booking.findUnique({ where: { quoteId }, select: { clientId: true, jobPayment: { select: { id: true } } } });
        if (job?.jobPayment && job.clientId === clientUserId) {
          await this.jobPaymentsService.recordQuoteDeposit(job.jobPayment.id, session);
          return;
        }
        if (job) throw err;
        refundReason = err.message;
      }
    }
    if (!quote || refundReason || !bookingId) {
      const info = await this.prisma.quote.findUnique({ where: { id: quoteId }, select: { guidedRequestId: true, professionalProfileId: true } });
      const { pending } = await this.jobPaymentsService.refundQuoteDeposit(paymentIntentId, refundReason ?? "Preventivo non più disponibile.", session.metadata?.stripeAccount ?? null, {
        clientUserId,
        guidedRequestId: info?.guidedRequestId ?? null,
      });
      // Rimborso in attesa di fondi sul conto del professionista (§269): il cliente lo sa e viene avvisato all'arrivo.
      await this.notificationsService.notify(clientUserId, "QUOTE_DEPOSIT_REFUNDED", {
        guidedRequestId: info?.guidedRequestId ?? null,
        quoteId,
        amountEurCents: session.amount_total ?? 0,
        ...(pending ? { refundPending: true } : {}),
      });
      if (info) {
        await this.timelineService.log(info.guidedRequestId, info.professionalProfileId, "CLIENT", "L'acconto pagato è stato rimborsato: il preventivo non si poteva più confermare.");
      }
      return;
    }

    const jobPayment = await this.prisma.jobPayment.findUniqueOrThrow({ where: { bookingId } });
    await this.jobPaymentsService.recordQuoteDeposit(jobPayment.id, session);
  }

  /**
   * Il professionista è ancora libero all'ora del preventivo: nessun lavoro
   * o lavoro esterno sovrapposto oltre la capienza della fascia (§310).
   */
  private async assertProfessionalFree(db: PrismaClient | Prisma.TransactionClient, quote: AcceptableQuote): Promise<void> {
    await this.assertSlotFree(db, quote.professionalProfileId, quote.estimatedStartDate, quote.estimatedEndDate, quote.guidedRequest.serviceMode);
  }

  private async assertSlotFree(
    db: PrismaClient | Prisma.TransactionClient,
    professionalProfileId: string,
    start: Date,
    end: Date | null,
    mode: Parameters<typeof countOverlapping>[3],
  ): Promise<void> {
    const dayStart = new Date(start);
    dayStart.setUTCHours(0, 0, 0, 0);
    const until = end && end > start ? end : new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const commitments = (await loadCommitments(db, [professionalProfileId], dayStart, until)).get(professionalProfileId) ?? [];
    if (countOverlapping(commitments, start, end, mode) >= (await capacityAt(db, professionalProfileId, start, mode))) {
      throw new ConflictException(PROFESSIONAL_BUSY_MESSAGE);
    }
  }

  /** Crea la prenotazione dal preventivo accettato: da qui il professionista vede i contatti del cliente (CLAUDE.md §5 punto 9). */
  private async confirmAcceptedQuote(quote: AcceptableQuote, clientId: string, paymentMethod: JobPaymentChoice): Promise<string> {
    const offer = quotePaymentOffer(quote);
    const { guidedRequest } = quote;
    // Una accettazione alla volta per professionista: la seconda vede il
    // lavoro della prima (docs/CHANGELOG.md §310). Prima due clienti che
    // accettavano insieme due preventivi alla stessa ora creavano due lavori
    // sovrapposti (D1), e lo stesso preventivo accettato due volte dava un
    // errore interno invece di "già accettato" (D4).
    const booking = await this.prisma.$transaction(async (tx) => {
      await lockProfessionalAgenda(tx, quote.professionalProfileId);
      if (await tx.booking.findUnique({ where: { quoteId: quote.id }, select: { id: true } })) {
        throw new ConflictException("Questo preventivo è già stato accettato.");
      }
      // Due preventivi della stessa richiesta accettati insieme (§346): il secondo vede il primo.
      await lockGuidedRequest(tx, quote.guidedRequestId);
      await this.assertNoOtherJob(tx, quote.guidedRequestId);
      await this.assertProfessionalFree(tx, quote);
      const cancellationNoticeHours = quote.cancellationNoticeHours ?? (await cancellationNoticeFor(tx, quote.professionalProfileId));
      return tx.booking.create({
      data: {
        quoteId: quote.id,
        clientId,
        professionalProfileId: quote.professionalProfileId,
        scheduledAt: quote.estimatedStartDate,
        cancellationNoticeHours,
        scheduledEndAt: quote.estimatedEndDate,
        serviceMode: guidedRequest.serviceMode,
        status: "CONFIRMED",
        recipientName: guidedRequest.recipientName,
        recipientSurname: guidedRequest.recipientSurname,
        recipientPhone: guidedRequest.recipientPhone,
        street: guidedRequest.address,
        houseNumber: guidedRequest.houseNumber,
        addressExtra: guidedRequest.addressExtra,
        postalCode: guidedRequest.postalCode,
        city: guidedRequest.city,
        province: guidedRequest.province,
      },
      });
    }).catch((err: unknown) => {
      // Il vincolo del database ha fermato un secondo lavoro sfuggito al controllo.
      if (isOtherJobViolation(err)) throw new ConflictException(OTHER_JOB_MESSAGE);
      throw err;
    });

    // Metodo di pagamento scelto dal cliente (§168, §237): acconto online
    // con la percentuale del professionista sull'importo massimo, saldo
    // online o diretto; oppure tutto diretto al professionista.
    await this.jobPaymentsService.createAtAcceptance({
      bookingId: booking.id,
      choice: paymentMethod,
      depositPercent: offer.depositPercent,
      quoteMaxEurCents: quotePriceTotals(quote.items).totalMaxEurCents,
      clientUserId: clientId,
    });

    await this.prisma.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });
    await this.prisma.guidedRequest.update({ where: { id: quote.guidedRequestId }, data: { status: "CLOSED", closedReason: "COMPLETED" } });

    // Il professionista deve sapere che il proprio preventivo è stato
    // accettato — mancava del tutto (richiesta esplicita dell'utente, "wow
    // hanno accettato un tuo preventivo" come esempio di popup atteso).
    // Dati del cliente già nell'email al professionista (richiesta esplicita
    // dell'utente, docs/CHANGELOG.md §228): si sbloccano proprio ora, con la
    // prenotazione creata (CLAUDE.md §5 punto 9). Stessi campi della scheda.
    const client = guidedRequest.client;
    const clientFullName =
      [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || [client?.name, client?.surname].filter(Boolean).join(" ") || null;
    const clientAddress = formatBookingAddress(booking) ?? (guidedRequest.address ? `${guidedRequest.address}${guidedRequest.city ? `, ${guidedRequest.city}` : ""}` : null);
    // Fattura chiesta accettando (docs/CHANGELOG.md §378): detta subito, coi dati da copiare.
    const invoice = (await this.clientInvoiceRequestsService?.forAcceptedNotice(quote.id)) ?? {};
    await this.notificationsService.notify(quote.professionalProfile.userId, "QUOTE_ACCEPTED", {
      ...invoice,
      bookingId: booking.id,
      guidedRequestId: quote.guidedRequestId,
      clientName: clientFullName,
      // Quale lavoro, nel testo della notifica (docs/CHANGELOG.md §349).
      category: guidedRequest.category.label,
      jobLabel: notificationJobLabel(guidedRequest.description),
      clientPhone: booking.recipientPhone ?? client?.phone ?? null,
      clientAddress,
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
    });
    // Conferma al cliente con il calendario (§346), solo email: sul sito ha appena visto "Appuntamento prenotato".
    this.notificationsService.emailOnly(clientId, "BOOKING_CONFIRMED", { bookingId: booking.id, guidedRequestId: quote.guidedRequestId });

    // Metriche di affidabilità (CLAUDE.md §15, evento 3): il preventivo è
    // diventato una prenotazione reale ("accettato" in questo dominio).
    await this.professionalMetricsService.recordJobAccepted(quote.professionalProfileId);
    // Conteggio lavori del mese e avviso vicino al limite (docs/CHANGELOG.md §161).
    await this.subscriptionsService.afterJobAccepted(quote.professionalProfileId);

    await this.timelineService.log(
      quote.guidedRequestId,
      quote.professionalProfileId,
      "CLIENT",
      paymentMethod === "ONLINE"
        ? "Il cliente ha accettato il preventivo e pagato l'acconto online: prenotazione confermata, saldo online a lavoro finito."
        : paymentMethod === "MIXED"
          ? "Il cliente ha accettato il preventivo e pagato l'acconto online: prenotazione confermata, saldo diretto al professionista."
          : "Il cliente ha accettato il preventivo: prenotazione confermata, pagamento diretto al professionista.",
    );

    return booking.id;
  }

  /**
   * Il professionista conferma, completa o annulla una prenotazione.
   * CONFIRMED serve soprattutto alle prenotazioni dirette dall'agenda
   * pubblica (bookAgendaSlot le crea come PENDING, vedi
   * ProfessionalsService): prima di questo cambio non esisteva alcuna azione
   * per farle avanzare, restavano PENDING per sempre — bug reale, la
   * dashboard mostrava il bottone "Segna come completato" solo per lo stato
   * CONFIRMED.
   */
  async updateStatus(professionalUserId: string, bookingId: string, status: "CONFIRMED" | "COMPLETED" | "CANCELED" | "NO_SHOW") {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: true } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status === "COMPLETED" || booking.status === "CANCELED") {
      throw new ForbiddenException("Questa prenotazione è già conclusa.");
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      // canceledBy: questo metodo è chiamato solo dal professionista (guardia
      // sopra su professionalProfile) — CANCELED da qui è sempre PROFESSIONAL,
      // stesso valore già usato da cancelByProfessional.
      data: {
        status,
        ...(status === "CANCELED" ? { canceledBy: "PROFESSIONAL" as const } : {}),
        // Fa partire l'attesa delle recensioni automatiche (§189).
        ...(status === "COMPLETED" ? { professionalCompletedAt: new Date() } : {}),
      },
    });
    if (status === "CANCELED") {
      await this.jobPaymentsService.refundOnCancel(bookingId, professionalUserId);
      // Annullata dall'agenda: il cliente va avvisato come da
      // cancelByProfessional, e l'evento tolto dal suo calendario (docs/CHANGELOG.md §235).
      await this.notificationsService.notify(booking.clientId, "BOOKING_CANCELED_BY_PROFESSIONAL", {
        bookingId,
        cancellationNote: null,
        guidedRequestId: booking.quote?.guidedRequestId,
      });
    }

    // Metriche di affidabilità (CLAUDE.md §15): evento 4 (lavoro completato)
    // ed evento 6 (appuntamento onorato/mancato) — CANCELED non conta come
    // nessuno dei due (richiesta esplicita dell'utente), CONFIRMED è solo
    // "attività" del professionista senza statistiche da aggiornare.
    if (status === "COMPLETED") {
      await this.professionalMetricsService.recordJobCompleted(professionalProfile.id);
      await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, true);
    } else if (status === "NO_SHOW") {
      await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, false);
    } else {
      await this.professionalMetricsService.touchActivity(professionalProfile.id);
    }

    if (booking.quote) {
      const statusMessage: Record<typeof status, string> = {
        CONFIRMED: "Il professionista ha confermato la prenotazione.",
        COMPLETED: "Il professionista ha segnato il lavoro come completato.",
        CANCELED: "Il professionista ha annullato la prenotazione.",
        NO_SHOW: "Il professionista ha segnato la prenotazione come non presentato.",
      };
      await this.timelineService.log(booking.quote.guidedRequestId, professionalProfile.id, "PROFESSIONAL", statusMessage[status]);
    }

    return { bookingId, status };
  }

  /**
   * Nota privata del professionista su una prenotazione (richiesta esplicita
   * dell'utente: "eventuali note da ricordare") — mai vista dal cliente,
   * modificabile indipendentemente dallo stato della prenotazione (anche
   * conclusa: può ancora servire per ricordare qualcosa dopo il lavoro).
   * Stringa vuota salvata come `null`.
   *
   * Unificata con `ProfessionalsService.updateLeadNote` (richiesta esplicita
   * dell'utente: "le note personali del professionista devono essere le
   * stesse sia quando si apre il riquadro dall'agenda sia quelle inserite
   * tramite richieste ricevute") — prima erano due campi indipendenti
   * (`Booking.professionalNote` qui, `Lead.professionalNote` per il
   * pannello "richieste ricevute"), con lo stesso testo che poteva
   * divergere a seconda di dove lo si modificava. `Lead.professionalNote`
   * resta la fonte di verità (il Lead esiste da prima, fin dalla ricezione
   * della richiesta, il Booking arriva solo dopo): quando la prenotazione
   * ha una GuidedRequest collegata (Booking.quoteId → Quote.guidedRequestId,
   * ogni Quote presuppone un Lead già ricevuto — QuotesService.createOrUpdate
   * lo verifica), si scrive lì. `Booking.professionalNote` (colonna) resta
   * solo per le prenotazioni dirette da agenda pubblica (bookAgendaSlot,
   * dormiente da CLAUDE.md §20), che non hanno mai una GuidedRequest/Lead.
   */
  async updateProfessionalNote(professionalUserId: string, bookingId: string, note: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { quote: { select: { guidedRequestId: true } } },
    });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }

    const trimmed = note.trim();
    const guidedRequestId = booking.quote?.guidedRequestId;
    let wroteToLead = false;
    if (guidedRequestId) {
      const result = await this.prisma.lead.updateMany({
        where: { guidedRequestId, professionalProfileId: professionalProfile.id },
        data: { professionalNote: trimmed || null },
      });
      wroteToLead = result.count > 0;
    }
    if (!wroteToLead) {
      // Nessun Lead corrispondente (prenotazione diretta da agenda pubblica,
      // o caso limite senza Lead) — fallback sulla colonna della Booking.
      await this.prisma.booking.update({ where: { id: bookingId }, data: { professionalNote: trimmed || null } });
    }
    // Metriche di affidabilità (CLAUDE.md §15, evento 7): azione del professionista.
    await this.professionalMetricsService.touchActivity(professionalProfile.id);
    return { bookingId, professionalNote: trimmed || null };
  }

  /**
   * "Sto arrivando" dall'agenda (docs/CHANGELOG.md §288): avvisa il cliente
   * che il professionista è in viaggio. Solo per un lavoro confermato di
   * oggi, una volta sola: un secondo tocco non manda un altro avviso.
   */
  async notifyOnTheWay(professionalUserId: string, bookingId: string, now: Date = new Date()) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: { select: { guidedRequestId: true } } } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CONFIRMED") {
      throw new BadRequestException("Puoi avvisare il cliente solo per un lavoro confermato.");
    }
    if (booking.scheduledAt.toISOString().slice(0, 10) !== wallClockToday(now).toISOString().slice(0, 10)) {
      throw new BadRequestException("Puoi avvisare il cliente solo il giorno dell'appuntamento.");
    }
    if (booking.onTheWayAt) {
      return { bookingId, onTheWayAt: booking.onTheWayAt.toISOString() };
    }

    const updated = await this.prisma.booking.update({ where: { id: bookingId }, data: { onTheWayAt: now } });
    await this.notificationsService.notify(booking.clientId, "PROFESSIONAL_ON_THE_WAY", {
      bookingId,
      guidedRequestId: booking.quote?.guidedRequestId,
    });
    if (booking.quote) {
      await this.timelineService.log(booking.quote.guidedRequestId, professionalProfile.id, "PROFESSIONAL", "Il professionista sta arrivando.");
    }
    await this.professionalMetricsService.touchActivity(professionalProfile.id);
    return { bookingId, onTheWayAt: updated.onTheWayAt!.toISOString() };
  }

  /**
   * Link per una consulenza video (Meet, Zoom, ecc.) su una prenotazione —
   * richiesta esplicita dell'utente per la consulenza online (CLAUDE.md
   * §1). Stesso pattern di updateProfessionalNote (stringa vuota = rimosso,
   * validazione URL già applicata lato Zod prima di arrivare qui), ma
   * visibile al cliente (a differenza della nota privata).
   */
  async updateMeetingLink(professionalUserId: string, bookingId: string, meetingLink: string) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }

    const trimmed = meetingLink.trim();
    await this.prisma.booking.update({ where: { id: bookingId }, data: { meetingLink: trimmed || null } });
    await this.professionalMetricsService.touchActivity(professionalProfile.id);
    return { bookingId, meetingLink: trimmed || null };
  }

  /**
   * Il professionista segnala un "Lavoro accettato" come terminato,
   * inserendo l'importo preciso — richiesta esplicita dell'utente: una
   * finestra dedicata (non un semplice cambio di stato) dove seguire le
   * voci del preventivo originale (QuoteItem, un range) ma con un prezzo
   * esatto, più eventuali voci aggiuntive non preventivate. Le QuoteItem
   * originali non vengono mai toccate: restano l'offerta di riferimento,
   * l'importo finale è un dato separato (BookingFinalItem).
   */
  async completeWithFinalAmount(professionalUserId: string, bookingId: string, input: CompleteBookingInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: { include: { items: true } } } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CONFIRMED") {
      throw new BadRequestException("Solo un lavoro confermato può essere segnalato come terminato.");
    }
    // Mai prima del giorno dell'appuntamento, come il pulsante in Agenda
    // (§311, collaudo F-01): il saldo si addebiterebbe al cliente prima del lavoro.
    if (startsAfterToday(booking.scheduledAt)) {
      throw new BadRequestException(
        "Puoi segnare il lavoro come terminato dal giorno dell'appuntamento. Se l'hai fatto prima, sposta prima la data con il cliente.",
      );
    }

    // Dichiarazione sull'importo (DAC7, docs/CHANGELOG.md §246): il testo
    // dipende dal tipo fiscale; se nel frattempo è cambiato il professionista
    // deve rileggerlo, mai salvare una versione che non ha visto.
    const fiscal = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId: professionalProfile.id }, select: { entityType: true } });
    const declaration = completionDeclaration(fiscal?.entityType);
    if (input.declarationVersion !== declaration.version) {
      throw new BadRequestException("La pagina non è aggiornata: chiudi e riapri \"Lavoro terminato\".");
    }

    const finalAmountEurCents = input.items.reduce((sum, item) => sum + item.priceEurCents, 0);
    // Voci aggiunte o totale fuori dal preventivo vanno motivate
    // (docs/CHANGELOG.md §163): stessa regola del modulo, mai fidarsi del client.
    const deviation = completionDeviation(booking.quote?.items ?? [], input.items);
    const changeReason = input.changeReason?.trim() || null;
    if (deviation?.needsReason && !changeReason) {
      throw new BadRequestException(`${completionDeviationText(deviation)}: spiega il motivo prima di confermare.`);
    }

    // Tetto ai pagamenti online (docs/changelog/2026-10-28-tetto-pagamenti-online.md):
    // un lavoro pagato tutto online non si chiude sopra il tetto, il resto si
    // paga in diretto. Con il saldo diretto online passa solo l'acconto.
    const onlinePayment = await this.prisma.jobPayment.findUnique({ where: { bookingId }, select: { paymentMethod: true, balanceDirect: true } });
    if (onlinePayment?.paymentMethod === "MANOVIA" && !onlinePayment.balanceDirect) {
      const { limitEurCents } = await professionalOnlineLimit(this.prisma, professionalProfile.id);
      if (limitEurCents !== null && finalAmountEurCents > limitEurCents) {
        throw new BadRequestException(onlineLimitCompletionProblem(limitEurCents));
      }
    }

    await this.prisma.$transaction([
      this.prisma.bookingFinalItem.deleteMany({ where: { bookingId } }),
      this.prisma.bookingFinalItem.createMany({
        data: input.items.map((item) => ({ bookingId, name: item.name, priceEurCents: item.priceEurCents })),
      }),
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: "COMPLETED",
          finalAmountEurCents,
          professionalCompletionPhotoUrls: input.photoUrls,
          professionalCompletionNote: input.note?.trim() || null,
          professionalCompletedAt: new Date(),
          completionChangeReason: deviation?.needsReason ? changeReason : null,
          completionDeclarationAcceptedAt: new Date(),
          completionDeclarationVersion: declaration.version,
        },
      }),
    ]);

    // Importo diverso dal preventivo: il motivo arriva al cliente nella
    // notifica, nell'email e in chat (richiesta esplicita dell'utente, docs/CHANGELOG.md §228).
    const clientReason = deviation?.needsReason ? changeReason : null;
    await this.notificationsService.notify(booking.clientId, "JOB_COMPLETED", {
      bookingId,
      finalAmountEurCents,
      guidedRequestId: booking.quote?.guidedRequestId,
      ...(clientReason ? { changeReason: clientReason } : {}),
    });

    if (booking.quote) {
      const totalEuro = formatEurCents(finalAmountEurCents);
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        professionalProfile.id,
        "PROFESSIONAL",
        `Il professionista ha segnalato il lavoro come terminato. Importo finale: ${totalEuro}.${clientReason ? ` Diverso dal preventivo perché: "${clientReason}"` : ""}`,
      );
    }

    // Metriche di affidabilità (CLAUDE.md §15, eventi 4+6): lavoro
    // completato con importo esatto conta sia come lavoro concluso sia
    // come appuntamento onorato.
    await this.professionalMetricsService.recordJobCompleted(professionalProfile.id);
    await this.professionalMetricsService.recordAppointmentOutcome(professionalProfile.id, true);

    // Pagamento del lavoro (CLAUDE.md §88) — creato solo ora, il primo
    // momento in cui l'importo lordo reale è noto (un preventivo ha solo un
    // range stimato). Default DIRECT/in attesa di conferma del cliente,
    // mai bloccante: nessun professionista deve dipendere da Stripe Connect
    // configurato per poter chiudere un lavoro.
    const online = await this.jobPaymentsService.createOnCompletion({
      bookingId,
      grossAmountEurCents: finalAmountEurCents,
      reportedByUserId: professionalUserId,
      alreadyConfirmedByClient: booking.clientConfirmedCompletedAt !== null,
      // Saldo sulla carta dell'acconto solo dentro il preventivo accettato: niente voci nuove né totale sopra il massimo (§267).
      autoChargeBalance:
        !!deviation && deviation.addedItemNames.length === 0 && deviation.direction !== "ABOVE" && deviation.quoteMaxEurCents !== null,
    });
    // Pagamento online (§168): il cliente paga il saldo sull'importo finale.
    if (online && online.balanceDueEurCents > 0) {
      await this.notificationsService.notify(booking.clientId, "JOB_BALANCE_DUE", {
        bookingId,
        guidedRequestId: booking.quote?.guidedRequestId,
        amountEurCents: online.balanceDueEurCents,
        audience: "CLIENT",
      });
    }

    return { bookingId, status: "COMPLETED" as const, finalAmountEurCents };
  }

  /**
   * Il cliente conferma dal proprio lato che il lavoro è davvero terminato
   * (richiesta esplicita dell'utente: "servono i completed da entrambi") —
   * in origine possibile solo dopo che il professionista aveva già
   * completato il proprio lato, richiesta esplicita successiva
   * dell'utente ("il cliente deve poter cliccare su lavoro terminato a
   * prescindere se il professionista l'abbia già cliccato o no") ha
   * rimosso quella dipendenza d'ordine: il cliente può confermare su
   * qualunque prenotazione ancora attiva (`CONFIRMED`) o già completata
   * dal professionista (`COMPLETED`), una sola volta. La recensione resta
   * comunque bloccata finché `status` non è davvero `COMPLETED`
   * (`ReviewsService.create`, controllo indipendente da questo campo — non
   * toccato: "recensione solo da prenotazione confermata/completata",
   * CLAUDE.md §8, regola di business separata da "chi ha cliccato prima").
   */
  async clientConfirmComplete(clientId: string, bookingId: string, input: ClientConfirmCompleteInput) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: true } });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CONFIRMED" && booking.status !== "COMPLETED") {
      throw new BadRequestException("Puoi segnalare come terminato solo un lavoro confermato.");
    }
    if (booking.clientConfirmedCompletedAt) {
      throw new ForbiddenException("Hai già confermato il completamento di questo lavoro.");
    }
    // Mai prima del giorno dell'appuntamento (§346, collaudo F-01).
    if (booking.status === "CONFIRMED" && startsAfterToday(booking.scheduledAt)) {
      throw new BadRequestException("Potrai confermare che il lavoro è terminato dal giorno dell'appuntamento.");
    }

    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { clientConfirmedCompletedAt: new Date(), clientCompletionPhotoUrls: input.photoUrls, clientCompletionNote: input.note?.trim() || null },
    });

    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        booking.professionalProfileId,
        "CLIENT",
        "Il cliente ha confermato che il lavoro è terminato.",
      );
    }

    // Conferma anche il pagamento DIRECT (CLAUDE.md §88) — la stessa
    // conferma "lavoro terminato" vale come conferma di aver pagato
    // direttamente il professionista, coerente col flusso già esistente
    // (nessun passaggio separato richiesto al cliente). No-op se il
    // pagamento è già passato a MANOVIA o non esiste ancora.
    await this.jobPaymentsService.confirmDirect(bookingId, clientId);

    return { bookingId };
  }

  /**
   * Il professionista annulla un intervento già confermato, con una nota
   * facoltativa per il cliente (richiesta esplicita dell'utente) — distinto
   * da cancelForClient (nessuna nota lì, il cliente non deve spiegazioni al
   * professionista) e dal generico updateStatus (usato dal calendario, senza
   * nota).
   */
  async cancelByProfessional(professionalUserId: string, bookingId: string, input: CancelBookingByProfessionalInput) {
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId: professionalUserId } });
    if (!professionalProfile) {
      throw new NotFoundException("Profilo professionista non trovato.");
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: true } });
    if (!booking || booking.professionalProfileId !== professionalProfile.id) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status === "COMPLETED" || booking.status === "CANCELED") {
      throw new ForbiddenException("Questa prenotazione è già conclusa.");
    }

    const cancellationNote = input.note?.trim() || null;
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELED", cancellationNote, canceledBy: "PROFESSIONAL" },
    });
    // Lavoro pagato online (§168): l'acconto torna al cliente.
    await this.jobPaymentsService.refundOnCancel(bookingId, professionalUserId);

    await this.notificationsService.notify(booking.clientId, "BOOKING_CANCELED_BY_PROFESSIONAL", {
      bookingId,
      cancellationNote,
      guidedRequestId: booking.quote?.guidedRequestId,
    });

    // Metriche di affidabilità (CLAUDE.md §15, evento 7): azione del
    // professionista — CANCELED non conta come appuntamento onorato/mancato
    // (evento 6, deciso esplicitamente), ma resta comunque "attività".
    await this.professionalMetricsService.touchActivity(professionalProfile.id);

    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        professionalProfile.id,
        "PROFESSIONAL",
        `Il professionista ha annullato l'intervento.${cancellationNote ? ` Nota: "${cancellationNote}"` : ""}`,
      );
    }

    return { bookingId, status: "CANCELED" as const };
  }

  /**
   * Il cliente annulla una propria prenotazione ancora attiva (PENDING o
   * CONFIRMED). Prima di questo endpoint un cliente che prenotava
   * direttamente una fascia dall'agenda pubblica (bookAgendaSlot) non aveva
   * alcun modo di disdire — solo il professionista poteva farlo.
   */
  async cancelForClient(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: { quote: true } });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      throw new ForbiddenException("Questa prenotazione non può più essere annullata.");
    }
    // Cominciato l'appuntamento non si annulla più (§346): prima si poteva
    // anche a lavoro fatto, e con l'acconto online tornavano i soldi.
    if (booking.scheduledAt.getTime() <= wallClockNow().getTime()) {
      throw new ForbiddenException(CLIENT_CANCEL_TOO_LATE);
    }

    // Dentro il preavviso scelto dal professionista (§347) si può ancora
    // annullare, ma resta segnato: lo vede il professionista. L'acconto
    // online resta a lui solo se l'aveva scritto nel preventivo (§348).
    const late = isLateCancellation(booking.scheduledAt, booking.cancellationNoticeHours);
    await this.prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELED", canceledBy: "CLIENT", canceledLate: late } });
    const keptEurCents = late && booking.quote?.lateCancelKeepsDeposit ? await this.jobPaymentsService.keepDepositOnLateCancel(bookingId) : 0;
    // Lavoro pagato online (§168): altrimenti l'acconto torna al cliente.
    if (keptEurCents === 0) await this.jobPaymentsService.refundOnCancel(bookingId, clientId);
    // Prima il professionista non veniva avvisato; l'email toglie anche
    // l'evento dal calendario (docs/CHANGELOG.md §235).
    const professional = await this.prisma.professionalProfile.findUnique({ where: { id: booking.professionalProfileId }, select: { userId: true } });
    if (professional) {
      await this.notificationsService.notify(professional.userId, "BOOKING_CANCELED_BY_CLIENT", {
        bookingId,
        guidedRequestId: booking.quote?.guidedRequestId,
        ...(late ? { lateNotice: cancellationNoticeLabel(booking.cancellationNoticeHours) } : {}),
        ...(keptEurCents > 0 ? { keptDepositEurCents: keptEurCents } : {}),
      });
    }
    if (booking.quote) {
      const note = late
        ? ` con meno di ${cancellationNoticeLabel(booking.cancellationNoticeHours)} di preavviso${keptEurCents > 0 ? `: l'acconto di ${formatEurCents(keptEurCents)} resta al professionista` : ""}`
        : "";
      await this.timelineService.log(booking.quote.guidedRequestId, booking.professionalProfileId, "CLIENT", `Il cliente ha annullato la prenotazione${note}.`);
    }
    return { bookingId, status: "CANCELED" as const, keptDepositEurCents: keptEurCents };
  }

  /** Evento del calendario per il cliente: link di Google Calendar e file .ics, con lo stesso UID delle email. */
  async calendarForClient(clientUserId: string, bookingId: string): Promise<{ googleUrl: string | null; ics: string }> {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId }, include: BOOKING_CALENDAR_INCLUDE });
    if (!booking) throw new NotFoundException("Prenotazione non trovata.");
    if (booking.clientId !== clientUserId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (booking.status === "CANCELED") throw new BadRequestException("Questo appuntamento è stato annullato.");
    const calendar = bookingCalendar(booking, "client");
    return { googleUrl: calendar.calendarUrl, ics: calendar.attachment.content };
  }

  /**
   * Riapertura di un appuntamento annullato (collaudo F-08, miglioria
   * approvata da Luca il 30/10/2026): chi l'ha annullato chiede di
   * riaprirlo e l'altro accetta o rifiuta. Prima tornava valido subito,
   * anche se l'altro aveva già preso altri impegni.
   */
  async reopenBooking(userId: string, bookingId: string) {
    const { booking, requester } = await this.loadReopenable(userId, bookingId, "request");
    if (booking.reopenRequestedAt) throw new BadRequestException("Hai già chiesto di riaprirlo: aspetta la risposta.");
    await this.assertCanReopen(booking);
    await this.prisma.booking.update({ where: { id: bookingId }, data: { reopenRequestedAt: new Date(), reopenRequestedBy: requester } });
    const byClient = requester === "CLIENT";
    await this.notificationsService.notify(byClient ? booking.professionalProfile.userId : booking.clientId, "BOOKING_REOPEN_REQUESTED", {
      bookingId,
      guidedRequestId: booking.quote?.guidedRequestId,
      audience: byClient ? "PROFESSIONAL" : "CLIENT",
      scheduledAt: booking.scheduledAt.toISOString(),
    });
    if (booking.quote) {
      await this.timelineService.log(booking.quote.guidedRequestId, booking.professionalProfileId, requester, `${byClient ? "Il cliente" : "Il professionista"} ha chiesto di riaprire l'appuntamento annullato.`);
    }
    return { bookingId, status: "REOPEN_REQUESTED" as const };
  }

  /** Risposta di chi non ha annullato alla richiesta di riaprire. */
  async answerReopen(userId: string, bookingId: string, accept: boolean) {
    const { booking, requester } = await this.loadReopenable(userId, bookingId, "answer");
    const byClient = requester === "CLIENT";
    const requesterUserId = byClient ? booking.clientId : booking.professionalProfile.userId;
    const answerer = byClient ? "PROFESSIONAL" : "CLIENT";
    if (!accept) {
      const cleared = await this.prisma.booking.updateMany({ where: { id: bookingId, reopenRequestedAt: { not: null } }, data: { reopenRequestedAt: null, reopenRequestedBy: null } });
      if (cleared.count === 0) throw new BadRequestException("Questa richiesta ha già una risposta.");
      await this.notificationsService.notify(requesterUserId, "BOOKING_REOPEN_DECLINED", {
        bookingId,
        guidedRequestId: booking.quote?.guidedRequestId,
        audience: requester,
      });
      if (booking.quote) {
        await this.timelineService.log(booking.quote.guidedRequestId, booking.professionalProfileId, answerer, `${byClient ? "Il professionista" : "Il cliente"} non ha accettato di riaprire l'appuntamento.`);
      }
      return { bookingId, status: "CANCELED" as const };
    }

    const { scheduledAt, dayStart, dayEnd, requestServiceMode, maxBookings } = await this.assertCanReopen(booking);
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const existingBookings = await tx.booking.findMany({
            where: {
              professionalProfileId: booking.professionalProfileId,
              status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
              scheduledAt: { gte: dayStart, lt: dayEnd },
            },
            select: { scheduledAt: true, serviceMode: true },
          });
          const bookedCount = existingBookings.filter(
            (b) => b.scheduledAt.getTime() === scheduledAt.getTime() && (requestServiceMode ? b.serviceMode === requestServiceMode : true),
          ).length;
          if (bookedCount >= maxBookings) {
            throw new ConflictException("Questa fascia non è più libera.");
          }
          // Anche i lavori su più giorni e quelli segnati a mano in Agenda (§310, collaudo F-08).
          await this.assertSlotFree(tx, booking.professionalProfileId, booking.scheduledAt, booking.scheduledEndAt, booking.serviceMode);
          await tx.booking.update({
            where: { id: bookingId },
            data: { status: "CONFIRMED", canceledBy: null, cancellationNote: null, canceledLate: false, reopenRequestedAt: null, reopenRequestedBy: null },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
        throw new ConflictException("Questa fascia non è più libera.");
      }
      if (isOtherJobViolation(err)) throw new ConflictException(OTHER_JOB_MESSAGE);
      throw err;
    }

    await this.notificationsService.notify(requesterUserId, byClient ? "BOOKING_REOPENED_BY_PROFESSIONAL" : "BOOKING_REOPENED_BY_CLIENT", {
      bookingId,
      guidedRequestId: booking.quote?.guidedRequestId,
    });
    if (!byClient) {
      await this.professionalMetricsService.touchActivity(booking.professionalProfileId);
    }
    if (booking.quote) {
      await this.timelineService.log(booking.quote.guidedRequestId, booking.professionalProfileId, answerer, `${byClient ? "Il professionista" : "Il cliente"} ha accettato: l'appuntamento è di nuovo valido.`);
    }

    // Acconto trattenuto per l'annullamento tardivo (§348): torna acconto.
    await this.jobPaymentsService.undoKeptDeposit(bookingId);
    // Lavoro online con acconto già rimborsato all'annullamento: si riparte dall'acconto.
    await this.prisma.jobPayment.updateMany({
      where: { bookingId, paymentMethod: "MANOVIA", onlineStage: "REFUNDED" },
      data: { onlineStage: "AWAITING_DEPOSIT", status: "PENDING", releasedAt: null },
    });

    return { bookingId, status: "CONFIRMED" as const };
  }

  /**
   * Appuntamento annullato e chi agisce: `request` per chi l'ha annullato
   * (regola simmetrica, §197), `answer` per l'altro, con una richiesta aperta.
   */
  private async loadReopenable(userId: string, bookingId: string, action: "request" | "answer") {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { quote: true, professionalProfile: true },
    });
    if (!booking) {
      throw new NotFoundException("Prenotazione non trovata.");
    }
    const isClient = booking.clientId === userId;
    const isProfessional = booking.professionalProfile.userId === userId;
    if (!isClient && !isProfessional) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.status !== "CANCELED") {
      throw new ForbiddenException("Questa prenotazione non è annullata.");
    }
    if (action === "answer") {
      const by = booking.reopenRequestedBy;
      const requester: "CLIENT" | "PROFESSIONAL" | null = by === "CLIENT" ? "CLIENT" : by === "PROFESSIONAL" ? "PROFESSIONAL" : null;
      if (!booking.reopenRequestedAt || !requester) throw new BadRequestException("Nessuna richiesta di riaprire questo appuntamento.");
      if ((requester === "CLIENT") === isClient) throw new ForbiddenException("Risponde l'altra parte.");
      return { booking, requester };
    }
    // Regola simmetrica (richiesta esplicita dell'utente, §197): ognuno chiede
    // di riaprire solo ciò che ha annullato lui. Le righe senza autore
    // (precedenti a canceledBy) non si riaprono da nessun lato. Il cliente può
    // sempre inviare una richiesta nuova.
    if (isClient && booking.canceledBy !== "CLIENT") {
      throw new ForbiddenException("Il professionista ha annullato questo intervento: non puoi riaprirlo. Puoi inviare una nuova richiesta.");
    }
    if (!isClient && booking.canceledBy !== "PROFESSIONAL") {
      throw new ForbiddenException("Il cliente ha annullato questo intervento: solo lui può riaprirlo.");
    }
    return { booking, requester: isClient ? ("CLIENT" as const) : ("PROFESSIONAL" as const) };
  }

  /** Controlli prima di chiedere e prima di riaprire davvero: la situazione può cambiare nel frattempo. */
  private async assertCanReopen(booking: Prisma.BookingGetPayload<{ include: { quote: true; professionalProfile: true } }>) {
    const bookingId = booking.id;
    // Nel frattempo il cliente ha accettato un altro preventivo della stessa richiesta (§346).
    if (booking.quote) await this.assertNoOtherJob(this.prisma, booking.quote.guidedRequestId, booking.id);
    // Acconto trattenuto e già passato al professionista (§348): il lavoro non torna indietro.
    const keptAndReleased = await this.prisma.jobPayment.findFirst({ where: { bookingId, depositKeptAt: { not: null }, releasedAt: { not: null } }, select: { id: true } });
    if (keptAndReleased) {
      throw new ForbiddenException("L'acconto è già passato al professionista: per un nuovo appuntamento invia una nuova richiesta.");
    }

    // Un appuntamento già passato non si riapre (collaudo F-08).
    if (booking.scheduledAt.getTime() <= wallClockNow().getTime()) {
      throw new ForbiddenException("L'ora di questo appuntamento è già passata: per un nuovo appuntamento invia una nuova richiesta.");
    }

    const scheduledAt = booking.scheduledAt;
    const dayStart = new Date(scheduledAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const timeStr = scheduledAt.toISOString().slice(11, 16);
    const dayOfWeek = scheduledAt.getUTCDay();

    const candidateSlots = await this.prisma.availabilitySlot.findMany({
      where: { professionalProfileId: booking.professionalProfileId, OR: [{ date: dayStart }, { date: null, dayOfWeek }] },
    });
    const matchingSlot = candidateSlots.find((s) => timeStr >= s.startTime && timeStr < s.endTime);
    const requestServiceMode = booking.serviceMode;
    if (matchingSlot) {
      const modeCapacity = requestServiceMode === "ONLINE" ? matchingSlot.onlineMaxBookings : matchingSlot.homeMaxBookings;
      if (modeCapacity === null) {
        throw new ConflictException(
          requestServiceMode === "ONLINE"
            ? "Il professionista non offre più consulenza online su questa fascia oraria."
            : "Il professionista non offre più interventi a domicilio su questa fascia oraria.",
        );
      }
    }
    const maxBookings =
      requestServiceMode === "ONLINE" ? (matchingSlot?.onlineMaxBookings ?? 1) : (matchingSlot?.homeMaxBookings ?? 1);
    return { scheduledAt, dayStart, dayEnd, requestServiceMode, maxBookings };
  }

  /**
   * Vecchio percorso "Non presentato": ora è una segnalazione come le altre
   * (docs/CHANGELOG.md §164), con la stessa finestra di 7 giorni. Non segna
   * più "rimborso richiesto" (§167): un rimborso parte solo da una
   * segnalazione accolta su un lavoro pagato sul sito.
   */
  async reportProfessionalNoShow(clientId: string, bookingId: string) {
    const issue = await this.reportIssue(clientId, bookingId, {
      type: "NO_SHOW",
      description: "Il professionista non si è presentato all'appuntamento.",
      photoUrls: [],
    });
    return { bookingId, issueId: issue.id, status: issue.status };
  }

  /**
   * Il cliente segnala un problema sul lavoro (docs/CHANGELOG.md §164):
   * mancata presentazione (entro 7 giorni dalla fine dell'appuntamento) o
   * lavoro non andato bene (entro 7 giorni, finché il cliente non conferma). Finestre ricalcolate qui, mai
   * fidarsi del client. Una sola segnalazione per lavoro; la decide un admin.
   */
  /**
   * Il professionista segnala un problema sull'intervento (richiesta esplicita
   * dell'utente, docs/CHANGELOG.md §197): cliente assente, mancato pagamento,
   * lavoro diverso dal descritto, comportamento scorretto. Va nelle
   * segnalazioni del nostro team come segnalazione della richiesta (stesso
   * pannello e stesse misure di "Segnala richiesta") e nella chat col cliente,
   * che riceve l'avviso. Non tocca pagamenti né stato della prenotazione.
   */
  async reportProblemByProfessional(userId: string, bookingId: string, input: ReportProfessionalJobProblemInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        clientId: true,
        professionalProfileId: true,
        professionalProfile: { select: { userId: true } },
        quote: { select: { guidedRequestId: true } },
      },
    });
    if (!booking) {
      throw new NotFoundException("Prenotazione non trovata.");
    }
    if (booking.professionalProfile.userId !== userId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (!booking.quote) {
      throw new BadRequestException("Puoi segnalare un problema solo su un lavoro nato da una richiesta.");
    }
    if (booking.status === "PENDING") {
      throw new BadRequestException("Puoi segnalare un problema solo su un intervento confermato.");
    }
    const guidedRequestId = booking.quote.guidedRequestId;
    const reasonLabel = PROFESSIONAL_JOB_PROBLEM_REASONS.find((r) => r.value === input.reason)?.label ?? input.reason;
    const reason = `${PROFESSIONAL_JOB_PROBLEM_REPORT_PREFIX}${reasonLabel}`;

    // Stessa finestra anti-doppioni di ContentReportsService.create.
    const recentDuplicate = await this.prisma.contentReport.findFirst({
      where: { reporterId: userId, targetType: "GUIDED_REQUEST", targetId: guidedRequestId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { id: true },
    });
    if (recentDuplicate) {
      throw new ConflictException("Hai già inviato una segnalazione su questo lavoro nelle ultime 24 ore.");
    }

    const description = input.description.trim();
    const photoUrls = input.photoUrls ?? [];
    const created = await this.prisma.contentReport.create({
      data: { reporterId: userId, targetType: "GUIDED_REQUEST", targetId: guidedRequestId, reason, details: description, photoUrls },
      select: { id: true },
    });
    await this.timelineService.log(
      guidedRequestId,
      booking.professionalProfileId,
      "PROFESSIONAL",
      `Il professionista ha segnalato un problema sull'intervento: ${reasonLabel.toLowerCase()}. «${description}» Scrivetevi qui in chat per chiarire; la segnalazione arriva anche al nostro team.`,
      photoUrls,
    );
    await this.notificationsService.notify(booking.clientId, "TIMELINE_MESSAGE_FROM_PROFESSIONAL", {
      guidedRequestId,
      professionalProfileId: booking.professionalProfileId,
    });
    this.notificationsService.emailAdminsNewReport({ targetType: "GUIDED_REQUEST", reason });
    return created;
  }

  async reportIssue(clientId: string, bookingId: string, input: ReportJobIssueInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        professionalProfile: { select: { userId: true } },
        quote: { select: { guidedRequestId: true } },
        issue: { select: { id: true } },
        jobPayment: { select: { paymentMethod: true } },
      },
    });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.issue) {
      throw new ConflictException("Hai già segnalato un problema su questo lavoro.");
    }
    const allowed = jobIssueTypesAllowed({ ...booking, hasIssue: false }, new Date());
    // Passato il termine resta la segnalazione senza rimborso (decisione di Luca del 30/10/2026).
    const late = !allowed.includes(input.type) && input.type === "BAD_WORK" && jobIssueLateAllowed({ ...booking, hasIssue: false }, new Date());
    if (!allowed.includes(input.type) && !late) {
      throw new BadRequestException(
        input.type === "NO_SHOW"
          ? "La mancata presentazione si può segnalare dalla fine dell'appuntamento, entro 7 giorni, se non hai già confermato il lavoro."
          : `Un lavoro non andato bene si può segnalare dall'inizio dell'appuntamento, entro ${BAD_WORK_REPORT_DAYS} giorni dalla sua conclusione, finché non hai confermato che è terminato.`,
      );
    }

    // Prima fase in chat (§165): cliente e professionista provano a
    // risolvere da soli. Senza una richiesta collegata non c'è chat
    // (prenotazione diretta dall'agenda): si passa subito al nostro team.
    // Pagamento diretto (§168) o dopo il termine: resta sempre tra le parti, niente team.
    const assisted = jobIssueAssisted(booking.jobPayment?.paymentMethod, late);
    const inChat = booking.quote !== null || !assisted;
    const issue = await this.prisma.jobIssue.create({
      data: {
        bookingId,
        type: input.type,
        description: input.description.trim(),
        photoUrls: input.photoUrls,
        status: inChat ? "CHAT" : "OPEN",
        late,
        // Senza chat va subito al nostro team: da qui le 72 ore per la
        // versione del professionista (§167).
        ...(inChat ? {} : { escalatedAt: new Date(), escalationReason: "CLIENT" }),
      },
    });
    if (!inChat) await this.jobIssueOutcomeService.notifyIssueAdmins("ADMIN_JOB_ISSUE_TO_REVIEW", { bookingId, issueType: input.type, stage: "ESCALATED" });

    await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_ISSUE_REPORTED", {
      bookingId,
      issueType: input.type,
      inChat,
      assisted,
      late,
      guidedRequestId: booking.quote?.guidedRequestId,
      professionalProfileId: booking.professionalProfileId,
    });
    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        booking.professionalProfileId,
        "CLIENT",
        late
          ? `Il cliente ha segnalato un problema: ${JOB_ISSUE_LABEL[input.type].toLowerCase()}. «${input.description.trim()}» ${JOB_ISSUE_LATE_NOTE} Scrivetevi qui in chat per trovare insieme una soluzione.`
          : assisted
          ? `Il cliente ha segnalato un problema: ${JOB_ISSUE_LABEL[input.type].toLowerCase()}. «${input.description.trim()}» Il professionista ha 48 ore per rispondere qui in chat e provare a trovare una soluzione; se non risponde la segnalazione passa da sola al nostro team, se non trovate un accordo il cliente può chiedere al nostro team di decidere.`
          : `Il cliente ha segnalato un problema: ${JOB_ISSUE_LABEL[input.type].toLowerCase()}. «${input.description.trim()}» Il lavoro è pagato direttamente al professionista: scrivetevi qui in chat per trovare insieme una soluzione. Il cliente potrà poi lasciare la recensione.`,
      );
    }
    return { id: issue.id, status: issue.status };
  }

  /**
   * Fine della prima fase in chat (§165), decisa dal cliente: "abbiamo
   * risolto" chiude la segnalazione; "non abbiamo risolto" la passa al
   * nostro team, che decide come prima.
   */
  async closeIssueChat(clientId: string, bookingId: string, outcome: "RESOLVED" | "ESCALATE") {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        issue: true,
        professionalProfile: { select: { userId: true } },
        quote: { select: { guidedRequestId: true } },
        jobPayment: { select: { paymentMethod: true } },
      },
    });
    if (!booking || booking.clientId !== clientId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (!booking.issue) throw new NotFoundException("Nessuna segnalazione su questo lavoro.");
    if (booking.issue.status !== "CHAT") throw new BadRequestException("La segnalazione non è più in chat.");
    const now = new Date();

    // Pagamento diretto (§168) o dopo il termine: "Non abbiamo risolto"
    // chiude la segnalazione tra le parti, senza il nostro team; il cliente può recensire.
    if (!jobIssueAssisted(booking.jobPayment?.paymentMethod, booking.issue.late)) {
      const status = outcome === "RESOLVED" ? "RESOLVED" : "UNRESOLVED";
      await this.prisma.jobIssue.update({ where: { id: booking.issue.id }, data: { status, resolvedAt: now } });
      await this.notificationsService.notify(booking.professionalProfile.userId, outcome === "RESOLVED" ? "JOB_ISSUE_SETTLED" : "JOB_ISSUE_UNRESOLVED", {
        bookingId,
        issueType: booking.issue.type,
        guidedRequestId: booking.quote?.guidedRequestId,
        audience: "PROFESSIONAL",
        late: booking.issue.late,
      });
      if (booking.quote) {
        await this.timelineService.log(
          booking.quote.guidedRequestId,
          booking.professionalProfileId,
          "CLIENT",
          outcome === "RESOLVED"
            ? "Il cliente ha indicato che il problema è stato risolto con il professionista."
            : "Il cliente ha indicato che non avete trovato un accordo.",
        );
      }
      return { bookingId, status };
    }

    if (outcome === "ESCALATE") {
      // Come il contatto diretto di Amazon (§167): il professionista ha 48
      // ore per rispondere; prima il cliente può passarla al team solo se ha
      // già risposto senza risolvere.
      const replies = await this.jobIssueOutcomeService.proChatReplies([
        {
          id: booking.issue.id,
          createdAt: booking.issue.createdAt,
          professionalRespondedAt: booking.issue.professionalRespondedAt,
          refundOfferedAt: booking.issue.refundOfferedAt,
          guidedRequestId: booking.quote?.guidedRequestId ?? null,
          professionalProfileId: booking.professionalProfileId,
        },
      ]);
      const chat = { status: booking.issue.status, createdAt: booking.issue.createdAt, proRepliedAt: replies.get(booking.issue.id) ?? null };
      if (!jobIssueCanEscalate(chat, now)) {
        throw new BadRequestException(
          "Il professionista ha 48 ore per risponderti in chat: se non risponde la segnalazione passa da sola al nostro team.",
        );
      }
    }

    const status = outcome === "RESOLVED" ? "RESOLVED" : "OPEN";
    await this.prisma.jobIssue.update({
      where: { id: booking.issue.id },
      data: { status, ...(outcome === "RESOLVED" ? { resolvedAt: now } : { escalatedAt: now, escalationReason: "CLIENT" }) },
    });
    await this.notificationsService.notify(booking.professionalProfile.userId, outcome === "RESOLVED" ? "JOB_ISSUE_SETTLED" : "JOB_ISSUE_ESCALATED", {
      bookingId,
      issueType: booking.issue.type,
      guidedRequestId: booking.quote?.guidedRequestId,
      audience: "PROFESSIONAL",
      ...(outcome === "ESCALATE" ? { evidenceDueAt: jobIssueEvidenceDueAt(now).toISOString() } : {}),
    });
    if (outcome === "ESCALATE") await this.jobIssueOutcomeService.notifyIssueAdmins("ADMIN_JOB_ISSUE_TO_REVIEW", { bookingId, issueType: booking.issue.type, stage: "ESCALATED" });
    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        booking.professionalProfileId,
        "CLIENT",
        outcome === "RESOLVED"
          ? "Il cliente ha indicato che il problema è stato risolto con il professionista."
          : "Il cliente ha chiesto al nostro team di decidere sulla segnalazione. Il professionista ha 72 ore per inviare la sua versione.",
      );
    }
    return { bookingId, status };
  }

  /**
   * Il professionista propone in chat un rimborso al cliente su un lavoro
   * pagato online (collaudo F-03): prima l'accordo restava a parole e non
   * diventava mai vero sul sito. Una nuova proposta sostituisce la vecchia.
   */
  async offerIssueRefund(professionalUserId: string, bookingId: string, amountEurCents: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: { select: { userId: true } }, issue: true, quote: { select: { guidedRequestId: true } }, jobPayment: true },
    });
    if (!booking || booking.professionalProfile.userId !== professionalUserId) throw new ForbiddenException("Questa prenotazione non è tua.");
    if (!booking.issue) throw new NotFoundException("Nessuna segnalazione su questo lavoro.");
    if (booking.issue.status !== "CHAT") throw new BadRequestException("La segnalazione non è più in chat: ora decide il nostro team.");
    const jp = booking.jobPayment;
    if (!jp || jp.paymentMethod !== "MANOVIA" || jp.releasedAt) {
      throw new BadRequestException("Il rimborso dal sito si propone solo su un lavoro pagato online e con i soldi ancora fermi.");
    }
    const available = jp.paidEurCents - jp.refundedEurCents;
    if (amountEurCents > available) {
      throw new BadRequestException(`Puoi proporre al massimo ${formatEurCents(available)}, quanto il cliente ha pagato online.`);
    }
    await this.prisma.jobIssue.update({ where: { id: booking.issue.id }, data: { refundOfferEurCents: amountEurCents, refundOfferedAt: new Date() } });
    await this.notificationsService.notify(booking.clientId, "JOB_ISSUE_REFUND_OFFERED", {
      bookingId,
      guidedRequestId: booking.quote?.guidedRequestId,
      amountEurCents,
      audience: "CLIENT",
    });
    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        booking.professionalProfileId,
        "PROFESSIONAL",
        `Il professionista propone un rimborso di ${formatEurCents(amountEurCents)}. Se il cliente lo accetta parte subito e la segnalazione si chiude.`,
      );
    }
    return { bookingId, refundOfferEurCents: amountEurCents };
  }

  /** Il cliente accetta il rimborso proposto: parte subito e la segnalazione si chiude (collaudo F-03). */
  async acceptIssueRefund(clientId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: { select: { userId: true } }, issue: true, quote: { select: { guidedRequestId: true } }, jobPayment: { select: { id: true } } },
    });
    if (!booking || booking.clientId !== clientId) throw new ForbiddenException("Questa prenotazione non è tua.");
    const issue = booking.issue;
    const amount = issue?.refundOfferEurCents ?? 0;
    if (!issue || issue.status !== "CHAT" || amount <= 0 || !booking.jobPayment) throw new BadRequestException("Non c'è nessun rimborso da accettare.");
    // Una sola accettazione anche con due tocchi insieme.
    const claimed = await this.prisma.jobIssue.updateMany({
      where: { id: issue.id, status: "CHAT", refundOfferEurCents: amount },
      data: { status: "RESOLVED", resolvedAt: new Date(), agreedRefundEurCents: amount, refundOfferEurCents: null },
    });
    if (claimed.count === 0) throw new BadRequestException("La proposta è cambiata: ricarica la pagina.");
    try {
      await this.jobPaymentsService.refundAgreed(booking.jobPayment.id, amount, clientId);
    } catch (err) {
      // Stripe non risponde: la segnalazione torna in chat con la stessa proposta.
      await this.prisma.jobIssue.update({ where: { id: issue.id }, data: { status: "CHAT", resolvedAt: null, agreedRefundEurCents: null, refundOfferEurCents: amount } });
      this.logger.warn(`Rimborso concordato non partito per ${bookingId}: ${(err as Error).message}`);
      throw new BadRequestException("Il rimborso non è partito: riprova tra qualche minuto.");
    }
    await this.notificationsService.notify(booking.professionalProfile.userId, "JOB_ISSUE_SETTLED", {
      bookingId,
      issueType: issue.type,
      guidedRequestId: booking.quote?.guidedRequestId,
      agreedRefundEurCents: amount,
      audience: "PROFESSIONAL",
    });
    if (booking.quote) {
      await this.timelineService.log(
        booking.quote.guidedRequestId,
        booking.professionalProfileId,
        "CLIENT",
        `Il cliente ha accettato il rimborso di ${formatEurCents(amount)}: la segnalazione è chiusa.`,
      );
    }
    return { bookingId, status: "RESOLVED" as const, agreedRefundEurCents: amount };
  }

  /** Il professionista risponde alla segnalazione con la sua versione, finché è in esame. */
  async respondToIssue(professionalUserId: string, bookingId: string, input: JobIssueResponseInput) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: { select: { userId: true } }, issue: true, quote: { select: { guidedRequestId: true } } },
    });
    if (!booking || booking.professionalProfile.userId !== professionalUserId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (!booking.issue) throw new NotFoundException("Nessuna segnalazione su questo lavoro.");
    if (booking.issue.status !== "OPEN" && booking.issue.status !== "CHAT") throw new BadRequestException("La segnalazione è già chiusa.");

    await this.prisma.jobIssue.update({
      where: { id: booking.issue.id },
      data: { professionalResponse: input.response.trim(), professionalRespondedAt: new Date() },
    });
    // In esame: ora c'è da decidere (§167).
    if (booking.issue.status === "OPEN") await this.jobIssueOutcomeService.notifyIssueAdmins("ADMIN_JOB_ISSUE_TO_REVIEW", { bookingId, issueType: booking.issue.type, stage: "VERSION" });
    if (booking.quote) {
      await this.timelineService.log(booking.quote.guidedRequestId, booking.professionalProfileId, "PROFESSIONAL", "Il professionista ha risposto alla segnalazione.");
    }
    return { bookingId };
  }

  /**
   * Il cliente elimina dalla propria lista "Lavori accettati" una
   * prenotazione il cui professionista ha eliminato l'account — richiesta
   * esplicita dell'utente, simmetrica a ProfessionalsService.deleteLead
   * (professionista che elimina una richiesta di un cliente eliminato).
   * Consentito solo se il professionista è soft-deleted (`deletedAt`), a
   * prescindere dallo stato della prenotazione — altrimenti resterebbe un
   * modo generico di far sparire prenotazioni scomode. Elimina la Booking
   * per intero (cascata su BookingFinalItem e sull'eventuale Review: quella
   * recensione viveva comunque su un profilo non più pubblico).
   */
  async deleteForClient(clientId: string, bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { professionalProfile: true },
    });
    if (!booking || booking.clientId !== clientId) {
      throw new ForbiddenException("Questa prenotazione non è tua.");
    }
    if (booking.professionalProfile.deletedAt === null) {
      throw new ForbiddenException("Puoi eliminare una prenotazione solo se l'account del professionista è stato eliminato.");
    }

    await this.prisma.booking.delete({ where: { id: bookingId } });
  }

  /** Prenotazioni del cliente autenticato, per proporre la recensione a lavoro completato. */
  async listForClient(clientId: string) {
    const bookings = await this.prisma.booking.findMany({
      where: { clientId },
      include: {
        professionalProfile: { include: { user: true } },
        review: true,
        finalItems: true,
        issue: true,
        jobPayment: true,
        // Richiesta esplicita dell'utente: "Lavori accettati" deve mostrare
        // anche i dati della richiesta guidata originale (titolo/categoria,
        // descrizione, foto) e del preventivo accettato (voci/note) — non
        // solo i dati del professionista. Assente per le prenotazioni
        // dirette da agenda pubblica (bookAgendaSlot), che non hanno una
        // Quote/GuidedRequest collegata.
        quote: { include: { items: true, guidedRequest: { include: { category: true } } } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    const now = new Date();
    const chatReplies = await this.jobIssueOutcomeService.proChatReplies(
      bookings
        .filter((b) => b.issue?.status === "CHAT")
        .map((b) => ({
          id: b.issue!.id,
          createdAt: b.issue!.createdAt,
          professionalRespondedAt: b.issue!.professionalRespondedAt,
          refundOfferedAt: b.issue!.refundOfferedAt,
          guidedRequestId: b.quote?.guidedRequestId ?? null,
          professionalProfileId: b.professionalProfileId,
        })),
    );
    return bookings.map((booking) => ({
      id: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
      // Segnalazione di un problema (docs/CHANGELOG.md §164): quella già
      // inviata, quali si possono inviare adesso, e se si può recensire.
      issue: toJobIssueSummary(booking.issue, {
        proRepliedAt: booking.issue ? chatReplies.get(booking.issue.id) : null,
        paidOnline: jobPaidOnline(booking.jobPayment),
        assisted: jobIssueAssisted(booking.jobPayment?.paymentMethod, booking.issue?.late),
      }),
      // Pagamento del lavoro (§168): metodo scelto, acconto, saldo, rimborsi.
      payment: toJobPaymentSummary(booking.jobPayment, booking.finalAmountEurCents),
      issueTypesAllowed: jobIssueLateAllowed({ ...booking, hasIssue: booking.issue !== null }, now)
        ? ["BAD_WORK" as const]
        : jobIssueTypesAllowed({ ...booking, hasIssue: booking.issue !== null }, now),
      // Dopo il termine si segnala ancora un lavoro non andato bene, senza rimborso.
      issueLate: jobIssueLateAllowed({ ...booking, hasIssue: booking.issue !== null }, now),
      canReview: clientCanReview({
        status: booking.status,
        clientConfirmedCompletedAt: booking.clientConfirmedCompletedAt,
        hasReview: booking.review !== null,
        issueStatus: booking.issue?.status ?? null,
      }),
      // Fine della fascia (richiesta esplicita dell'utente: mostrare tutta
      // la fascia oraria, non solo l'inizio) — null per prenotazioni senza
      // una fascia con fine nota (data indicata a mano, o create prima di
      // questa funzionalità).
      scheduledEndAt: booking.scheduledEndAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      businessName: booking.professionalProfile.businessName,
      // Foto profilo accanto al nome nella scheda della richiesta (richiesta
      // esplicita dell'utente). Mai per un profilo eliminato.
      professionalImageUrl: booking.professionalProfile.deletedAt ? null : booking.professionalProfile.imageUrl,
      professionalProfileId: booking.professionalProfileId,
      // Richiesta guidata di origine, per il bottone "Vai alla cronologia
      // della richiesta" (richiesta esplicita dell'utente) — null per le
      // prenotazioni dirette da agenda pubblica.
      guidedRequestId: booking.quote?.guidedRequestId ?? null,
      hasReview: booking.review !== null,
      // Recensione aggiornabile una volta dopo una segnalazione a lavoro chiuso senza accordo.
      canUpdateReview: clientCanUpdateReview({
        hasReview: booking.review !== null,
        reviewUpdatedAt: booking.review?.updatedAfterIssueAt ?? null,
        issue: booking.issue,
      }),
      myReview: booking.review
        ? { id: booking.review.id, rating: booking.review.rating, comment: booking.review.comment, photoUrls: booking.review.photoUrls }
        : null,
      // Titolo/categoria, descrizione e foto della richiesta guidata
      // originale — richiesta esplicita dell'utente ("i dati del
      // preventivo da lui inviato all'inizio come la descrizione
      // dell'evento con il titolo, le foto"). `null`/`[]` per le
      // prenotazioni dirette da agenda pubblica, senza GuidedRequest.
      categorySlug: booking.quote?.guidedRequest.category.slug ?? null,
      categoryLabel: booking.quote?.guidedRequest.category.label ?? null,
      description: booking.quote?.guidedRequest.description ?? null,
      photoUrls: booking.quote?.guidedRequest.photoUrls ?? [],
      // Voci e note del preventivo accettato (il range concordato prima
      // dell'importo finale esatto, quest'ultimo in finalItems sopra).
      quoteItems: (booking.quote?.items ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        priceMinEurCents: item.priceMinEurCents,
        priceMaxEurCents: item.priceMaxEurCents,
      })),
      quoteNotes: booking.quote?.notes ?? null,
      // Importo finale esatto (voci del preventivo + eventuali extra),
      // valorizzato solo dopo che il professionista ha segnalato il lavoro
      // come terminato — richiesta esplicita dell'utente.
      finalAmountEurCents: booking.finalAmountEurCents,
      finalItems: booking.finalItems.map((item) => ({ id: item.id, name: item.name, priceEurCents: item.priceEurCents })),
      // Motivo dell'importo diverso dal preventivo: lo legge anche il cliente (richiesta esplicita dell'utente).
      completionChangeReason: booking.completionChangeReason,
      // Nota lasciata dal professionista se ha annullato l'intervento (facoltativa).
      cancellationNote: booking.cancellationNote,
      // Chi ha annullato — richiesta esplicita dell'utente, mostrato accanto
      // all'etichetta "Annullata".
      canceledBy: booking.canceledBy,
      // Richiesta di riaprire un appuntamento annullato, in attesa della risposta (collaudo F-08).
      reopenRequestedBy: booking.status === "CANCELED" && booking.reopenRequestedAt ? (booking.reopenRequestedBy === "PROFESSIONAL" ? ("PROFESSIONAL" as const) : ("CLIENT" as const)) : null,
      // Dati di contatto del professionista, per il popup "Non presentato"
      // (contatta oppure chiedi il rimborso) — richiesta esplicita
      // dell'utente, visibili solo qui, non prima nel ciclo di vita.
      // Mai l'email anonimizzata sintetica quando l'account è stato
      // eliminato — stesso motivo di clientEmail in getMyLeads/getMyBookings.
      professionalPhone: booking.professionalProfile.user.phone,
      professionalEmail: booking.professionalProfile.deletedAt ? null : booking.professionalProfile.user.email,
      professionalAddress: booking.professionalProfile.address,
      refundRequested: booking.refundRequested,
      // Link della consulenza video (Meet/Zoom/ecc.), impostato dal
      // professionista — richiesta esplicita dell'utente.
      meetingLink: booking.meetingLink,
      // Il professionista ha eliminato l'account (soft-delete, simmetrico a
      // clientAccountDeleted lato professionista) — richiesta esplicita
      // dell'utente: "Lavori accettati" deve segnalarlo e offrire
      // l'eliminazione della prenotazione dalla propria lista.
      professionalAccountDeleted: booking.professionalProfile.deletedAt !== null,
      clientConfirmedCompletedAt: booking.clientConfirmedCompletedAt?.toISOString() ?? null,
      // "Sto arrivando" del professionista, mostrato in cima alla scheda (docs/CHANGELOG.md §346).
      onTheWayAt: booking.onTheWayAt?.toISOString() ?? null,
      // Preavviso per annullare valido per questo lavoro (docs/CHANGELOG.md §347): 24 ore per i lavori di prima.
      cancellationNoticeHours: booking.cancellationNoticeHours ?? DEFAULT_CANCELLATION_NOTICE_HOURS,
      lateCancelKeepsDeposit: booking.quote?.lateCancelKeepsDeposit ?? false,
      // Altra data proposta sul preventivo accettato, in attesa del professionista.
      dateChange: bookingDateChange(booking, booking.quote),
      professionalCompletionPhotoUrls: booking.professionalCompletionPhotoUrls,
      clientCompletionPhotoUrls: booking.clientCompletionPhotoUrls,
    }));
  }
}

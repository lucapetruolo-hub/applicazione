import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  SUBSCRIPTION_TIERS,
  TRIAL_DAYS,
  subscriptionTierInfo,
  upgradeFeeEurCents,
  type BillingInterval,
  type SubscriptionTier,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { InvoicesService } from "../accounting/invoices.service";
import { hasLaunched, launchDate, subscriptionState, tierOfPlan, trialDaysOf, trialEndFor } from "../subscriptions/subscription-rules";
import { BookingsService } from "../bookings/bookings.service";
import { JobPaymentsService } from "../job-payments/job-payments.service";
import { EUR_ONLY } from "../job-payments/online-money.service";
import { ProfessionalFiscalService } from "../professional-fiscal/professional-fiscal.service";

// Prezzi dei pacchetti di visibilità (CLAUDE.md §6): boost locale a canone,
// badge reputazione e storia di successo come acquisto singolo. Validità 30
// giorni per semplicità nell'MVP, prima di introdurre un ciclo di rinnovo.
const BOOST_PRICES_EUR_CENTS: Record<string, number> = {
  BOOST_LOCALE: 1990,
  BADGE_REPUTAZIONE: 990,
  STORIA_SUCCESSO: 4990,
};
const BOOST_DURATION_DAYS = 30;

// Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161, §361):
// un prezzo Stripe mensile e uno annuale per livello, IVA esclusa.
const SUBSCRIPTION_PRICE_ENV: Record<SubscriptionTier, Record<BillingInterval, string>> = {
  BASE: { MONTH: "STRIPE_PRICE_BASE", YEAR: "STRIPE_PRICE_BASE_ANNUAL" },
  PLUS: { MONTH: "STRIPE_PRICE_PLUS", YEAR: "STRIPE_PRICE_PLUS_ANNUAL" },
  PRO: { MONTH: "STRIPE_PRICE_PRO", YEAR: "STRIPE_PRICE_PRO_ANNUAL" },
};
// Aliquota IVA del 22% creata su Stripe (Tax rate, esclusa dal prezzo): si
// aggiunge a canone e quote di passaggio, che sul sito sono "+ IVA" (§361).
const TAX_RATE_ENV = "STRIPE_TAX_RATE_IVA";
// Stripe accetta un `trial_end` solo almeno 48 ore nel futuro.
const MIN_TRIAL_END_MS = 48 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// "Torna a Base" si fa poco prima della scadenza, prima che Stripe rinnovi il livello pagato.
const RETURN_TO_BASE_LEAD_MS = 20 * 60 * 1000;

function tierRank(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS.findIndex((t) => t.tier === tier);
}

/** Stato Stripe → stato locale; null = lascia com'è (pagamento iniziale in corso). */
function localStatus(status: Stripe.Subscription.Status): "ACTIVE" | "PAST_DUE" | "CANCELED" | null {
  if (status === "active" || status === "trialing") return "ACTIVE";
  if (status === "past_due" || status === "unpaid") return "PAST_DUE";
  if (status === "canceled" || status === "incomplete_expired") return "CANCELED";
  return null;
}

/** Id dell'abbonamento di una fattura (API Stripe recente: `parent.subscription_details`). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const ref = invoice.parent?.subscription_details?.subscription;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly bookingsService: BookingsService,
    private readonly professionalFiscalService: ProfessionalFiscalService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly invoicesService: InvoicesService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException(
        "I pagamenti non sono ancora configurati su questo ambiente. Aggiungi STRIPE_SECRET_KEY per attivarli.",
      );
    }
    return this.stripe;
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  private async requireMyProfile(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, include: { user: true } });
    if (!profile) {
      throw new NotFoundException("Completa prima il tuo profilo professionista.");
    }
    return profile;
  }

  /**
   * Cliente Stripe del professionista, creato una volta e poi riusato per
   * abbonamento, differenze di livello e boost (docs/CHANGELOG.md §238):
   * così carta, fatture e Customer Portal stanno in un posto solo. Chi aveva
   * già un abbonamento riprende il cliente di quell'abbonamento.
   */
  private async ensureCustomer(stripe: Stripe, profile: { id: string; businessName: string; stripeCustomerId: string | null; user: { email: string | null } }): Promise<string> {
    if (profile.stripeCustomerId) return profile.stripeCustomerId;
    const current = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id }, select: { stripeSubscriptionId: true } });
    let customerId: string | null = null;
    if (current?.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(current.stripeSubscriptionId).catch(() => null);
      if (subscription) customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    }
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: profile.user.email ?? undefined,
          name: profile.businessName,
          preferred_locales: ["it"],
          metadata: { professionalProfileId: profile.id },
        },
        { idempotencyKey: `professional-customer-${profile.id}` },
      );
      customerId = customer.id;
    }
    // Update condizionato: con due richieste insieme vince la prima e l'altra rilegge.
    const saved = await this.prisma.professionalProfile.updateMany({ where: { id: profile.id, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
    if (saved.count === 0) {
      const fresh = await this.prisma.professionalProfile.findUnique({ where: { id: profile.id }, select: { stripeCustomerId: true } });
      if (fresh?.stripeCustomerId) return fresh.stripeCustomerId;
    }
    return customerId;
  }

  /**
   * Customer Portal di Stripe (docs/CHANGELOG.md §238): il professionista
   * cambia la carta e scarica le fatture di abbonamento e boost. Livelli e
   * annullamento restano nella pagina Abbonamento del sito.
   */
  async createBillingPortal(userId: string): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);
    const customer = await this.ensureCustomer(stripe, profile);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      locale: "it",
      return_url: `${this.frontendUrl()}/dashboard/abbonamento`,
    });
    return { url: session.url };
  }

  private priceOf(priceId: string | undefined): { tier: SubscriptionTier; interval: BillingInterval } | null {
    if (!priceId) return null;
    for (const tier of Object.keys(SUBSCRIPTION_PRICE_ENV) as SubscriptionTier[]) {
      for (const interval of ["MONTH", "YEAR"] as const) {
        if (process.env[SUBSCRIPTION_PRICE_ENV[tier][interval]] === priceId) return { tier, interval };
      }
    }
    return null;
  }

  private requirePrice(plan: SubscriptionTier, interval: BillingInterval): string {
    const env = SUBSCRIPTION_PRICE_ENV[plan][interval];
    const priceId = process.env[env];
    if (!priceId) {
      throw new BadRequestException(`Prezzo Stripe non configurato per il livello ${plan} (${env}).`);
    }
    return priceId;
  }

  /** IVA da aggiungere: senza aliquota configurata non si incassa, perché i prezzi mostrati sono "+ IVA". */
  private requireTaxRates(): string[] {
    const taxRate = process.env[TAX_RATE_ENV];
    if (!taxRate) throw new BadRequestException(`Aliquota IVA Stripe non configurata (${TAX_RATE_ENV}).`);
    return [taxRate];
  }

  /** Riporta sulla riga locale lo stato di un abbonamento Stripe. */
  private async syncStripeSubscription(subscription: Stripe.Subscription): Promise<void> {
    const item = subscription.items.data[0];
    const price = this.priceOf(item?.price?.id);
    await this.subscriptionsService.applyStripeSubscription({
      professionalProfileId: subscription.metadata?.professionalProfileId ?? null,
      stripeSubscriptionId: subscription.id,
      status: localStatus(subscription.status),
      tier: price?.tier ?? null,
      interval: price?.interval ?? null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
      currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      stripeTrialEnd: subscription.status === "trialing" && subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    });
  }

  /**
   * Scelta o cambio di livello (docs/CHANGELOG.md §162, §361; mesi gratis
   * decisi da Luca il 29/10/2026, docs/changelog/2026-10-29-offerta-mesi-gratis.md).
   * Restituisce l'URL di una pagina di pagamento Stripe, oppure `url: null`
   * se il cambio è già fatto (addebito sulla carta salvata). Prezzi IVA
   * esclusa, l'IVA si aggiunge con l'aliquota di `STRIPE_TAX_RATE_IVA`. Per
   * ora solo il mensile (Luca: "per valutare con dati reali").
   * - Base nei mesi gratis ("Attiva i mesi gratis"): la carta si dà subito e
   *   il primo canone parte alla fine dei mesi gratis. Lo stesso per chi
   *   torna a Base con mesi gratis in attesa.
   * - Plus o Pro nei mesi gratis: si paga subito il mese del livello meno il
   *   mese Base regalato; da oggi parte un mese nuovo con 0 lavori e i mesi
   *   gratis rimasti aspettano il ritorno a Base. Prima del lancio no: non ci
   *   sono limiti di lavori.
   * - Abbonamento pagato, livello superiore: quota di passaggio (10 € più la
   *   differenza per i giorni che mancano al rinnovo, maggiorata del 10%)
   *   addebitata subito, poi il nuovo livello fino al rinnovo e oltre.
   * - Livello inferiore: "Torna a Base" alla scadenza (`setReturnToBase`).
   */
  async createSubscriptionCheckout(userId: string, plan: SubscriptionTier): Promise<{ url: string | null }> {
    const interval: BillingInterval = "MONTH";
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);
    const now = new Date();
    const current = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const state = subscriptionState(current, now);
    const launch = launchDate();
    const launched = hasLaunched(now, launch);

    if (current?.stripeSubscriptionId && (state === "ACTIVE" || state === "PAST_DUE")) {
      return this.upgradeTier(stripe, profile.id, current.stripeSubscriptionId, tierOfPlan(current.plan), plan, launched);
    }
    // Prima del lancio non c'è limite di lavori: si dà solo la carta per i mesi gratis.
    if (!launched && plan !== "BASE") {
      throw new BadRequestException("Plus e Pro si scelgono dal giorno del lancio: fino ad allora non c'è limite di lavori.");
    }
    const priceId = this.requirePrice(plan, interval);
    const taxRates = this.requireTaxRates();

    // Fine dei giorni gratis. Come la pagina Abbonamento (`waitingLaunch` in
    // getMySubscription): prima del lancio, anche senza LAUNCH_DATE, non si
    // paga niente (collaudo del 29/10/2026). Con mesi in attesa (dopo Plus o
    // Pro, abbonamento concluso) ripartono da oggi tornando a Base.
    const preLaunchTrial = current?.status === "TRIALING" && !launched;
    const freeEnd =
      plan !== "BASE"
        ? null
        : state === "TRIAL" || preLaunchTrial
          ? preLaunchTrial && launch
            ? trialEndFor(now, launch, trialDaysOf(current))
            : (current?.trialEndsAt ?? null)
          : current && current.freeMonthsWaiting > 0
            ? new Date(now.getTime() + current.freeMonthsWaiting * TRIAL_DAYS * DAY_MS)
            : null;
    // Senza data di lancio la fine dei mesi gratis non è sicura: la carta si dà quando è fissata.
    if (preLaunchTrial && !launch) {
      throw new BadRequestException("La data del lancio non è ancora fissata: potrai attivare i mesi gratis appena lo sarà.");
    }
    const trialEnd = freeEnd && freeEnd.getTime() - now.getTime() > MIN_TRIAL_END_MS ? Math.floor(freeEnd.getTime() / 1000) : undefined;
    // Plus o Pro mentre scorrono i mesi gratis: il mese Base regalato si toglie dal primo mese.
    const freeRunning = state === "TRIAL" && current?.trialEndsAt && current.trialEndsAt.getTime() > now.getTime();
    const discount = plan !== "BASE" && freeRunning ? [{ coupon: await this.freeBaseMonthCoupon(stripe) }] : [];

    // Nessun `invoice_creation` qui: per le Checkout Session in modalità
    // `subscription` Stripe genera già da sola una fattura reale a ogni
    // ciclo di fatturazione. Il professionista la riceve via email Stripe e
    // la scarica dal Customer Portal.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...EUR_ONLY,
      line_items: [{ price: priceId, quantity: 1 }],
      ...(discount.length ? { discounts: discount } : {}),
      subscription_data: {
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        default_tax_rates: taxRates,
        metadata: { professionalProfileId: profile.id },
      },
      customer: await this.ensureCustomer(stripe, profile),
      // Ritorno con il messaggio giusto: carta salvata a 0 € o pagamento fatto; finestra chiusa a metà.
      success_url: `${this.frontendUrl()}/dashboard/abbonamento?attivato=${trialEnd ? "carta" : "1"}`,
      cancel_url: `${this.frontendUrl()}/dashboard/abbonamento?annullato=1#livelli`,
      metadata: { kind: "subscription", professionalProfileId: profile.id, plan, interval },
    });

    return { url: session.url };
  }

  /**
   * Coupon Stripe "mese Base regalato" (una volta, IVA esclusa), creato al
   * primo uso con un id fisso: si toglie dal primo mese di Plus o Pro scelto
   * durante i mesi gratis.
   */
  private async freeBaseMonthCoupon(stripe: Stripe): Promise<string> {
    const amount = subscriptionTierInfo("BASE").priceEurCents;
    const id = `mese-base-gratis-${amount}`;
    try {
      await stripe.coupons.retrieve(id);
    } catch (error) {
      if (!(error instanceof Stripe.errors.StripeInvalidRequestError) || error.statusCode !== 404) throw error;
      await stripe.coupons.create({ id, amount_off: amount, currency: "eur", duration: "once", name: "Mese Base gratis" });
    }
    return id;
  }

  private async upgradeTier(
    stripe: Stripe,
    professionalProfileId: string,
    stripeSubscriptionId: string,
    currentTier: SubscriptionTier | null,
    plan: SubscriptionTier,
    launched: boolean,
  ): Promise<{ url: string | null }> {
    if (currentTier === plan) throw new BadRequestException("È già il tuo livello.");
    if (currentTier && tierRank(plan) < tierRank(currentTier)) {
      throw new BadRequestException("Per tornare a Base usa \"Torna a Base\": vale dalla scadenza del mese pagato.");
    }
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new BadRequestException("Abbonamento Stripe senza voci: contattaci.");
    const interval = this.priceOf(item.price?.id)?.interval ?? "MONTH";
    const priceId = this.requirePrice(plan, interval);
    const taxRates = this.requireTaxRates();
    const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const now = new Date();

    // Carta data e mesi gratis in corso: finisce la prova di Stripe adesso e
    // si paga subito il mese del nuovo livello meno il mese Base regalato.
    // Se la carta non passa non cambia niente.
    if (subscription.status === "trialing") {
      if (!launched) throw new BadRequestException("Plus e Pro si scelgono dal giorno del lancio: fino ad allora non c'è limite di lavori.");
      try {
        const updated = await stripe.subscriptions.update(subscription.id, {
          items: [{ id: item.id, price: priceId }],
          trial_end: "now",
          proration_behavior: "none",
          discounts: [{ coupon: await this.freeBaseMonthCoupon(stripe) }],
          payment_behavior: "error_if_incomplete",
          cancel_at_period_end: false,
        });
        await this.syncStripeSubscription(updated);
      } catch (error) {
        if (error instanceof Stripe.errors.StripeCardError) {
          throw new BadRequestException("Il pagamento non è andato a buon fine: controlla la carta e riprova.");
        }
        throw error;
      }
      return { url: null };
    }

    // Abbonamento pagato: quota di passaggio su una fattura a parte, pagata
    // subito con la carta dell'abbonamento; solo a pagamento riuscito si
    // cambia livello, senza altri conguagli di Stripe.
    const periodEnd = item.current_period_end * 1000;
    const periodStart = item.current_period_start * 1000;
    const fee = upgradeFeeEurCents({ from: currentTier ?? "BASE", to: plan, interval, remainingMs: periodEnd - now.getTime(), periodMs: periodEnd - periodStart });
    if (fee > 0) {
      const invoice = await stripe.invoices.create(
        {
          customer,
          collection_method: "charge_automatically",
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
          default_tax_rates: taxRates,
          description: `Passaggio al livello ${subscriptionTierInfo(plan).label} fino al rinnovo`,
          metadata: { kind: "tier_upgrade_fee", professionalProfileId, stripeSubscriptionId, plan },
        },
        { idempotencyKey: `tier-upgrade-${stripeSubscriptionId}-${plan}-${item.current_period_end}` },
      );
      await stripe.invoiceItems.create({
        customer,
        invoice: invoice.id,
        amount: fee,
        currency: "eur",
        description: `Passaggio al livello ${subscriptionTierInfo(plan).label} fino al rinnovo`,
      });
      const paymentMethod = typeof subscription.default_payment_method === "string" ? subscription.default_payment_method : subscription.default_payment_method?.id;
      try {
        const paid = await stripe.invoices.pay(invoice.id!, { off_session: true, ...(paymentMethod ? { payment_method: paymentMethod } : {}) });
        await this.prisma.payment.create({
          data: { professionalProfileId, type: "SUBSCRIPTION", amountEurCents: paid.amount_paid, status: "SUCCEEDED" },
        });
      } catch (error) {
        await stripe.invoices.voidInvoice(invoice.id!).catch(() => undefined);
        if (error instanceof Stripe.errors.StripeCardError || error instanceof Stripe.errors.StripeInvalidRequestError) {
          throw new BadRequestException("Il pagamento della quota di passaggio non è andato a buon fine: controlla la carta e riprova.");
        }
        throw error;
      }
    }
    return this.switchPrice(stripe, subscription.id, item.id, priceId);
  }

  /** Nuovo livello sull'abbonamento Stripe, senza conguagli (la quota è già pagata). */
  private async switchPrice(stripe: Stripe, stripeSubscriptionId: string, itemId: string, priceId: string): Promise<{ url: null }> {
    const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "none",
      cancel_at_period_end: false,
    });
    await this.syncStripeSubscription(updated);
    return { url: null };
  }

  /** Annulla il rinnovo automatico: l'abbonamento resta attivo fino alla scadenza già pagata. */
  async setCancelAtPeriodEnd(userId: string, cancel: boolean): Promise<{ ok: true }> {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);
    const current = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const state = subscriptionState(current, new Date());
    if (!current?.stripeSubscriptionId || (state !== "ACTIVE" && state !== "PAST_DUE")) {
      throw new BadRequestException("Non hai un abbonamento attivo da " + (cancel ? "annullare." : "riattivare."));
    }
    const updated = await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: cancel });
    await this.syncStripeSubscription(updated);
    return { ok: true };
  }

  /**
   * "Torna a Base" da Plus o Pro (decisione di Luca del 29/10/2026,
   * docs/changelog/2026-10-29-offerta-mesi-gratis.md): il livello pagato
   * resta fino alla scadenza, poi riparte Base con i mesi gratis in attesa
   * (se ce ne sono) e infine Base mensile. Il rinnovo automatico resta acceso.
   */
  async setReturnToBase(userId: string, on: boolean): Promise<{ ok: true }> {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);
    const current = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const state = subscriptionState(current, new Date());
    const tier = current ? tierOfPlan(current.plan) : null;
    if (!current?.stripeSubscriptionId || (state !== "ACTIVE" && state !== "PAST_DUE") || !tier || tier === "BASE") {
      throw new BadRequestException("Torna a Base vale solo con Plus o Pro attivo.");
    }
    if (on && current.cancelAtPeriodEnd) {
      await this.syncStripeSubscription(await stripe.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: false }));
    }
    await this.prisma.subscription.update({ where: { id: current.id }, data: { returnToBaseAt: on ? new Date() : null } });
    return { ok: true };
  }

  /**
   * Ogni 10 minuti: chi ha chiesto "Torna a Base" passa a Base poco prima
   * della scadenza del mese pagato, così Stripe non rinnova Plus o Pro. Con
   * mesi gratis in attesa Base parte con quei mesi di prova da adesso (e il
   * periodo dei lavori riparte da 0), altrimenti al rinnovo paga Base.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runReturnToBase(now = new Date()): Promise<void> {
    if (!this.stripe) return;
    const rows = await this.prisma.subscription.findMany({
      where: {
        returnToBaseAt: { not: null },
        status: { in: ["ACTIVE", "PAST_DUE"] },
        stripeSubscriptionId: { not: null },
        currentPeriodEnd: { lte: new Date(now.getTime() + RETURN_TO_BASE_LEAD_MS) },
      },
    });
    for (const row of rows) {
      try {
        const subscription = await this.stripe.subscriptions.retrieve(row.stripeSubscriptionId!);
        const item = subscription.items.data[0];
        if (!item || subscription.status === "canceled") {
          await this.prisma.subscription.update({ where: { id: row.id }, data: { returnToBaseAt: null } });
          continue;
        }
        const waiting = row.freeMonthsWaiting;
        const trialEnd = waiting > 0 ? Math.floor((now.getTime() + waiting * TRIAL_DAYS * DAY_MS) / 1000) : undefined;
        const updated = await this.stripe.subscriptions.update(
          subscription.id,
          {
            items: [{ id: item.id, price: this.requirePrice("BASE", "MONTH") }],
            proration_behavior: "none",
            cancel_at_period_end: false,
            ...(trialEnd ? { trial_end: trialEnd } : {}),
          },
          { idempotencyKey: `return-to-base-${row.id}-${row.returnToBaseAt!.getTime()}` },
        );
        await this.prisma.subscription.update({ where: { id: row.id }, data: { returnToBaseAt: null } });
        await this.syncStripeSubscription(updated);
      } catch (error) {
        this.logger.error(`Ritorno a Base non riuscito per ${row.id}`, error as Error);
      }
    }
  }

  async createBoostCheckout(userId: string, boostType: string) {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);

    const priceEurCents = BOOST_PRICES_EUR_CENTS[boostType];
    if (!priceEurCents) {
      throw new BadRequestException("Tipo di pacchetto visibilità non valido.");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ...EUR_ONLY,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: priceEurCents,
            product_data: { name: `Pacchetto visibilità: ${boostType}` },
          },
          quantity: 1,
        },
      ],
      customer: await this.ensureCustomer(stripe, profile),
      success_url: `${this.frontendUrl()}/dashboard?boost=attivato`,
      cancel_url: `${this.frontendUrl()}/dashboard`,
      metadata: { kind: "boost", boostType, professionalProfileId: profile.id },
      // Niente fattura di Stripe: la fattura elettronica la emettiamo noi al
      // pagamento (docs/CHANGELOG.md §378), una ricevuta di Stripe in più
      // sembrerebbe un secondo documento fiscale.
    });

    return { url: session.url };
  }

  /**
   * Verifica la firma Stripe e applica gli effetti dell'evento una sola volta
   * per event.id (docs/CHANGELOG.md §170): l'evento viene prenotato in
   * `stripe_webhook_events` prima di toccare i dati.
   * - già elaborato → risposta 200 senza rifare nulla;
   * - in lavorazione (consegna doppia contemporanea) → 409, Stripe riprova più tardi;
   * - errore durante l'elaborazione → prenotazione cancellata, così il nuovo tentativo di Stripe la rifà.
   */
  async handleWebhookEvent(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestException("STRIPE_WEBHOOK_SECRET non configurato.");
    }

    const event = this.verifiedEvent(stripe, rawBody, signature, webhookSecret);

    try {
      await this.prisma.stripeWebhookEvent.create({ data: { id: event.id, type: event.type } });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      const existing = await this.prisma.stripeWebhookEvent.findUnique({ where: { id: event.id } });
      if (existing?.processedAt) return { received: true, duplicate: true };
      throw new ConflictException("Evento Stripe già in lavorazione.");
    }

    try {
      await this.applyWebhookEvent(stripe, event);
    } catch (err) {
      await this.prisma.stripeWebhookEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      throw err;
    }
    await this.prisma.stripeWebhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
    return { received: true };
  }

  /**
   * Due endpoint Stripe arrivano qui (docs/CHANGELOG.md §236), ognuno con la
   * sua chiave di firma: quello del nostro account (`STRIPE_WEBHOOK_SECRET`)
   * e quello Connect per gli eventi degli account dei professionisti, come
   * `account.updated` (`STRIPE_CONNECT_WEBHOOK_SECRET`). Firma non valida → 400.
   */
  private verifiedEvent(stripe: Stripe, rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    const secrets = [webhookSecret, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((secret): secret is string => Boolean(secret));
    for (const secret of secrets) {
      try {
        return stripe.webhooks.constructEvent(rawBody, signature, secret);
      } catch (err) {
        if (!(err instanceof Stripe.errors.StripeSignatureVerificationError)) throw err;
      }
    }
    throw new BadRequestException("Firma Stripe non valida.");
  }

  private async applyWebhookEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
    // Con i metodi di pagamento lenti (addebito SEPA, bonifico) il Checkout si
    // chiude prima che i soldi arrivino (`payment_status: "unpaid"`): si
    // attiva solo a pagamento riuscito, con `async_payment_succeeded`.
    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      this.logger.warn(`Pagamento non riuscito per il Checkout ${session.id} (${session.metadata?.kind ?? "?"}).`);
      return;
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "unpaid") return;
      const metadata = session.metadata ?? {};

      if (metadata.kind === "subscription" && metadata.professionalProfileId && metadata.plan) {
        const billingInterval = metadata.interval === "YEAR" ? "YEAR" : "MONTH";
        await this.prisma.subscription.upsert({
          where: { professionalProfileId: metadata.professionalProfileId },
          update: {
            plan: metadata.plan as SubscriptionTier,
            status: "ACTIVE",
            billingInterval,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
          create: {
            professionalProfileId: metadata.professionalProfileId,
            plan: metadata.plan as SubscriptionTier,
            status: "ACTIVE",
            billingInterval,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
        });
        if (typeof session.subscription === "string") {
          await this.syncStripeSubscription(await stripe.subscriptions.retrieve(session.subscription));
        }
        await this.prisma.payment.create({
          data: {
            professionalProfileId: metadata.professionalProfileId,
            type: "SUBSCRIPTION",
            amountEurCents: session.amount_total ?? 0,
            status: "SUCCEEDED",
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
      }

      // Quota pagata per un livello superiore durante il periodo gratuito
      // (docs/CHANGELOG.md §162, §361): il nuovo prezzo vale dal primo rinnovo,
      // con il rinnovo già scelto (mensile o annuale).
      if (metadata.kind === "tier_upgrade" && metadata.professionalProfileId && metadata.stripeSubscriptionId && metadata.plan) {
        const subscription = await stripe.subscriptions.retrieve(metadata.stripeSubscriptionId);
        const item = subscription.items.data[0];
        if (item) {
          const interval = metadata.interval === "YEAR" ? "YEAR" : (this.priceOf(item.price?.id)?.interval ?? "MONTH");
          await this.switchPrice(stripe, subscription.id, item.id, this.requirePrice(metadata.plan as SubscriptionTier, interval));
        }
        await this.prisma.payment.create({
          data: {
            professionalProfileId: metadata.professionalProfileId,
            type: "SUBSCRIPTION",
            amountEurCents: session.amount_total ?? 0,
            status: "SUCCEEDED",
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
      }

      // Pagamento del lavoro (acconto o saldo, docs/CHANGELOG.md §168) —
      // distinto dai casi sopra, dove è il professionista che paga Manovia:
      // qui il cliente paga il lavoro, i soldi restano bloccati sul conto
      // Stripe del professionista e la commissione è la trattenuta (§249).
      if (metadata.kind === "quote_deposit") {
        await this.bookingsService.confirmQuoteDeposit(session);
      }
      if (metadata.kind === "job_payment") {
        await this.jobPaymentsService.handleManoviaCheckoutCompleted(session);
      }

      if (metadata.kind === "boost" && metadata.professionalProfileId && metadata.boostType) {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + BOOST_DURATION_DAYS);
        await this.prisma.visibilityBoost.create({
          data: {
            professionalProfileId: metadata.professionalProfileId,
            type: metadata.boostType as "BOOST_LOCALE" | "BADGE_REPUTAZIONE" | "STORIA_SUCCESSO",
            status: "ACTIVE",
            endsAt,
            stripePaymentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
        await this.prisma.payment.create({
          data: {
            professionalProfileId: metadata.professionalProfileId,
            type: "VISIBILITY_BOOST",
            amountEurCents: session.amount_total ?? 0,
            status: "SUCCEEDED",
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
        await this.invoicesService.issueForBoostCheckout(session, metadata.professionalProfileId, `Pacchetto di visibilità ${metadata.boostType}, ${BOOST_DURATION_DAYS} giorni`);
      }
    }

    // Sincronizza lo stato di onboarding Stripe Connect (CLAUDE.md §88):
    // Stripe emette questo evento ad ogni cambiamento di requirements/
    // charges_enabled/payouts_enabled durante e dopo l'onboarding guidato.
    // Arriva dall'endpoint Connect. Lo stato vero si rilegge con le API
    // Accounts v2 (trasferimenti attivi), non dai vecchi campi v1.
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      await this.professionalFiscalService.refreshStripeConnectStatus(account.id);
      // Dati bancari sistemati dopo un bonifico non riuscito: si riprova subito (§249).
      await this.jobPaymentsService.retryPayoutsForAccount(account.id);
    }

    // Il professionista ha aggiunto o cambiato il conto bancario su Stripe
    // (§249): si rilegge lo stato del conto e si riprovano i bonifici in sospeso.
    if ((event.type === "account.external_account.created" || event.type === "account.external_account.updated") && event.account) {
      await this.professionalFiscalService.refreshStripeConnectStatus(event.account);
      await this.jobPaymentsService.retryPayoutsForAccount(event.account);
    }

    // Bonifico dal conto Stripe del professionista alla sua banca (docs/CHANGELOG.md
    // §249): arriva dall'endpoint Connect, come `account.updated`.
    if (event.type === "payout.paid" || event.type === "payout.failed" || event.type === "payout.canceled") {
      await this.jobPaymentsService.handlePayoutEvent(event.data.object as Stripe.Payout);
    }

    // Soldi del professionista diventati disponibili su Stripe (docs/CHANGELOG.md
    // §249): i bonifici già sbloccati partono subito invece che al giro orario.
    // I bonifici non riusciti aspettano invece che sistemi i dati bancari.
    if (event.type === "balance.available" && event.account) {
      await this.jobPaymentsService.retryPayoutsForAccount(event.account, { skipFailed: true });
    }

    // Contestazione in banca (chargeback, docs/CHANGELOG.md §236).
    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      const jobPayment = await this.jobPaymentsService.handleStripeDispute(dispute);
      // Pagamento di un lavoro (sta sul conto del professionista) non ancora
      // registrato: la contestazione è arrivata prima della conferma del
      // pagamento. Errore, così Stripe rimanda l'avviso più tardi.
      if (!jobPayment && event.account) throw new ServiceUnavailableException("Contestazione su un pagamento non ancora registrato: riprovare più tardi.");
      // Abbonamento o pacchetto di visibilità contestato: solo avviso al team.
      if (!jobPayment && (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed")) {
        await this.jobPaymentsService.notifyFinanceAdmins("ADMIN_STRIPE_DISPUTE", { amountEurCents: dispute.amount, status: dispute.status, bookingId: null });
      }
    }
    // Rimborso rimasto in attesa di fondi sul conto del professionista,
    // arrivato al cliente o non riuscito (§269): dall'endpoint Connect.
    if (event.type === "refund.updated" || event.type === "refund.failed") {
      await this.jobPaymentsService.handleRefundUpdated(event.data.object as Stripe.Refund, event.account);
    }
    // Saldo addebitato sulla carta salvata con l'acconto (§267).
    if (event.type === "payment_intent.succeeded") {
      await this.jobPaymentsService.handleAutoBalanceSucceeded(event.data.object as Stripe.PaymentIntent);
    }
    // Cifra contestata tolta dal nostro conto o restituita (§267): si riprende
    // subito dai soldi bloccati del professionista e gli torna se si vince.
    if (event.type === "charge.dispute.funds_withdrawn" || event.type === "charge.dispute.funds_reinstated") {
      const handled = await this.jobPaymentsService.handleStripeDisputeFunds(event.data.object as Stripe.Dispute, event.type === "charge.dispute.funds_withdrawn" ? "withdrawn" : "reinstated");
      if (!handled && event.account) throw new ServiceUnavailableException("Contestazione su un pagamento non ancora registrato: riprovare più tardi.");
    }

    // Ciclo di vita dell'abbonamento (docs/CHANGELOG.md §161-§162): rinnovo
    // pagato o non riuscito, cambio di livello, annullamento, fine.
    if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
      // Abbonamento, rinnovo o quota di passaggio pagati: la nostra fattura (§378).
      if (event.type === "invoice.paid") await this.invoicesService.issueForStripeInvoice(invoice, (priceId) => this.priceOf(priceId));
      const stripeSubscriptionId = invoiceSubscriptionId(invoice);
      if (stripeSubscriptionId) {
        const renewal = invoice.billing_reason === "subscription_cycle";
        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        await this.subscriptionsService.onInvoice(stripeSubscriptionId, {
          paid: event.type === "invoice.paid",
          renewal,
          amountEurCents: invoice.amount_paid ?? 0,
          nextPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        });
        const subscriptionRow = renewal && event.type === "invoice.paid" && invoice.amount_paid > 0
          ? await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId } })
          : null;
        if (subscriptionRow) {
          await this.prisma.payment.create({
            data: {
              professionalProfileId: subscriptionRow.professionalProfileId,
              type: "SUBSCRIPTION",
              amountEurCents: invoice.amount_paid,
              status: "SUCCEEDED",
            },
          });
        }
      }
    }
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await this.syncStripeSubscription(event.data.object as Stripe.Subscription);
    }
  }
}

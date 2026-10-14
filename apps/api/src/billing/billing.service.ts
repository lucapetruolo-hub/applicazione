import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { SUBSCRIPTION_TIERS, subscriptionTierInfo, tierPriceDifferenceEurCents, type SubscriptionTier } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { hasLaunched, launchDate, subscriptionState, tierOfPlan, trialEndFor } from "../subscriptions/subscription-rules";
import { BookingsService } from "../bookings/bookings.service";
import { JobPaymentsService } from "../job-payments/job-payments.service";
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

// Abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md §161): un
// prezzo Stripe mensile per livello.
const SUBSCRIPTION_PRICE_ENV: Record<SubscriptionTier, string> = {
  BASE: "STRIPE_PRICE_BASE",
  PLUS: "STRIPE_PRICE_PLUS",
  PRO: "STRIPE_PRICE_PRO",
};
// Stripe accetta un `trial_end` solo almeno 48 ore nel futuro.
const MIN_TRIAL_END_MS = 48 * 60 * 60 * 1000;

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

  private tierOfPrice(priceId: string | undefined): SubscriptionTier | null {
    if (!priceId) return null;
    return (Object.keys(SUBSCRIPTION_PRICE_ENV) as SubscriptionTier[]).find((tier) => process.env[SUBSCRIPTION_PRICE_ENV[tier]] === priceId) ?? null;
  }

  private requirePrice(plan: SubscriptionTier): string {
    const priceId = process.env[SUBSCRIPTION_PRICE_ENV[plan]];
    if (!priceId) {
      throw new BadRequestException(`Prezzo Stripe non configurato per il livello ${plan} (${SUBSCRIPTION_PRICE_ENV[plan]}).`);
    }
    return priceId;
  }

  /** Riporta sulla riga locale lo stato di un abbonamento Stripe. */
  private async syncStripeSubscription(subscription: Stripe.Subscription): Promise<void> {
    const item = subscription.items.data[0];
    await this.subscriptionsService.applyStripeSubscription({
      professionalProfileId: subscription.metadata?.professionalProfileId ?? null,
      stripeSubscriptionId: subscription.id,
      status: localStatus(subscription.status),
      tier: this.tierOfPrice(item?.price?.id),
      cancelAtPeriodEnd: subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    });
  }

  /**
   * Scelta o cambio di livello (docs/CHANGELOG.md §162). Restituisce l'URL
   * di una pagina di pagamento Stripe, oppure `url: null` se il cambio è già
   * fatto (addebito sulla carta salvata).
   * - Nessun abbonamento attivo: nuovo abbonamento con rinnovo automatico.
   *   Durante il mese gratuito (che vale come Base) si paga subito solo la
   *   differenza verso il livello scelto; il canone parte a fine mese gratuito.
   * - Abbonamento attivo, livello superiore: Stripe addebita subito solo la
   *   differenza per i giorni che mancano al rinnovo.
   * - Livello inferiore: non ancora previsto (annullare e sceglierlo alla scadenza).
   */
  async createSubscriptionCheckout(userId: string, plan: SubscriptionTier): Promise<{ url: string | null }> {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);
    const priceId = this.requirePrice(plan);
    const now = new Date();
    const current = await this.prisma.subscription.findUnique({ where: { professionalProfileId: profile.id } });
    const state = subscriptionState(current, now);

    if (current?.stripeSubscriptionId && (state === "ACTIVE" || state === "PAST_DUE")) {
      return this.upgradeTier(stripe, profile.id, current.stripeSubscriptionId, tierOfPlan(current.plan), plan, priceId);
    }

    // Nessun `invoice_creation` qui: per le Checkout Session in modalità
    // `subscription` Stripe genera già da sola una fattura reale a ogni
    // ciclo di fatturazione (comportamento nativo, non disattivabile né
    // configurabile da questo parametro — che l'API Stripe accetta solo in
    // modalità `payment`, vedi sotto). Il professionista la riceve già via
    // email Stripe e può scaricarla dal Customer Portal.
    // Chi sceglie un livello durante la prova gratuita non perde i giorni
    // rimasti: il primo canone parte alla fine della prova. Prima del lancio
    // la prova finisce un mese dopo il lancio (docs/CHANGELOG.md §170).
    const launch = launchDate();
    const preLaunchTrial = current?.status === "TRIALING" && launch !== null && !hasLaunched(now, launch);
    const trialEndsAt = preLaunchTrial ? trialEndFor(now, launch) : current?.trialEndsAt;
    const trialEnd =
      (preLaunchTrial || state === "TRIAL") && trialEndsAt && trialEndsAt.getTime() - now.getTime() > MIN_TRIAL_END_MS
        ? Math.floor(trialEndsAt.getTime() / 1000)
        : undefined;
    const difference = trialEnd ? tierPriceDifferenceEurCents("BASE", plan) : 0;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        { price: priceId, quantity: 1 },
        // Il mese gratuito vale come Base: per un livello superiore si paga
        // subito solo la differenza (addebito una tantum sulla prima fattura).
        ...(difference > 0
          ? [
              {
                price_data: {
                  currency: "eur",
                  unit_amount: difference,
                  product_data: { name: `Differenza per il livello ${subscriptionTierInfo(plan).label} nel mese gratuito` },
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      subscription_data: { ...(trialEnd ? { trial_end: trialEnd } : {}), metadata: { professionalProfileId: profile.id } },
      customer: await this.ensureCustomer(stripe, profile),
      success_url: `${this.frontendUrl()}/dashboard/abbonamento?attivato=1`,
      cancel_url: `${this.frontendUrl()}/dashboard/abbonamento`,
      metadata: { kind: "subscription", professionalProfileId: profile.id, plan },
    });

    return { url: session.url };
  }

  private async upgradeTier(
    stripe: Stripe,
    professionalProfileId: string,
    stripeSubscriptionId: string,
    currentTier: SubscriptionTier | null,
    plan: SubscriptionTier,
    priceId: string,
  ): Promise<{ url: string | null }> {
    if (currentTier === plan) throw new BadRequestException("È già il tuo livello.");
    if (currentTier && tierRank(plan) < tierRank(currentTier)) {
      throw new BadRequestException("Per passare a un livello inferiore annulla l'abbonamento e scegli il nuovo livello alla scadenza.");
    }
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (!item) throw new BadRequestException("Abbonamento Stripe senza voci: contattaci.");

    // Ancora nel mese gratuito con un livello già scelto: si paga subito la
    // differenza con una pagina di pagamento, il nuovo canone parte a fine prova.
    if (subscription.status === "trialing") {
      const difference = tierPriceDifferenceEurCents(currentTier ?? "BASE", plan);
      const customer = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer,
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: difference,
              product_data: { name: `Differenza per il livello ${subscriptionTierInfo(plan).label} nel mese gratuito` },
            },
            quantity: 1,
          },
        ],
        success_url: `${this.frontendUrl()}/dashboard/abbonamento?attivato=1`,
        cancel_url: `${this.frontendUrl()}/dashboard/abbonamento`,
        metadata: { kind: "tier_upgrade", professionalProfileId, stripeSubscriptionId, plan },
        invoice_creation: { enabled: true },
      });
      return { url: session.url };
    }

    // Abbonamento pagato: Stripe addebita subito sulla carta salvata solo la
    // differenza per i giorni che mancano al rinnovo.
    try {
      const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        cancel_at_period_end: false,
      });
      await this.syncStripeSubscription(updated);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeCardError) {
        throw new BadRequestException("Il pagamento della differenza non è andato a buon fine: controlla la carta e riprova.");
      }
      throw error;
    }
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

  async createBoostCheckout(userId: string, boostType: string) {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);

    const priceEurCents = BOOST_PRICES_EUR_CENTS[boostType];
    if (!priceEurCents) {
      throw new BadRequestException("Tipo di pacchetto visibilità non valido.");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
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
      // Genera una ricevuta Stripe reale, scaricabile dal professionista
      // (CEO, consiglio esperti). NON sostituisce la fattura elettronica SDI:
      // finché l'account Stripe di Manovia non ha i dati societari reali
      // (checklist di lancio, punto 1) il documento porta i dati provvisori.
      invoice_creation: { enabled: true },
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
        await this.prisma.subscription.upsert({
          where: { professionalProfileId: metadata.professionalProfileId },
          update: {
            plan: metadata.plan as SubscriptionTier,
            status: "ACTIVE",
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
          create: {
            professionalProfileId: metadata.professionalProfileId,
            plan: metadata.plan as SubscriptionTier,
            status: "ACTIVE",
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

      // Differenza pagata per un livello superiore durante il mese gratuito
      // (docs/CHANGELOG.md §162): il nuovo prezzo vale dal primo rinnovo.
      if (metadata.kind === "tier_upgrade" && metadata.professionalProfileId && metadata.stripeSubscriptionId && metadata.plan) {
        const subscription = await stripe.subscriptions.retrieve(metadata.stripeSubscriptionId);
        const item = subscription.items.data[0];
        if (item) {
          const updated = await stripe.subscriptions.update(subscription.id, {
            items: [{ id: item.id, price: this.requirePrice(metadata.plan as SubscriptionTier) }],
            proration_behavior: "none",
          });
          await this.syncStripeSubscription(updated);
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
      // qui il cliente paga il lavoro, i soldi restano in custodia e la
      // commissione si trattiene trasferendo meno al professionista.
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
    }

    // Contestazione in banca (chargeback, docs/CHANGELOG.md §236).
    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" || event.type === "charge.dispute.closed") {
      const dispute = event.data.object as Stripe.Dispute;
      const jobPayment = await this.jobPaymentsService.handleStripeDispute(dispute);
      // Abbonamento o pacchetto di visibilità contestato: solo avviso al team.
      if (!jobPayment && (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed")) {
        await this.jobPaymentsService.notifyFinanceAdmins("ADMIN_STRIPE_DISPUTE", { amountEurCents: dispute.amount, status: dispute.status, bookingId: null });
      }
    }

    // Ciclo di vita dell'abbonamento (docs/CHANGELOG.md §161-§162): rinnovo
    // pagato o non riuscito, cambio di livello, annullamento, fine.
    if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice;
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

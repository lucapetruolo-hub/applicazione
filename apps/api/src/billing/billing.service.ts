import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { SUBSCRIPTION_TIERS, subscriptionTierInfo, tierPriceDifferenceEurCents, type SubscriptionTier } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { subscriptionState, tierOfPlan } from "../subscriptions/subscription-rules";
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
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jobPaymentsService: JobPaymentsService,
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
    // rimasti: il primo canone parte alla fine della prova.
    const trialEnd =
      state === "TRIAL" && current?.trialEndsAt && current.trialEndsAt.getTime() - now.getTime() > MIN_TRIAL_END_MS
        ? Math.floor(current.trialEndsAt.getTime() / 1000)
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
      customer_email: profile.user.email ?? undefined,
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

  async createLeadCheckout(userId: string, leadId: string) {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);

    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.professionalProfileId !== profile.id) {
      throw new ForbiddenException("Questo lead non è tuo.");
    }
    if (lead.status === "PAID" || lead.status === "CONVERTED") {
      throw new BadRequestException("Questo lead è già stato sbloccato.");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: lead.priceEurCents,
            product_data: { name: "Sblocco richiesta cliente" },
          },
          quantity: 1,
        },
      ],
      customer_email: profile.user.email ?? undefined,
      success_url: `${this.frontendUrl()}/dashboard?lead=sbloccato`,
      cancel_url: `${this.frontendUrl()}/dashboard`,
      metadata: { kind: "lead", leadId: lead.id, professionalProfileId: profile.id },
      // Genera una ricevuta/fattura Stripe reale, scaricabile dal
      // professionista (CEO, consiglio esperti: "attivare invoice_creation
      // sulle Checkout Session di pagamento singolo") — plumbing tecnico
      // pronto da subito, ma NON sostituisce una fattura elettronica SDI:
      // finché l'account Stripe di Manovia non ha i dati societari reali
      // (P.IVA/sede legale, oggi `[DA COMPILARE]`, CLAUDE.md §10 checklist
      // punto 1), il documento generato porta comunque i dati provvisori
      // dell'account Stripe corrente. Vedi promemoria pre-lancio in
      // CLAUDE.md §10.
      invoice_creation: { enabled: true },
    });

    return { url: session.url };
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
      customer_email: profile.user.email ?? undefined,
      success_url: `${this.frontendUrl()}/dashboard?boost=attivato`,
      cancel_url: `${this.frontendUrl()}/dashboard`,
      metadata: { kind: "boost", boostType, professionalProfileId: profile.id },
      // Stessa scelta e stesso promemoria pre-lancio di createLeadCheckout
      // sopra: ricevuta Stripe reale da subito, fattura elettronica SDI
      // solo dopo i dati societari reali di Manovia.
      invoice_creation: { enabled: true },
    });

    return { url: session.url };
  }

  /** Verifica la firma Stripe e applica gli effetti dell'evento (idempotente per event.id). */
  async handleWebhookEvent(rawBody: Buffer, signature: string) {
    const stripe = this.requireStripe();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestException("STRIPE_WEBHOOK_SECRET non configurato.");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
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

      if (metadata.kind === "lead" && metadata.leadId) {
        const lead = await this.prisma.lead.update({ where: { id: metadata.leadId }, data: { status: "PAID" } });
        await this.prisma.payment.create({
          data: {
            professionalProfileId: lead.professionalProfileId,
            type: "LEAD",
            amountEurCents: session.amount_total ?? 0,
            status: "SUCCEEDED",
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
          },
        });
      }

      // Pagamento del lavoro tramite Manovia (CLAUDE.md §88) — distinto dai
      // tre casi sopra (che sono sempre il professionista che paga Manovia):
      // qui è il cliente che paga il lavoro, la piattaforma trattiene la
      // commissione via Stripe Connect (application_fee_amount, già
      // impostato alla creazione della Checkout Session).
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
    if (event.type === "account.updated") {
      const account = event.data.object as Stripe.Account;
      const requirementsStatus = account.requirements?.currently_due?.length
        ? account.requirements.currently_due.join(", ")
        : null;
      await this.professionalFiscalService.syncStripeConnectStatus(
        account.id,
        Boolean(account.charges_enabled),
        Boolean(account.payouts_enabled),
        requirementsStatus,
      );
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

    return { received: true };
  }
}

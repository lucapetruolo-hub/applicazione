import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
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

const SUBSCRIPTION_PRICE_ENV: Record<"PRO" | "BUSINESS", string> = {
  PRO: "STRIPE_PRICE_PRO",
  BUSINESS: "STRIPE_PRICE_BUSINESS",
};

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly professionalFiscalService: ProfessionalFiscalService,
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

  async createSubscriptionCheckout(userId: string, plan: "PRO" | "BUSINESS") {
    const stripe = this.requireStripe();
    const profile = await this.requireMyProfile(userId);

    const priceId = process.env[SUBSCRIPTION_PRICE_ENV[plan]];
    if (!priceId) {
      throw new BadRequestException(`Prezzo Stripe non configurato per il piano ${plan} (${SUBSCRIPTION_PRICE_ENV[plan]}).`);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: profile.user.email ?? undefined,
      success_url: `${this.frontendUrl()}/dashboard?abbonamento=attivato`,
      cancel_url: `${this.frontendUrl()}/per-professionisti`,
      metadata: { kind: "subscription", professionalProfileId: profile.id, plan },
    });

    return { url: session.url };
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
            plan: metadata.plan as "PRO" | "BUSINESS",
            status: "ACTIVE",
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
          create: {
            professionalProfileId: metadata.professionalProfileId,
            plan: metadata.plan as "PRO" | "BUSINESS",
            status: "ACTIVE",
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
        });
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

    return { received: true };
  }
}

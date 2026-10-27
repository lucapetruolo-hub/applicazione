import { BadRequestException, Body, Controller, Headers, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { churnReasonBodySchema, type ChurnReasonBody } from "@professionisti/shared";
import { SiteCountsService } from "../site-counts/site-counts.service";
import { BillingService } from "./billing.service";

const subscriptionCheckoutSchema = z.object({ plan: z.enum(["BASE", "PLUS", "PRO"]), interval: z.enum(["MONTH", "YEAR"]).optional() });
const boostCheckoutSchema = z.object({ type: z.enum(["BOOST_LOCALE", "BADGE_REPUTAZIONE", "STORIA_SUCCESSO"]) });

@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly siteCounts: SiteCountsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post("subscription/checkout")
  createSubscriptionCheckout(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(subscriptionCheckoutSchema)) body: { plan: "BASE" | "PLUS" | "PRO"; interval?: "MONTH" | "YEAR" },
  ) {
    return this.billingService.createSubscriptionCheckout(req.user.userId, body.plan, body.interval);
  }

  @UseGuards(JwtAuthGuard)
  @Post("subscription/cancel")
  async cancelSubscription(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(churnReasonBodySchema)) body: ChurnReasonBody) {
    const result = await this.billingService.setCancelAtPeriodEnd(req.user.userId, true);
    // Motivo scelto da un elenco, facoltativo (docs/CHANGELOG.md §372): solo il conteggio.
    if (body.reason) await this.siteCounts.recordChurnReason("SUBSCRIPTION", body.reason).catch(() => undefined);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post("subscription/resume")
  resumeSubscription(@Req() req: AuthenticatedRequest) {
    return this.billingService.setCancelAtPeriodEnd(req.user.userId, false);
  }

  @UseGuards(JwtAuthGuard)
  @Post("portal")
  createBillingPortal(@Req() req: AuthenticatedRequest) {
    return this.billingService.createBillingPortal(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("boost/checkout")
  createBoostCheckout(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(boostCheckoutSchema)) body: { type: string },
  ) {
    return this.billingService.createBoostCheckout(req.user.userId, body.type);
  }

  // Endpoint pubblico chiamato da Stripe: firma verificata nel service, non
  // protetto da JwtAuthGuard. Il body deve arrivare integro (raw) — vedi
  // main.ts, che monta express.raw() solo su questa rotta prima del parser JSON.
  @Post("webhook")
  handleWebhook(@Req() req: Request, @Headers("stripe-signature") signature: string) {
    if (!signature) {
      throw new BadRequestException("Firma Stripe mancante.");
    }
    return this.billingService.handleWebhookEvent(req.body as Buffer, signature);
  }
}

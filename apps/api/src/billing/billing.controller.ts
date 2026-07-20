import { BadRequestException, Body, Controller, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { BillingService } from "./billing.service";

const subscriptionCheckoutSchema = z.object({ plan: z.enum(["PRO", "BUSINESS"]) });
const boostCheckoutSchema = z.object({ type: z.enum(["BOOST_LOCALE", "BADGE_REPUTAZIONE", "STORIA_SUCCESSO"]) });

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Post("subscription/checkout")
  createSubscriptionCheckout(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(subscriptionCheckoutSchema)) body: { plan: "PRO" | "BUSINESS" },
  ) {
    return this.billingService.createSubscriptionCheckout(req.user.userId, body.plan);
  }

  @UseGuards(JwtAuthGuard)
  @Post("leads/:leadId/checkout")
  createLeadCheckout(@Req() req: AuthenticatedRequest, @Param("leadId") leadId: string) {
    return this.billingService.createLeadCheckout(req.user.userId, leadId);
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

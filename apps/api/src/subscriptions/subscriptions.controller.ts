import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { MAX_OFFER_FREE_MONTHS } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { SubscriptionsService } from "./subscriptions.service";

/** Posti rimasti dell'offerta di lancio, per la pagina prezzi (pubblico, §363). */
@Controller("subscriptions")
export class FounderSpotsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("founders")
  getFounderSpots() {
    return this.subscriptionsService.founderSpots();
  }
}

/** Area admin: i primi 100 professionisti dell'offerta di lancio (§363). */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/founders")
export class AdminFoundersController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @RequireAdminScope("ANY")
  @Get()
  list() {
    return this.subscriptionsService.listFounders();
  }
}

const offerSchema = z.object({ freeMonths: z.number().int().min(1).max(MAX_OFFER_FREE_MONTHS) });

/**
 * Area admin: offerta dei mesi gratis (decisione di Luca del 29/10/2026,
 * docs/changelog/2026-10-29-offerta-mesi-gratis.md). La vede ogni admin, la
 * cambia solo il super admin.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/subscription-offer")
export class AdminSubscriptionOfferController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @RequireAdminScope("ANY")
  @Get()
  get() {
    return this.subscriptionsService.getOfferAdmin();
  }

  @RequireAdminScope("SUPER")
  @Post("stop")
  stop(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.stopOffer(req.user.userId);
  }

  @RequireAdminScope("SUPER")
  @Post()
  start(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(offerSchema)) body: { freeMonths: number }) {
    return this.subscriptionsService.startOffer(req.user.userId, body.freeMonths);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("professionals/me")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("subscription")
  getMySubscription(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getMySubscription(req.user.userId);
  }
}

import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
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

const paidStartSchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });

/**
 * Area admin: abbonamenti a pagamento spenti (tutti gratis) o accesi da un
 * giorno (docs/changelog/2026-10-29-abbonamenti-a-pagamento-da-admin.md).
 * Vederlo serve a chi recluta; deciderlo solo al super admin.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/paid-start")
export class AdminPaidStartController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @RequireAdminScope("ANY")
  @Get()
  get() {
    return this.subscriptionsService.adminPaidStart();
  }

  @RequireAdminScope("SUPER")
  @Post()
  set(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(paidStartSchema)) body: z.infer<typeof paidStartSchema>) {
    return this.subscriptionsService.setPaidFrom(req.user.userId, body.day);
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

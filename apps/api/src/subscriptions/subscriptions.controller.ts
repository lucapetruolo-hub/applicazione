import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { SubscriptionsService } from "./subscriptions.service";

/** Posti rimasti dell'offerta di lancio, per la pagina prezzi (pubblico, §359). */
@Controller("subscriptions")
export class FounderSpotsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("founders")
  getFounderSpots() {
    return this.subscriptionsService.founderSpots();
  }
}

/** Area admin: i primi 100 professionisti dell'offerta di lancio (§359). */
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

@UseGuards(JwtAuthGuard)
@Controller("professionals/me")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("subscription")
  getMySubscription(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getMySubscription(req.user.userId);
  }
}

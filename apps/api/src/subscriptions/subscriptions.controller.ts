import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { SubscriptionsService } from "./subscriptions.service";

/** Posti rimasti dell'offerta di lancio, per la pagina prezzi (pubblico, §358). */
@Controller("subscriptions")
export class FounderSpotsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("founders")
  getFounderSpots() {
    return this.subscriptionsService.founderSpots();
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

import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { SubscriptionsService } from "./subscriptions.service";

@UseGuards(JwtAuthGuard)
@Controller("professionals/me")
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get("subscription")
  getMySubscription(@Req() req: AuthenticatedRequest) {
    return this.subscriptionsService.getMySubscription(req.user.userId);
  }
}

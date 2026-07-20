import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { guidedRequestSchema, type GuidedRequestInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { GuidedRequestsService } from "./guided-requests.service";

@Controller("guided-requests")
export class GuidedRequestsController {
  constructor(private readonly guidedRequestsService: GuidedRequestsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(guidedRequestSchema)) body: GuidedRequestInput) {
    return this.guidedRequestsService.create(req.user.userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.guidedRequestsService.listForClient(req.user.userId);
  }
}

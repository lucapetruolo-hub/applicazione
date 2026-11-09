import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { professionalClientNoteSchema, type ProfessionalClientNoteInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ProfessionalClientsService } from "./professional-clients.service";

@Controller("professional-clients")
export class ProfessionalClientsController {
  constructor(private readonly service: ProfessionalClientsService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  listMine(@Req() req: AuthenticatedRequest) {
    return this.service.listMine(req.user.userId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Put("me/note")
  setNote(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(professionalClientNoteSchema)) body: ProfessionalClientNoteInput) {
    return this.service.setNote(req.user.userId, body);
  }
}

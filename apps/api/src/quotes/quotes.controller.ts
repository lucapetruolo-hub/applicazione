import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { quoteSelfSchema, type QuoteSelfInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { QuotesService } from "./quotes.service";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(quoteSelfSchema)) body: QuoteSelfInput) {
    return this.quotesService.createOrUpdate(req.user.userId, body);
  }
}

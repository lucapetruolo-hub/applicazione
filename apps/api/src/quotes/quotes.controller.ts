import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { proposeQuoteDateSchema, quoteSelfSchema, type ProposeQuoteDateInput, type QuoteSelfInput } from "@professionisti/shared";
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

  @UseGuards(JwtAuthGuard)
  @Post(":id/propose-date")
  proposeDate(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(proposeQuoteDateSchema)) body: ProposeQuoteDateInput,
  ) {
    return this.quotesService.proposeDate(req.user.userId, id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/confirm-proposed-date")
  confirmProposedDate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.quotesService.confirmProposedDate(req.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/reject-proposed-date")
  rejectProposedDate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.quotesService.rejectProposedDate(req.user.userId, id);
  }

  /** Il cliente rifiuta interamente un preventivo ricevuto. */
  @UseGuards(JwtAuthGuard)
  @Post(":id/reject")
  reject(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.quotesService.rejectByClient(req.user.userId, id);
  }

  /** Il professionista ritira un preventivo già inviato. */
  @UseGuards(JwtAuthGuard)
  @Post(":id/withdraw")
  withdraw(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.quotesService.withdrawByProfessional(req.user.userId, id);
  }
}

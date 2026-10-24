import { Body, Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  counterProposeQuoteDateSchema,
  proposeQuoteDateSchema,
  quoteSelfSchema,
  rejectQuoteSchema,
  type CounterProposeQuoteDateInput,
  type ProposeQuoteDateInput,
  type QuoteSelfInput,
  type RejectQuoteInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { VerifiedEmailGuard } from "../auth/verified-email.guard";
import { QuotesService } from "./quotes.service";

@Controller("quotes")
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  // Stesso limite dei messaggi in chat (controllo sicurezza, docs/CHANGELOG.md §292).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, VerifiedEmailGuard)
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

  /** Il professionista modifica direttamente l'orario proposto dal cliente, invece di confermarlo/rifiutarlo semplicemente. */
  @UseGuards(JwtAuthGuard)
  @Post(":id/counter-propose-date")
  counterProposeDate(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(counterProposeQuoteDateSchema)) body: CounterProposeQuoteDateInput,
  ) {
    return this.quotesService.counterProposeDate(req.user.userId, id, body);
  }

  /** Il cliente rifiuta interamente un preventivo ricevuto, con una nota facoltativa per il professionista. */
  @UseGuards(JwtAuthGuard)
  @Post(":id/reject")
  reject(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectQuoteSchema.optional().transform((v) => v ?? {}))) body: RejectQuoteInput,
  ) {
    return this.quotesService.rejectByClient(req.user.userId, id, body);
  }

  /** Il professionista ritira un preventivo già inviato. */
  @UseGuards(JwtAuthGuard)
  @Post(":id/withdraw")
  withdraw(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.quotesService.withdrawByProfessional(req.user.userId, id);
  }
}

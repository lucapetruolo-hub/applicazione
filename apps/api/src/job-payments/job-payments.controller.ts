import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  bankDisputeProNoteSchema,
  type BankDisputeProNoteInput,
  requestRefundSchema,
  openDisputeSchema,
  type RequestRefundInput,
  type OpenDisputeInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { JobPaymentsService } from "./job-payments.service";
import { RefundsService } from "./refunds.service";
import { DisputesService } from "./disputes.service";
import { BankDisputesService } from "./bank-disputes.service";

/**
 * Endpoint del pagamento del lavoro, sempre scoped a una Booking — CLAUDE.md
 * §88. Controller separato da BookingsController (che vive nel modulo
 * `bookings`): stesso principio già in uso altrove nel progetto per
 * mantenere ogni concern in un modulo proprio (es. TimelineController per
 * la cronologia, distinto da GuidedRequestsController che pure la espone).
 */
@Controller("bookings/:id/job-payment")
export class JobPaymentsController {
  constructor(
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly refundsService: RefundsService,
    private readonly disputesService: DisputesService,
    private readonly bankDisputesService: BankDisputesService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  get(@Req() req: AuthenticatedRequest, @Param("id") bookingId: string) {
    return this.jobPaymentsService.getForBooking(req.user.userId, bookingId);
  }

  /** Pagamento online (§168): checkout Stripe dell'acconto o del saldo. */
  @UseGuards(JwtAuthGuard)
  @Post("checkout/:part")
  checkout(@Req() req: AuthenticatedRequest, @Param("id") bookingId: string, @Param("part") part: string) {
    if (part !== "deposit" && part !== "balance") throw new BadRequestException("Parte del pagamento non valida.");
    return this.jobPaymentsService.createCheckout(req.user.userId, bookingId, part);
  }

  @UseGuards(JwtAuthGuard)
  @Post("refund")
  requestRefund(@Req() req: AuthenticatedRequest, @Param("id") bookingId: string, @Body(new ZodValidationPipe(requestRefundSchema)) body: RequestRefundInput) {
    return this.refundsService.request(req.user.userId, bookingId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post("dispute")
  openDispute(@Req() req: AuthenticatedRequest, @Param("id") bookingId: string, @Body(new ZodValidationPipe(openDisputeSchema)) body: OpenDisputeInput) {
    return this.disputesService.open(req.user.userId, bookingId, body.reason);
  }

  /** Spiegazione e foto del professionista su una contestazione in banca (docs/changelog/2026-10-28-stripe-prova.md). */
  @UseGuards(JwtAuthGuard)
  @Patch("bank-dispute-note")
  saveBankDisputeNote(@Req() req: AuthenticatedRequest, @Param("id") bookingId: string, @Body(new ZodValidationPipe(bankDisputeProNoteSchema)) body: BankDisputeProNoteInput) {
    return this.bankDisputesService.saveProfessionalNote(req.user.userId, bookingId, body);
  }
}

/** Pagamenti online ricevuti dal professionista, per stato del bonifico (docs/CHANGELOG.md §249). */
@Controller("professionals/me/online-payments")
export class ProfessionalOnlinePaymentsController {
  constructor(private readonly jobPaymentsService: JobPaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get("summary")
  summary(@Req() req: AuthenticatedRequest) {
    return this.jobPaymentsService.professionalPayoutSummary(req.user.userId);
  }
}

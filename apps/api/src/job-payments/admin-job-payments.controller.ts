import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { decideRefundSchema, resolveDisputeSchema, type DecideRefundInput, type ResolveDisputeInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard } from "../admin/admin.guard";
import { JobPaymentsService } from "./job-payments.service";
import { RefundsService } from "./refunds.service";
import { DisputesService } from "./disputes.service";

/** Vista admin su pagamenti/rimborsi/contestazioni — CLAUDE.md §88. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminJobPaymentsController {
  constructor(
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly refundsService: RefundsService,
    private readonly disputesService: DisputesService,
  ) {}

  @Get("finance/summary")
  financeSummary() {
    return this.jobPaymentsService.financeSummary();
  }

  @Get("job-payments")
  listJobPayments() {
    return this.jobPaymentsService.listAll();
  }

  @Get("refunds")
  listRefunds() {
    return this.refundsService.listAll();
  }

  @Patch("refunds/:id")
  decideRefund(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(decideRefundSchema)) body: DecideRefundInput) {
    return this.refundsService.decide(id, body.decision, req.user.userId);
  }

  @Get("disputes")
  listDisputes() {
    return this.disputesService.listAll();
  }

  @Patch("disputes/:id")
  resolveDispute(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeInput) {
    return this.disputesService.resolve(id, body.status, body.resolutionNote, req.user.userId);
  }
}

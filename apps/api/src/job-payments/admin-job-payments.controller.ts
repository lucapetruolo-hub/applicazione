import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import {
  bankDisputeEvidenceSchema,
  closeUnpaidBalanceSchema,
  decideRefundSchema,
  resolveDisputeSchema,
  setOnlineLimitSchema,
  type BankDisputeEvidenceInput,
  type DecideRefundInput,
  type ResolveDisputeInput,
  type SetOnlineLimitInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { JobPaymentsService } from "./job-payments.service";
import { RefundsService } from "./refunds.service";
import { DisputesService } from "./disputes.service";
import { OnlineMoneyService } from "./online-money.service";
import { BankDisputesService } from "./bank-disputes.service";
import { pdfResponse } from "../accounting/document-pdf";

/** Vista admin su pagamenti/rimborsi/contestazioni — CLAUDE.md §88. */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin")
export class AdminJobPaymentsController {
  constructor(
    private readonly jobPaymentsService: JobPaymentsService,
    private readonly refundsService: RefundsService,
    private readonly disputesService: DisputesService,
    private readonly onlineMoneyService: OnlineMoneyService,
    private readonly bankDisputesService: BankDisputesService,
  ) {}

  @Get("finance/summary")
  financeSummary() {
    return this.jobPaymentsService.financeSummary();
  }

  @Get("job-payments")
  listJobPayments() {
    return this.jobPaymentsService.listAll();
  }

  /** Saldi dei pagamenti online non pagati entro 7 giorni (§168). */
  @Get("unpaid-balances")
  listUnpaidBalances() {
    return this.onlineMoneyService.listUnpaidBalances();
  }

  @Patch("unpaid-balances/:id")
  closeUnpaidBalance(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(closeUnpaidBalanceSchema)) body: { note: string }) {
    return this.onlineMoneyService.closeUnpaidBalance(req.user.userId, id, body.note.trim());
  }

  /** Tetto ai pagamenti online (docs/changelog/2026-10-28-tetto-pagamenti-online.md). */
  @Get("online-limits")
  listOnlineLimits() {
    return this.jobPaymentsService.listOnlineLimits();
  }

  @Patch("online-limits/:professionalProfileId")
  setOnlineLimit(@Req() req: AuthenticatedRequest, @Param("professionalProfileId") id: string, @Body(new ZodValidationPipe(setOnlineLimitSchema)) body: SetOnlineLimitInput) {
    return this.jobPaymentsService.setOnlineLimitRemoved(req.user.userId, id, body.removed, body.reason);
  }

  /** Contestazioni in banca: prove mandate dal sito (docs/changelog/2026-10-28-stripe-prova.md). */
  @Get("bank-disputes")
  listBankDisputes() {
    return this.bankDisputesService.listOpen();
  }

  @Get("bank-disputes/archive")
  bankDisputesArchive(@Query("q") q?: string) {
    return this.bankDisputesService.archive(q ?? "");
  }

  @Get("bank-disputes/:jobPaymentId/sent-pdf")
  async bankDisputeSentPdf(@Param("jobPaymentId") id: string) {
    return pdfResponse(await this.bankDisputesService.sentPdf(id), "prove-mandate.pdf");
  }

  @Get("bank-disputes/:jobPaymentId/pdf")
  async bankDisputePdf(@Param("jobPaymentId") id: string) {
    return pdfResponse(await this.bankDisputesService.documentationPdf(id), "riepilogo-lavoro.pdf");
  }

  @Patch("bank-disputes/:jobPaymentId")
  saveBankDisputeEvidence(@Req() req: AuthenticatedRequest, @Param("jobPaymentId") id: string, @Body(new ZodValidationPipe(bankDisputeEvidenceSchema)) body: BankDisputeEvidenceInput) {
    return this.bankDisputesService.saveEvidence(req.user.userId, id, body);
  }

  @Get("refunds")
  listRefunds(@Query("q") q?: string) {
    return this.refundsService.listAll(q ?? "");
  }

  @Patch("refunds/:id")
  decideRefund(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(decideRefundSchema)) body: DecideRefundInput) {
    return this.refundsService.decide(id, body.decision, req.user.userId);
  }

  @Get("disputes")
  listDisputes(@Query("q") q?: string) {
    return this.disputesService.listAll(q ?? "");
  }

  @Patch("disputes/:id")
  resolveDispute(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(resolveDisputeSchema)) body: ResolveDisputeInput) {
    return this.disputesService.resolve(id, body.status, body.resolutionNote, req.user.userId);
  }
}

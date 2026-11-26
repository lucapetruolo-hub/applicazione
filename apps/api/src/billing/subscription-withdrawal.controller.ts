import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { SubscriptionWithdrawalService } from "./subscription-withdrawal.service";

const requestSchema = z.object({ reason: z.string().trim().max(500).optional() });
const approveSchema = z.object({ refundEurCents: z.number().int().min(0).optional(), note: z.string().trim().max(500).optional() });
const rejectSchema = z.object({ note: z.string().trim().min(3, "Scrivi il motivo per il professionista.").max(500) });

/** Recesso entro 14 giorni, dalla pagina Abbonamento (docs/changelog/2026-11-26-recesso-abbonamento.md). */
@UseGuards(JwtAuthGuard)
@Controller("professionals/me/subscription/withdrawal")
export class SubscriptionWithdrawalController {
  constructor(private readonly withdrawals: SubscriptionWithdrawalService) {}

  @Get()
  async option(@Req() req: AuthenticatedRequest) {
    return { withdrawal: await this.withdrawals.myOption(req.user.userId) };
  }

  @Post()
  async request(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(requestSchema)) body: z.infer<typeof requestSchema>) {
    return { withdrawal: await this.withdrawals.request(req.user.userId, body.reason) };
  }
}

/** Area admin, Finanza: richieste di recesso col rimborso calcolato. */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/subscription-withdrawals")
export class AdminSubscriptionWithdrawalController {
  constructor(private readonly withdrawals: SubscriptionWithdrawalService) {}

  @RequireAdminScope("FINANCE")
  @Get()
  list() {
    return this.withdrawals.adminList();
  }

  @RequireAdminScope("FINANCE")
  @Post(":id/approve")
  approve(@Req() req: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(approveSchema)) body: z.infer<typeof approveSchema>) {
    return this.withdrawals.approve(req.user.userId, id, body.refundEurCents, body.note);
  }

  @RequireAdminScope("FINANCE")
  @Post(":id/reject")
  reject(@Req() req: AuthenticatedRequest, @Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(rejectSchema)) body: z.infer<typeof rejectSchema>) {
    return this.withdrawals.reject(req.user.userId, id, body.note);
  }
}

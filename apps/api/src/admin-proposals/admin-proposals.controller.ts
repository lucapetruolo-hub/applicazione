import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { adminProposalDecisionSchema, type AdminProposalDecisionInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { AdminProposalsService } from "./admin-proposals.service";

/**
 * "Da approvare" in cima alla Home dell'Admin (docs/changelog/2026-11-03-automazioni-admin.md).
 * Ogni admin vede e decide solo le proposte del suo permesso: lo controlla il servizio, tipo per tipo.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/proposals")
export class AdminProposalsController {
  constructor(private readonly adminProposalsService: AdminProposalsService) {}

  @RequireAdminScope("ANY")
  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.adminProposalsService.list(req.user.userId);
  }

  /** Le proposte fermate con "No, mai" (in Andamento). */
  @RequireAdminScope("ANY")
  @Get("rejected")
  listRejected(@Req() req: AuthenticatedRequest) {
    return this.adminProposalsService.listRejected(req.user.userId);
  }

  /** "Riproponi": toglie il "No, mai"; torna in Da approvare se vale ancora. */
  @RequireAdminScope("ANY")
  @Post(":id/restore")
  @HttpCode(200)
  restore(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminProposalsService.restore(req.user.userId, id);
  }

  @RequireAdminScope("ANY")
  @Post(":id/decision")
  @HttpCode(200)
  decide(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(adminProposalDecisionSchema)) body: AdminProposalDecisionInput) {
    return this.adminProposalsService.decide(req.user.userId, id, body.action);
  }
}

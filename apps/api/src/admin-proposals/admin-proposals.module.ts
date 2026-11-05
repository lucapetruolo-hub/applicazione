import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CategoriesModule } from "../categories/categories.module";
import { ProblemMatchModule } from "../problem-match/problem-match.module";
import { GeneralRequestsModule } from "../general-requests/general-requests.module";
import { IdentityVerificationModule } from "../identity-verification/identity-verification.module";
import { AdminProposalsController } from "./admin-proposals.controller";
import { AdminProposalsService } from "./admin-proposals.service";

/**
 * Proposte da approvare in Admin (docs/changelog/2026-11-03-automazioni-admin.md):
 * usa i servizi dei pulsanti a mano dei moduli qui sotto, nessuna strada parallela.
 * Nessun modulo importa questo, quindi nessun giro circolare.
 */
@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, NotificationsModule, CategoriesModule, ProblemMatchModule, GeneralRequestsModule, IdentityVerificationModule],
  controllers: [AdminProposalsController],
  providers: [AdminProposalsService],
})
export class AdminProposalsModule {}

import { Module } from "@nestjs/common";
import { TaxIdCheckModule } from "../tax-id-check/tax-id-check.module";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalVerificationModule } from "../professional-verification/professional-verification.module";
import {
  AdminIdentityVerificationController,
  IdentityVerificationController,
  IdentityVerificationWebhookController,
} from "./identity-verification.controller";
import { IdentityVerificationService } from "./identity-verification.service";

/** Documento e selfie con Didit (docs/CHANGELOG.md §243). */
@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, NotificationsModule, ProfessionalVerificationModule, TaxIdCheckModule],
  controllers: [IdentityVerificationController, IdentityVerificationWebhookController, AdminIdentityVerificationController],
  providers: [IdentityVerificationService],
  exports: [IdentityVerificationService],
})
export class IdentityVerificationModule {}

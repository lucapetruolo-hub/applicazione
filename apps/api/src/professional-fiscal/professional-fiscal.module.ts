import { ProfessionalVerificationModule } from "../professional-verification/professional-verification.module";
import { Module } from "@nestjs/common";
import { TaxIdCheckModule } from "../tax-id-check/tax-id-check.module";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminModule } from "../admin/admin.module";
import { ProfessionalFiscalController, AdminProfessionalFiscalController } from "./professional-fiscal.controller";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

@Module({
  imports: [AuthModule, AuditLogModule, NotificationsModule, AdminModule, ProfessionalVerificationModule, TaxIdCheckModule],
  controllers: [ProfessionalFiscalController, AdminProfessionalFiscalController],
  providers: [ProfessionalFiscalService],
  exports: [ProfessionalFiscalService],
})
export class ProfessionalFiscalModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AdminModule } from "../admin/admin.module";
import { ProfessionalFiscalController, AdminProfessionalFiscalController } from "./professional-fiscal.controller";
import { ProfessionalFiscalService } from "./professional-fiscal.service";

@Module({
  imports: [AuthModule, AuditLogModule, AdminModule],
  controllers: [ProfessionalFiscalController, AdminProfessionalFiscalController],
  providers: [ProfessionalFiscalService],
  exports: [ProfessionalFiscalService],
})
export class ProfessionalFiscalModule {}

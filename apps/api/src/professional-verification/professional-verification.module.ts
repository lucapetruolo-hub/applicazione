import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminProfessionalVerificationController, ProfessionalVerificationRequestController } from "./professional-verification.controller";
import { ProfessionalVerificationService } from "./professional-verification.service";

@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, NotificationsModule],
  controllers: [AdminProfessionalVerificationController, ProfessionalVerificationRequestController],
  providers: [ProfessionalVerificationService],
  // Il badge si toglie da solo se il professionista cambia un dato controllato.
  exports: [ProfessionalVerificationService],
})
export class ProfessionalVerificationModule {}

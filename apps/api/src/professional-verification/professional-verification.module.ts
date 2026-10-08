import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminProfessionalVerificationController } from "./professional-verification.controller";
import { ProfessionalVerificationService } from "./professional-verification.service";

@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, NotificationsModule],
  controllers: [AdminProfessionalVerificationController],
  providers: [ProfessionalVerificationService],
})
export class ProfessionalVerificationModule {}

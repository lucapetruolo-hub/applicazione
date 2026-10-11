import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { EmailModule } from "../email/email.module";
import { AdminGeneralRequestsController, GeneralRequestsController } from "./general-requests.controller";
import { GeneralRequestsService } from "./general-requests.service";

/**
 * Servizio e rotta pubblica. Non importa AdminModule: GuidedRequestsModule
 * lo usa e AdminModule → JobIssuesModule → GuidedRequestsModule farebbe un
 * giro circolare. La parte admin vive in GeneralRequestsAdminModule.
 */
@Module({
  imports: [AuditLogModule, EmailModule],
  controllers: [GeneralRequestsController],
  providers: [GeneralRequestsService],
  // GuidedRequestsService rifiuta una richiesta generale se è chiusa.
  exports: [GeneralRequestsService],
})
export class GeneralRequestsModule {}

@Module({
  imports: [AuthModule, AdminModule, GeneralRequestsModule],
  controllers: [AdminGeneralRequestsController],
})
export class GeneralRequestsAdminModule {}

import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { EmailModule } from "../email/email.module";
import { GeneralRequestsController } from "./general-requests.controller";
import { GeneralRequestsService } from "./general-requests.service";

/**
 * Servizio e rotta pubblica. Non importa AdminModule: GuidedRequestsModule
 * lo usa e AdminModule → JobIssuesModule → GuidedRequestsModule farebbe un
 * giro circolare. La parte admin vive in GeneralRequestsAdminModule, in un
 * file a parte: nello stesso file l'import di admin.module chiudeva comunque
 * il giro tra file e AdminModule arrivava `undefined` all'avvio
 * (docs/CHANGELOG.md §218).
 */
@Module({
  imports: [AuditLogModule, EmailModule],
  controllers: [GeneralRequestsController],
  providers: [GeneralRequestsService],
  // GuidedRequestsService rifiuta una richiesta generale se è chiusa.
  exports: [GeneralRequestsService],
})
export class GeneralRequestsModule {}

import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaxIdCheckService } from "./tax-id-check.service";

/** Controllo di codice fiscale e partita IVA (Openapi, docs/CHANGELOG.md §246). */
@Module({
  imports: [AuditLogModule, NotificationsModule],
  providers: [TaxIdCheckService],
  exports: [TaxIdCheckService],
})
export class TaxIdCheckModule {}

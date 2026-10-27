import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { EmailModule } from "../email/email.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AccountingController } from "./accounting.controller";
import { AdminAccountingController } from "./admin-accounting.controller";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { FeeReconciliationService } from "./fee-reconciliation.service";
import { InvoicesService } from "./invoices.service";
import { StatementsService } from "./statements.service";

/** Fatture, estratti e copie di cortesia (docs/CHANGELOG.md §372). */
@Module({
  imports: [AuthModule, AdminModule, EmailModule, NotificationsModule],
  controllers: [AccountingController, AdminAccountingController],
  providers: [InvoicesService, StatementsService, CourtesyCopyService, FeeReconciliationService],
  exports: [InvoicesService],
})
export class AccountingModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { PlatformFeeRulesModule } from "../platform-fee-rules/platform-fee-rules.module";
import { AdminModule } from "../admin/admin.module";
import { OnlineMoneyModule } from "./online-money.module";
import { JobPaymentsController, ProfessionalOnlinePaymentsController } from "./job-payments.controller";
import { AdminJobPaymentsController } from "./admin-job-payments.controller";
import { JobPaymentsService } from "./job-payments.service";
import { RefundsService } from "./refunds.service";
import { DisputesService } from "./disputes.service";
import { BankDisputesService } from "./bank-disputes.service";

@Module({
  imports: [AuthModule, AuditLogModule, PlatformFeeRulesModule, AdminModule, OnlineMoneyModule],
  controllers: [JobPaymentsController, ProfessionalOnlinePaymentsController, AdminJobPaymentsController],
  providers: [JobPaymentsService, RefundsService, DisputesService, BankDisputesService],
  exports: [JobPaymentsService, RefundsService, DisputesService],
})
export class JobPaymentsModule {}

import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AdminProblemMatchController, ProblemMatchController, ServiceNamesController } from "./problem-match.controller";
import { ProblemMatchService } from "./problem-match.service";
import { ProblemMatchAdminService } from "./problem-match-admin.service";
import { ProblemTakeoverService } from "./problem-takeover.service";
import { ServiceNamesModule } from "./service-names.module";

@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, ServiceNamesModule],
  controllers: [ProblemMatchController, ServiceNamesController, AdminProblemMatchController],
  providers: [ProblemMatchService, ProblemMatchAdminService, ProblemTakeoverService],
  exports: [ServiceNamesModule],
})
export class ProblemMatchModule {}

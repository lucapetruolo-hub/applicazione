import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AdminProblemMatchController, ProblemMatchController, ServiceNamesController } from "./problem-match.controller";
import { ProblemMatchService } from "./problem-match.service";
import { ProblemMatchAdminService } from "./problem-match-admin.service";
import { ProblemTakeoverService } from "./problem-takeover.service";
import { ServiceNamesService } from "./service-names.service";

@Module({
  imports: [AuthModule, AdminModule, AuditLogModule],
  controllers: [ProblemMatchController, ServiceNamesController, AdminProblemMatchController],
  providers: [ProblemMatchService, ProblemMatchAdminService, ProblemTakeoverService, ServiceNamesService],
  exports: [ServiceNamesService],
})
export class ProblemMatchModule {}

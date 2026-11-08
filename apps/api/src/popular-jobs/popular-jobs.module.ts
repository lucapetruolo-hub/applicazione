import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AdminPopularJobsController, PopularJobsController } from "./popular-jobs.controller";
import { PopularJobsService } from "./popular-jobs.service";

@Module({
  imports: [AuthModule, AdminModule, AuditLogModule],
  controllers: [PopularJobsController, AdminPopularJobsController],
  providers: [PopularJobsService],
})
export class PopularJobsModule {}

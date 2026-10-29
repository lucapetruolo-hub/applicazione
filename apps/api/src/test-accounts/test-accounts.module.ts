import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AdminTestAccountsController } from "./test-accounts.controller";
import { TestAccountsService } from "./test-accounts.service";
import { TestTimeService } from "./test-time.service";

/** A parte da AdminModule: serve SubscriptionsService, che importa già AdminModule. */
@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, SubscriptionsModule],
  controllers: [AdminTestAccountsController],
  providers: [TestAccountsService, TestTimeService],
})
export class TestAccountsModule {}

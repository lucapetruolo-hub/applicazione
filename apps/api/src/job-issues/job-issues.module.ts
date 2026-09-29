import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { TimelineModule } from "../timeline/timeline.module";
import { GuidedRequestsModule } from "../guided-requests/guided-requests.module";
import { OnlineMoneyModule } from "../job-payments/online-money.module";
import { JobIssueOutcomeService } from "./job-issue-outcome.service";

/** Controversie standard (docs/CHANGELOG.md §167), usato da prenotazioni e area admin. */
@Module({
  imports: [NotificationsModule, ProfessionalMetricsModule, AuditLogModule, TimelineModule, GuidedRequestsModule, OnlineMoneyModule],
  providers: [JobIssueOutcomeService],
  exports: [JobIssueOutcomeService],
})
export class JobIssuesModule {}

import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { TimelineModule } from "../timeline/timeline.module";
import { JobPaymentsModule } from "../job-payments/job-payments.module";
import { JobIssuesModule } from "../job-issues/job-issues.module";
import { ClientInvoiceRequestsModule } from "../client-invoice-requests/client-invoice-requests.module";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { CompletionDeadlineService } from "./completion-deadline.service";
import { ReviewReminderService } from "./review-reminder.service";
import { MissedDepositsService } from "./missed-deposits.service";
import { RecurringJobsService } from "./recurring-jobs.service";

@Module({
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule, TimelineModule, JobPaymentsModule, SubscriptionsModule, JobIssuesModule, ClientInvoiceRequestsModule],
  controllers: [BookingsController],
  providers: [BookingsService, CompletionDeadlineService, ReviewReminderService, MissedDepositsService, RecurringJobsService],
  // Il webhook Stripe (BillingService) conferma il lavoro quando arriva l'acconto (docs/CHANGELOG.md §240).
  exports: [BookingsService],
})
export class BookingsModule {}

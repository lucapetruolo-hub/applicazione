import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuthModule } from "../auth/auth.module";
import { BookingsModule } from "../bookings/bookings.module";
import { JobPaymentsModule } from "../job-payments/job-payments.module";
import { ProfessionalFiscalModule } from "../professional-fiscal/professional-fiscal.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { SiteCountsModule } from "../site-counts/site-counts.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  // JobPaymentsModule/ProfessionalFiscalModule: lo stesso webhook Stripe
  // già in uso per abbonamenti/lead/boost (CLAUDE.md §9) gestisce ora anche
  // la conferma di un pagamento MANOVIA del lavoro e la sincronizzazione
  // dello stato Stripe Connect (CLAUDE.md §88) — un solo endpoint webhook,
  // mai due paralleli sullo stesso account Stripe.
  // AccountingModule: le nostre fatture per abbonamenti, passaggi e visibilità (§378).
  imports: [AuthModule, BookingsModule, JobPaymentsModule, ProfessionalFiscalModule, SubscriptionsModule, SiteCountsModule, AccountingModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}

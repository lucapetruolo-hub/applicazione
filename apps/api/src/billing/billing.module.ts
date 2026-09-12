import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobPaymentsModule } from "../job-payments/job-payments.module";
import { ProfessionalFiscalModule } from "../professional-fiscal/professional-fiscal.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  // JobPaymentsModule/ProfessionalFiscalModule: lo stesso webhook Stripe
  // già in uso per abbonamenti/lead/boost (CLAUDE.md §9) gestisce ora anche
  // la conferma di un pagamento MANOVIA del lavoro e la sincronizzazione
  // dello stato Stripe Connect (CLAUDE.md §88) — un solo endpoint webhook,
  // mai due paralleli sullo stesso account Stripe.
  imports: [AuthModule, JobPaymentsModule, ProfessionalFiscalModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}

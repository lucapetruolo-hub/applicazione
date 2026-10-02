import { Controller, Get } from "@nestjs/common";
import { onlinePaymentsEnabled } from "../job-payments/online-payments-enabled";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }

  /**
   * Funzioni attive su questo ambiente, lette dal sito per non promettere ciò
   * che non funziona (docs/CHANGELOG.md §169): senza chiave Stripe il
   * pagamento online dei lavori non viene offerto.
   */
  @Get("features")
  features() {
    return { onlinePayments: onlinePaymentsEnabled() };
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { CronExpression } from "@nestjs/schedule";
import { ScheduledJob } from "../common/scheduled-job";
import { opsAlert } from "../common/ops-alert";
import { BookingsService } from "./bookings.service";

/**
 * Ogni ora: acconti del preventivo pagati senza che il lavoro sia nato
 * (collaudo 08/11, E3-06). Di solito il lavoro nasce col webhook di Stripe o
 * al ritorno del cliente sul sito; questo giro copre il caso in cui mancano
 * entrambi (per esempio l'evento non spuntato sull'endpoint Connect dopo il
 * cambio delle chiavi).
 */
@Injectable()
export class MissedDepositsService {
  private readonly logger = new Logger(MissedDepositsService.name);

  constructor(private readonly bookingsService: BookingsService) {}

  // Un solo giro anche con due API accese durante un deploy (CLAUDE.md, attività a orario).
  @ScheduledJob(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    const confirmed = await this.bookingsService.confirmMissedQuoteDeposits();
    // Se succede, l'avviso di Stripe non arriva: va controllato l'endpoint Connect.
    if (confirmed === 0) return;
    const message = `${confirmed} lavori con l'acconto pagato confermati senza il webhook di Stripe: controllare l'endpoint Connect.`;
    this.logger.error(message);
    opsAlert("quote-deposit-webhook-missed", message);
  }
}

import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import { formatEurCents, isAccountingMonth, type FeeReconciliation } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { previousMonth, romeMonthOf, romeMonthRange } from "./accounting-dates";
import { InvoicesService } from "./invoices.service";

/** Differenza oltre la quale l'admin riceve l'avviso: 1 €. */
const TOLERANCE_EUR_CENTS = 100;

/**
 * Quadratura del mese (docs/CHANGELOG.md §372): le trattenute del nostro
 * registro, che finiscono nelle fatture, contro quelle che Stripe ha davvero
 * incassato e restituito; e il costo vero delle carte che Stripe ci addebita
 * contro la nostra stima (con l'addebito diretto Stripe non lo dà per
 * pagamento). Se qualcosa non torna, avviso agli admin di Finanza prima che
 * le fatture girino al commercialista.
 */
@Injectable()
export class FeeReconciliationService {
  private readonly logger = new Logger(FeeReconciliationService.name);
  private readonly stripe: Stripe | null = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly invoicesService: InvoicesService,
  ) {}

  async reconcile(month: string): Promise<FeeReconciliation> {
    if (!isAccountingMonth(month)) throw new BadRequestException("Mese non valido.");
    const { start, end } = romeMonthRange(month);
    const entries = await this.prisma.platformFeeEntry.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      select: { kind: true, grossEurCents: true, cardFeeEurCents: true, dedupeKey: true },
    });
    const ledger = { holdsEurCents: 0, returnsEurCents: 0, costsEurCents: 0, cardFeesEurCents: 0 };
    let applicationFeeHolds = 0;
    for (const e of entries) {
      if (e.kind === "HOLD") {
        ledger.holdsEurCents += e.grossEurCents;
        ledger.cardFeesEurCents += e.cardFeeEurCents;
        // Solo quelle prese come application fee: col vecchio modello la trattenuta resta nel bonifico.
        if (e.dedupeKey?.startsWith("HOLD:")) applicationFeeHolds += e.grossEurCents;
      } else if (e.kind === "RETURN") ledger.returnsEurCents += -e.grossEurCents;
      else ledger.costsEurCents += e.grossEurCents;
    }

    const stripe = this.stripe ? await this.stripeTotals(start, end) : null;
    const alerts: string[] = [];
    if (stripe) {
      if (Math.abs(stripe.applicationFeesEurCents - applicationFeeHolds) > TOLERANCE_EUR_CENTS) {
        alerts.push(`Trattenute incassate: Stripe ${formatEurCents(stripe.applicationFeesEurCents)}, nostro registro ${formatEurCents(applicationFeeHolds)}.`);
      }
      if (Math.abs(stripe.applicationFeeRefundsEurCents - ledger.returnsEurCents) > TOLERANCE_EUR_CENTS) {
        alerts.push(`Trattenute restituite: Stripe ${formatEurCents(stripe.applicationFeeRefundsEurCents)}, nostro registro ${formatEurCents(ledger.returnsEurCents)}.`);
      }
      if (stripe.stripeFeesEurCents > ledger.cardFeesEurCents * 1.1 + TOLERANCE_EUR_CENTS) {
        alerts.push(`Costi addebitati da Stripe ${formatEurCents(stripe.stripeFeesEurCents)}, più della stima delle carte (${formatEurCents(ledger.cardFeesEurCents)}): conviene ricontrollare la trattenuta.`);
      }
    }
    return { month, ledger, stripe, alerts };
  }

  /** Movimenti del conto della piattaforma nel mese, per tipo. */
  private async stripeTotals(start: Date, end: Date): Promise<NonNullable<FeeReconciliation["stripe"]>> {
    const totals = { applicationFeesEurCents: 0, applicationFeeRefundsEurCents: 0, stripeFeesEurCents: 0 };
    const created = { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) };
    for await (const bt of this.stripe!.balanceTransactions.list({ created, limit: 100 })) {
      if (bt.type === "application_fee") totals.applicationFeesEurCents += bt.amount;
      else if (bt.type === "application_fee_refund") totals.applicationFeeRefundsEurCents += -bt.amount;
      else if (bt.type === "stripe_fee") totals.stripeFeesEurCents += -bt.amount;
    }
    return totals;
  }

  /** Il 1° del mese alle 7:30, dopo le fatture: avviso se il mese prima non torna. */
  @Cron("30 7 1 * *", { timeZone: "Europe/Rome" })
  async runMonthly(now: Date = new Date()): Promise<void> {
    const month = previousMonth(romeMonthOf(now));
    try {
      const result = await this.reconcile(month);
      if (result.alerts.length > 0) await this.invoicesService.notifyFinanceAdmins("ADMIN_FEE_RECONCILIATION", { month, alerts: result.alerts });
    } catch (err) {
      this.logger.error(`Quadratura di ${month} non riuscita: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

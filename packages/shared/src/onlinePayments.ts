import { z } from "zod";

/**
 * Pagamento dei lavori (decisioni dell'utente del 29/09/2026,
 * docs/CHANGELOG.md §168). Accettando un preventivo il cliente sceglie come
 * pagare:
 * - **online con Stripe**: acconto del 20% dell'importo massimo del
 *   preventivo subito, saldo a lavoro chiuso sull'importo finale. Manovia
 *   tiene i soldi e li passa al professionista quando il cliente conferma il
 *   lavoro, o 7 giorni dopo la chiusura se il cliente non segnala nulla; con
 *   una segnalazione aperta restano fermi. Al professionista arriva l'importo
 *   meno il costo di Stripe e la commissione Manovia (5%). Se c'è un
 *   problema il cliente ha la nostra assistenza e, se la segnalazione è
 *   accolta, il rimborso;
 * - **direttamente al professionista**: nessun rimborso e nessuna decisione
 *   del nostro team. In caso di problema mettiamo in contatto cliente e
 *   professionista, che si accordano tra loro; in ogni caso il cliente può
 *   lasciare la recensione.
 */

export const jobPaymentChoices = ["ONLINE", "DIRECT"] as const;
export type JobPaymentChoice = (typeof jobPaymentChoices)[number];

/** Acconto: percentuale dell'importo massimo del preventivo (decisione dell'utente). */
export const ONLINE_DEPOSIT_PERCENT = 20;
/** Giorni dopo la chiusura del lavoro in cui i soldi passano al professionista se il cliente non conferma né segnala. */
export const ONLINE_RELEASE_DAYS = 7;
/** Commissione Manovia sui pagamenti online, a carico del professionista (valore reale nelle regole di commissione in admin). */
export const ONLINE_APP_FEE_PERCENT = 5;

export type JobPaymentOnlineStage = "AWAITING_DEPOSIT" | "DEPOSIT_PAID" | "AWAITING_BALANCE" | "PAID" | "RELEASED" | "REFUNDED";

export const JOB_PAYMENT_CHOICE_COPY: Record<JobPaymentChoice, { title: string; body: string }> = {
  ONLINE: {
    title: "Paga online con carta (consigliato)",
    body: `Paghi con Stripe: un acconto del ${ONLINE_DEPOSIT_PERCENT}% ora e il saldo a lavoro finito. Teniamo noi i soldi finché non confermi che il lavoro è fatto: se qualcosa va storto ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo.`,
  },
  DIRECT: {
    title: "Pago direttamente il professionista",
    body: "Paghi il professionista come vi accordate (contanti, bonifico...). Eventuali problemi vanno risolti direttamente con lui: possiamo solo mettervi in contatto, non rimborsiamo e non decidiamo sulle contestazioni.",
  },
};

export const JOB_PAYMENT_STAGE_LABEL: Record<JobPaymentOnlineStage, string> = {
  AWAITING_DEPOSIT: "Acconto da pagare",
  DEPOSIT_PAID: "Acconto pagato",
  AWAITING_BALANCE: "Saldo da pagare",
  PAID: "Pagato, in custodia fino alla conferma",
  RELEASED: "Pagamento passato al professionista",
  REFUNDED: "Rimborsato",
};

/** Acconto sull'importo massimo del preventivo, arrotondato al centesimo. */
export function onlineDepositEurCents(quoteMaxEurCents: number): number {
  return Math.round((quoteMaxEurCents * ONLINE_DEPOSIT_PERCENT) / 100);
}

/** Quanto resta da pagare a lavoro chiuso (0 se l'acconto copre già l'importo finale). */
export function onlineBalanceDueEurCents(finalAmountEurCents: number, paidEurCents: number): number {
  return Math.max(0, finalAmountEurCents - paidEurCents);
}

/**
 * Quanto passa al professionista: il dovuto (importo finale, o quanto
 * pagato se il cliente non ha saldato) meno il costo di Stripe e la
 * commissione. La differenza pagata in più dal cliente gli torna indietro.
 */
export function onlinePayoutEurCents(input: {
  finalAmountEurCents: number;
  paidEurCents: number;
  refundedEurCents: number;
  stripeFeeEurCents: number;
  appFeeEurCents: number;
}): { payout: number; refundToClient: number } {
  const collected = input.paidEurCents - input.refundedEurCents;
  const due = Math.min(input.finalAmountEurCents, collected);
  const refundToClient = Math.max(0, collected - input.finalAmountEurCents);
  const payout = Math.max(0, due - input.stripeFeeEurCents - input.appFeeEurCents);
  return { payout, refundToClient };
}

/** I soldi possono passare al professionista adesso? */
export function onlineCanRelease(input: {
  stage: JobPaymentOnlineStage | null;
  professionalCompletedAt: Date | null;
  clientConfirmedAt: Date | null;
  releaseDueAt: Date | null;
  issueOpen: boolean;
  now: Date;
}): boolean {
  if (input.stage !== "PAID" && input.stage !== "AWAITING_BALANCE") return false;
  if (!input.professionalCompletedAt || input.issueOpen) return false;
  if (input.stage === "PAID" && input.clientConfirmedAt) return true;
  return !!input.releaseDueAt && input.now.getTime() >= input.releaseDueAt.getTime();
}

/** Riepilogo del pagamento di un lavoro, uguale per cliente e professionista. */
export type JobPaymentSummary = {
  method: JobPaymentChoice;
  stage: JobPaymentOnlineStage | null;
  depositEurCents: number | null;
  paidEurCents: number;
  refundedEurCents: number;
  /** Importo finale (null finché il professionista non chiude il lavoro). */
  finalAmountEurCents: number | null;
  balanceDueEurCents: number;
  releaseDueAt: string | null;
  releasedAt: string | null;
  balanceUnpaid: boolean;
  /** Solo per il professionista: commissione e costo Stripe trattenuti, e quanto riceve. */
  appFeeEurCents?: number;
  stripeFeeEurCents?: number;
  payoutEurCents?: number;
};

/** Accettazione di un preventivo con il metodo di pagamento scelto. */
export const acceptQuoteSchema = z.object({
  paymentMethod: z.enum(jobPaymentChoices).default("DIRECT"),
});
export type AcceptQuoteInput = z.infer<typeof acceptQuoteSchema>;

type JobPaymentRow = {
  paymentMethod: string;
  onlineStage: string | null;
  depositEurCents: number | null;
  paidEurCents: number;
  refundedEurCents: number;
  platformFeeEurCents: number;
  stripeFeeEurCents: number;
  netAmountEurCents: number;
  releaseDueAt: Date | null;
  releasedAt: Date | null;
  balanceUnpaidAt: Date | null;
};

/** Riepilogo del pagamento; con `forProfessional` anche commissione, costo Stripe e quanto riceve. */
export function toJobPaymentSummary(
  jp: JobPaymentRow | null,
  finalAmountEurCents: number | null,
  forProfessional = false,
): JobPaymentSummary | null {
  if (!jp) return null;
  const method: JobPaymentChoice = jp.paymentMethod === "MANOVIA" ? "ONLINE" : "DIRECT";
  const stage = method === "ONLINE" ? ((jp.onlineStage as JobPaymentOnlineStage | null) ?? null) : null;
  const collected = jp.paidEurCents - jp.refundedEurCents;
  const summary: JobPaymentSummary = {
    method,
    stage,
    depositEurCents: jp.depositEurCents,
    paidEurCents: jp.paidEurCents,
    refundedEurCents: jp.refundedEurCents,
    finalAmountEurCents,
    balanceDueEurCents:
      method === "ONLINE" && finalAmountEurCents !== null && stage !== "REFUNDED" && (stage !== "RELEASED" || !!jp.balanceUnpaidAt)
        ? onlineBalanceDueEurCents(finalAmountEurCents, collected)
        : 0,
    releaseDueAt: jp.releaseDueAt?.toISOString() ?? null,
    releasedAt: jp.releasedAt?.toISOString() ?? null,
    balanceUnpaid: !!jp.balanceUnpaidAt,
  };
  if (forProfessional && method === "ONLINE") {
    const base = finalAmountEurCents ?? collected;
    const appFee = stage === "RELEASED" ? jp.platformFeeEurCents : jp.platformFeeEurCents || Math.round((base * ONLINE_APP_FEE_PERCENT) / 100);
    summary.appFeeEurCents = appFee;
    summary.stripeFeeEurCents = jp.stripeFeeEurCents;
    summary.payoutEurCents = stage === "RELEASED" ? jp.netAmountEurCents : Math.max(0, base - appFee - jp.stripeFeeEurCents);
  }
  return summary;
}

/** Chiusura di un saldo scoperto da parte della Finanza, con la motivazione. */
export const closeUnpaidBalanceSchema = z.object({ note: z.string().trim().min(3, "Scrivi come si è chiuso il saldo.").max(500) });

export type AdminUnpaidBalance = {
  jobPaymentId: string;
  bookingId: string;
  balanceUnpaidAt: string;
  finalAmountEurCents: number | null;
  paidEurCents: number;
  dueEurCents: number;
  client: { userId: string; name: string | null; email: string };
  professional: { userId: string; businessName: string };
};

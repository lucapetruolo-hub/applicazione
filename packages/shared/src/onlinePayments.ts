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

/**
 * Modi di pagamento che il professionista offre nel preventivo e tra cui il
 * cliente sceglie accettandolo (decisione dell'utente del 13/10/2026,
 * docs/CHANGELOG.md §237): il professionista ne spunta uno o più.
 * - `DIRECT`: tutto direttamente al professionista;
 * - `ONLINE`: acconto online (percentuale scelta dal professionista) e saldo online;
 * - `MIXED`: acconto online e saldo direttamente al professionista.
 */
export const jobPaymentChoices = ["ONLINE", "MIXED", "DIRECT"] as const;
export type JobPaymentChoice = (typeof jobPaymentChoices)[number];

/** Acconto predefinito: percentuale dell'importo massimo del preventivo (decisione dell'utente, §168). */
export const ONLINE_DEPOSIT_PERCENT = 20;
export const MIN_DEPOSIT_PERCENT = 1;
export const MAX_DEPOSIT_PERCENT = 100;

/** Modi di pagamento offerti di serie: i preventivi inviati prima di §237 non li hanno salvati. */
export const DEFAULT_QUOTE_PAYMENT_OPTIONS: JobPaymentChoice[] = ["ONLINE", "DIRECT"];

/** Modi offerti da un preventivo e percentuale dell'acconto, con i valori di serie per i preventivi vecchi. */
export function quotePaymentOffer(quote: { paymentOptions?: string[] | null; depositPercent?: number | null }): {
  paymentOptions: JobPaymentChoice[];
  depositPercent: number;
} {
  const saved = (quote.paymentOptions ?? []).filter((o): o is JobPaymentChoice => (jobPaymentChoices as readonly string[]).includes(o));
  return {
    // Ordine fisso, qualunque sia quello salvato.
    paymentOptions: saved.length ? jobPaymentChoices.filter((o) => saved.includes(o)) : DEFAULT_QUOTE_PAYMENT_OPTIONS,
    depositPercent: quote.depositPercent ?? ONLINE_DEPOSIT_PERCENT,
  };
}

/**
 * Modi che il cliente può davvero scegliere (docs/CHANGELOG.md §241): senza
 * la verifica su Stripe del professionista l'acconto online sparisce. Se
 * restasse vuoto si mostra l'offerta com'è e l'accettazione spiega il perché.
 */
export function clientPaymentOffer(quote: { paymentOptions?: string[] | null; depositPercent?: number | null }, professionalStripeVerified: boolean) {
  const offer = quotePaymentOffer(quote);
  if (professionalStripeVerified) return offer;
  const direct = offer.paymentOptions.filter((choice) => !paymentChoiceIsOnline(choice));
  return direct.length ? { ...offer, paymentOptions: direct } : offer;
}

/** Modi di pagamento offerti in una riga, per cronologia ed email (es. "tutto diretto; acconto online e saldo diretto, acconto 30%"). */
export function describePaymentOffer(offer: { paymentOptions: JobPaymentChoice[]; depositPercent: number }): string {
  const list = offer.paymentOptions.map((choice) => QUOTE_PAYMENT_OPTION_LABEL[choice].toLowerCase()).join("; ");
  return offer.paymentOptions.some(paymentChoiceIsOnline) ? `${list} (acconto online ${offer.depositPercent}%)` : list;
}

/** Due offerte di pagamento sono diverse? La percentuale conta solo se c'è un modo online. */
export function paymentOfferChanged(a: { paymentOptions: JobPaymentChoice[]; depositPercent: number }, b: { paymentOptions: JobPaymentChoice[]; depositPercent: number }): boolean {
  if (a.paymentOptions.join() !== b.paymentOptions.join()) return true;
  return a.paymentOptions.some(paymentChoiceIsOnline) && a.depositPercent !== b.depositPercent;
}

/** "le voci, le note e i modi di pagamento": cosa è cambiato in un preventivo, senza la data. */
export function quoteChangeWhat(change: { itemsChanged: boolean; notesChanged: boolean; paymentChanged?: boolean }): string | null {
  const parts = [change.itemsChanged && "le voci", change.notesChanged && "le note", change.paymentChanged && "i modi di pagamento"].filter((p): p is string => !!p);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Il modo di pagamento passa da Stripe (acconto online)? */
export function paymentChoiceIsOnline(choice: JobPaymentChoice): boolean {
  return choice === "ONLINE" || choice === "MIXED";
}
/** Giorni dopo la chiusura del lavoro in cui i soldi passano al professionista se il cliente non conferma né segnala. */
export const ONLINE_RELEASE_DAYS = 7;
/** Commissione Manovia sui pagamenti online, a carico del professionista (valore reale nelle regole di commissione in admin). */
export const ONLINE_APP_FEE_PERCENT = 5;

export type JobPaymentOnlineStage = "AWAITING_DEPOSIT" | "DEPOSIT_PAID" | "AWAITING_BALANCE" | "PAID" | "RELEASED" | "REFUNDED";

/** Testi per il cliente; la percentuale dell'acconto è quella scelta dal professionista nel preventivo. */
export function jobPaymentChoiceCopy(choice: JobPaymentChoice, depositPercent: number = ONLINE_DEPOSIT_PERCENT): { title: string; body?: string } {
  if (choice === "ONLINE") {
    return {
      title: depositPercent >= 100 ? "Tutto online con carta (consigliato)" : "Paga online con carta (consigliato)",
      body:
        depositPercent >= 100
          ? "Paghi con Stripe l'intero importo ora: il lavoro è confermato appena il pagamento va a buon fine. Teniamo noi i soldi finché non confermi che il lavoro è fatto: se qualcosa va storto ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo."
          : `Paghi con Stripe: un acconto del ${depositPercent}% ora, che conferma il lavoro, e il saldo a lavoro finito. Teniamo noi i soldi finché non confermi che il lavoro è fatto: se qualcosa va storto ti assistiamo e, se la segnalazione è accolta, ti rimborsiamo.`,
    };
  }
  if (choice === "MIXED") {
    return {
      title: "Acconto online, saldo diretto al professionista",
      body: `Paghi con Stripe un acconto del ${depositPercent}% ora, che conferma il lavoro; il resto lo paghi direttamente al professionista a lavoro finito. Assistenza e rimborso valgono solo per l'acconto pagato online.`,
    };
  }
  // Una riga sola, senza spiegazioni (richiesta esplicita dell'utente).
  return { title: "DIRETTO al professionista" };
}

/** Testi per il professionista nel modulo del preventivo. */
export const QUOTE_PAYMENT_OPTION_LABEL: Record<JobPaymentChoice, string> = {
  DIRECT: "Tutto diretto (contanti, bonifico...)",
  ONLINE: "Acconto online e saldo online",
  MIXED: "Acconto online e saldo diretto",
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
export function onlineDepositEurCents(quoteMaxEurCents: number, depositPercent: number = ONLINE_DEPOSIT_PERCENT): number {
  return Math.round((quoteMaxEurCents * depositPercent) / 100);
}

/**
 * Parte dell'importo finale che passa da Stripe. Col saldo diretto
 * (`MIXED`) è solo l'acconto, al massimo l'importo finale: il resto il
 * cliente lo paga al professionista fuori dal sito.
 */
export function onlineTargetEurCents(finalAmountEurCents: number, jp: { balanceDirect: boolean; depositEurCents: number | null }): number {
  return jp.balanceDirect ? Math.min(finalAmountEurCents, jp.depositEurCents ?? 0) : finalAmountEurCents;
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
  /** ONLINE anche con saldo diretto: l'acconto passa comunque da Stripe (vedi `balanceDirect`). */
  method: "ONLINE" | "DIRECT";
  /** Acconto online e saldo pagato direttamente al professionista (§237). */
  balanceDirect: boolean;
  /** Col saldo diretto: quanto il cliente paga direttamente al professionista (null finché l'importo finale non è noto). */
  directBalanceEurCents: number | null;
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

/** Modi di pagamento scelti dal professionista nel preventivo (§237). */
export const quotePaymentOfferSchema = {
  paymentOptions: z.array(z.enum(jobPaymentChoices)).min(1, "Scegli almeno un modo di pagamento.").max(jobPaymentChoices.length).optional(),
  depositPercent: z
    .number()
    .int("La percentuale dell'acconto dev'essere un numero intero.")
    .min(MIN_DEPOSIT_PERCENT, `L'acconto va da ${MIN_DEPOSIT_PERCENT} a ${MAX_DEPOSIT_PERCENT}%.`)
    .max(MAX_DEPOSIT_PERCENT, `L'acconto va da ${MIN_DEPOSIT_PERCENT} a ${MAX_DEPOSIT_PERCENT}%.`)
    .optional(),
  /** Salva questi modi come proposta di serie per i prossimi preventivi (§239). */
  rememberPaymentOffer: z.boolean().optional(),
};
export type AcceptQuoteInput = z.infer<typeof acceptQuoteSchema>;

type JobPaymentRow = {
  paymentMethod: string;
  balanceDirect: boolean;
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
  const method = jp.paymentMethod === "MANOVIA" ? "ONLINE" : "DIRECT";
  const stage = method === "ONLINE" ? ((jp.onlineStage as JobPaymentOnlineStage | null) ?? null) : null;
  const collected = jp.paidEurCents - jp.refundedEurCents;
  const balanceDirect = method === "ONLINE" && jp.balanceDirect;
  const onlineTarget = finalAmountEurCents === null ? null : onlineTargetEurCents(finalAmountEurCents, { balanceDirect, depositEurCents: jp.depositEurCents });
  const summary: JobPaymentSummary = {
    method,
    balanceDirect,
    directBalanceEurCents: balanceDirect && finalAmountEurCents !== null && onlineTarget !== null ? finalAmountEurCents - onlineTarget : null,
    stage,
    depositEurCents: jp.depositEurCents,
    paidEurCents: jp.paidEurCents,
    refundedEurCents: jp.refundedEurCents,
    finalAmountEurCents,
    balanceDueEurCents:
      method === "ONLINE" && onlineTarget !== null && stage !== "REFUNDED" && (stage !== "RELEASED" || !!jp.balanceUnpaidAt)
        ? onlineBalanceDueEurCents(onlineTarget, collected)
        : 0,
    releaseDueAt: jp.releaseDueAt?.toISOString() ?? null,
    releasedAt: jp.releasedAt?.toISOString() ?? null,
    balanceUnpaid: !!jp.balanceUnpaidAt,
  };
  if (forProfessional && method === "ONLINE") {
    const base = onlineTarget ?? collected;
    const appFee = stage === "RELEASED" ? jp.platformFeeEurCents : jp.platformFeeEurCents || Math.round((base * ONLINE_APP_FEE_PERCENT) / 100);
    summary.appFeeEurCents = appFee;
    summary.stripeFeeEurCents = jp.stripeFeeEurCents;
    summary.payoutEurCents = stage === "RELEASED" ? jp.netAmountEurCents : Math.max(0, base - appFee - jp.stripeFeeEurCents);
  }
  return summary;
}

/** Come è stato pagato un lavoro, in una riga per l'area admin (docs/CHANGELOG.md §239). */
export function jobPaymentAdminLabel(summary: JobPaymentSummary | null): string {
  if (!summary || summary.method === "DIRECT") return "Pagamento diretto al professionista";
  const eur = (cents: number) => `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
  const online = `pagato online ${eur(summary.paidEurCents)}${summary.refundedEurCents > 0 ? `, rimborsato ${eur(summary.refundedEurCents)}` : ""}`;
  const stage = summary.stage ? `, ${JOB_PAYMENT_STAGE_LABEL[summary.stage].toLowerCase()}` : "";
  if (summary.balanceDirect) {
    const direct = summary.directBalanceEurCents !== null ? ` ${eur(summary.directBalanceEurCents)}` : "";
    return `Acconto online e saldo diretto: ${online}${stage}; saldo diretto${direct}`;
  }
  return `Online con Stripe: ${online}${stage}`;
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

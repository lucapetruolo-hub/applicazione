import { formatEurCents } from "./professionals";
import { BANK_DISPUTE_OPEN_STATUSES, BANK_DISPUTE_REVIEW_STATUSES, type ProfessionalBankDispute } from "./bankDisputes";

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
  const depositPercent = quote.depositPercent ?? ONLINE_DEPOSIT_PERCENT;
  const saved = (quote.paymentOptions ?? [])
    .filter((o): o is JobPaymentChoice => (jobPaymentChoices as readonly string[]).includes(o))
    // Con l'acconto al 100% "acconto online, saldo diretto" è lo stesso che
    // "tutto online": si offre solo quello (richiesta di Luca,
    // docs/changelog/2026-11-13-annullare-data-passata.md).
    .map((o) => (o === "MIXED" && depositPercent >= 100 ? "ONLINE" : o));
  return {
    // Ordine fisso, qualunque sia quello salvato.
    paymentOptions: saved.length ? jobPaymentChoices.filter((o) => saved.includes(o)) : DEFAULT_QUOTE_PAYMENT_OPTIONS,
    depositPercent,
  };
}

/**
 * Modi che il cliente può davvero scegliere (docs/CHANGELOG.md §241): senza
 * la verifica su Stripe del professionista l'acconto online sparisce. Se
 * restasse vuoto si mostra l'offerta com'è e l'accettazione spiega il perché.
 */
export function clientPaymentOffer(
  quote: { paymentOptions?: string[] | null; depositPercent?: number | null },
  professionalStripeVerified: boolean,
  /** Importo massimo del preventivo: sotto il minimo di Stripe l'acconto online sparisce (collaudo I-01). */
  totalMaxEurCents?: number,
) {
  const offer = quotePaymentOffer(quote);
  const tooLow = totalMaxEurCents !== undefined && onlineDepositEurCents(totalMaxEurCents, offer.depositPercent) < ONLINE_MIN_CHARGE_EUR_CENTS;
  if (professionalStripeVerified && !tooLow) return offer;
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
/**
 * Avviso a chi paga online tutto il massimo accettando (collaudo P-02): sa
 * subito che i soldi restano fermi e che la differenza gli torna.
 */
export const UPFRONT_PAYMENT_NOTE =
  // La differenza che torna sulla carta la dice la riga con le cifre, solo con la forbice di prezzo (docs/changelog/2026-11-13-annullare-data-passata.md).
  "Paghi tutto adesso. I soldi restano fermi finché confermi che il lavoro è fatto.";

/** Giorni dopo la chiusura del lavoro in cui i soldi passano al professionista se il cliente non conferma né segnala. */
export const ONLINE_RELEASE_DAYS = 7;
/**
 * Trattenuta unica sui pagamenti online, IVA esclusa, a carico del
 * professionista (decisione dell'utente del 27/10/2026, docs/CHANGELOG.md
 * §378): tutto compreso, carta e bonifici di Stripe li paghiamo noi. Prima
 * era il 5% più i costi di Stripe. Il valore reale è nelle regole di
 * commissione in admin; questo è quello di partenza e della trattenuta al
 * pagamento.
 */
export const ONLINE_APP_FEE_PERCENT = 7;
/** IVA della trattenuta (22%), come in `accounting.ts`. */
const ONLINE_FEE_VAT_BASIS_POINTS = 2200;
/**
 * Costo massimo della carta su Stripe (carte extra europee, 3,25% + €0,25):
 * solo per le stime, non è più a carico del professionista (§378).
 */
export const ONLINE_CARD_FEE_MAX_BASIS_POINTS = 325;
export const ONLINE_CARD_FEE_MAX_FIXED_EUR_CENTS = 25;

/** Trattenuta con l'IVA su un importo: imponibile arrotondato al centesimo più la sua IVA (7% + IVA = 8,54%). */
export function onlineFeeWithVatEurCents(amountEurCents: number, basisPoints: number = ONLINE_APP_FEE_PERCENT * 100): number {
  if (amountEurCents <= 0) return 0;
  const taxable = Math.round((amountEurCents * basisPoints) / 10_000);
  return Math.min(amountEurCents, taxable + Math.round((taxable * ONLINE_FEE_VAT_BASIS_POINTS) / 10_000));
}

/** Percentuale effettiva con l'IVA, per i testi: "8,54%". */
export function onlineFeeWithVatPercentLabel(basisPoints: number = ONLINE_APP_FEE_PERCENT * 100): string {
  const percent = (basisPoints * (10_000 + ONLINE_FEE_VAT_BASIS_POINTS)) / 10_000 / 100;
  return `${percent.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
}

/** Esempio in euro della trattenuta, per i testi (Pagamenti, attivazione dei pagamenti online): 200 € se non indicato. */
export function onlineFeeExample(amountEurCents = 20_000): { amountEurCents: number; feeEurCents: number; taxableEurCents: number; vatEurCents: number; netEurCents: number } {
  const feeEurCents = onlineFeeWithVatEurCents(amountEurCents);
  const taxableEurCents = Math.round((amountEurCents * ONLINE_APP_FEE_PERCENT * 100) / 10_000);
  return { amountEurCents, feeEurCents, taxableEurCents, vatEurCents: feeEurCents - taxableEurCents, netEurCents: amountEurCents - feeEurCents };
}

/**
 * Trattenuta della piattaforma su un pagamento addebitato sul conto Stripe
 * del professionista (application fee, docs/CHANGELOG.md §249): dal §378 è
 * già quella definitiva, trattenuta unica con l'IVA. Se la regola in admin è
 * più bassa, la differenza torna al professionista allo sblocco.
 */
export function onlineApplicationFeeHoldEurCents(amountEurCents: number): number {
  return Math.max(0, onlineFeeWithVatEurCents(amountEurCents));
}

/**
 * Costo della carta stimato dal listino Stripe per l'Italia (§268). Con
 * l'addebito diretto sul conto del professionista Stripe fa pagare il costo
 * della carta alla piattaforma in blocco, senza il dettaglio per pagamento:
 * si stima dal tipo di carta. Carte europee "regolate" (consumatori) 1,5%,
 * le altre europee (aziendali, premium) 2,8%, del Regno Unito 2,5%, extra
 * europee 3,15%, sempre più €0,25. Mai oltre la trattenuta provvisoria.
 */
const EEA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
]);
export function estimatedCardFeeEurCents(amountEurCents: number, card: { country: string | null; regulatedStatus: string | null } | null): number {
  if (amountEurCents <= 0) return 0;
  const country = card?.country?.toUpperCase() ?? null;
  let basisPoints = ONLINE_CARD_FEE_MAX_BASIS_POINTS;
  if (country && EEA_COUNTRIES.has(country)) basisPoints = card?.regulatedStatus === "regulated" ? 150 : 280;
  else if (country === "GB") basisPoints = 250;
  else if (country) basisPoints = 315;
  return Math.ceil((amountEurCents * basisPoints) / 10_000) + ONLINE_CARD_FEE_MAX_FIXED_EUR_CENTS;
}

/**
 * Prelievo dal conto Stripe del professionista (account debit, §268): Stripe
 * fa pagare alla piattaforma l'1,4% di quanto preleva, a carico del
 * professionista. Restituisce quanto prelevare perché alla piattaforma
 * arrivi `amountEurCents`.
 */
export const CONNECT_ACCOUNT_DEBIT_FEE_BASIS_POINTS = 140;
export function accountDebitGrossEurCents(amountEurCents: number): number {
  if (amountEurCents <= 0) return 0;
  return Math.ceil((amountEurCents * 10_000) / (10_000 - CONNECT_ACCOUNT_DEBIT_FEE_BASIS_POINTS));
}

/**
 * Costi di Stripe Connect per i bonifici verso la banca dei professionisti
 * (listino Stripe per l'Italia): 0,25% + €0,10 per bonifico e €2 al mese per
 * ogni account che riceve almeno un bonifico in quel mese. Dal §378 sono
 * nostri, dentro la trattenuta unica (prima a carico del professionista,
 * §267): servono solo alla quadratura mensile dei costi.
 */
export const CONNECT_PAYOUT_FEE_BASIS_POINTS = 25;
export const CONNECT_PAYOUT_FEE_FIXED_EUR_CENTS = 10;
export const CONNECT_MONTHLY_ACCOUNT_FEE_EUR_CENTS = 200;

/** Costo Stripe di un bonifico verso la banca del professionista. */
export function connectPayoutFeeEurCents(payoutEurCents: number): number {
  if (payoutEurCents <= 0) return 0;
  return Math.ceil((payoutEurCents * CONNECT_PAYOUT_FEE_BASIS_POINTS) / 10_000) + CONNECT_PAYOUT_FEE_FIXED_EUR_CENTS;
}

/**
 * Bonifico verso la banca del professionista (docs/CHANGELOG.md §249):
 * - `BLOCKED`: soldi sul suo conto Stripe, bloccati fino alla conferma del cliente o ai 7 giorni;
 * - `WAITING_FUNDS`: sbloccati, il bonifico parte appena Stripe li rende disponibili;
 * - `SENT`: bonifico partito verso la banca;
 * - `PAID`: bonifico arrivato;
 * - `FAILED`: bonifico non riuscito (dati bancari da controllare), si riprova.
 */
export type JobPayoutStatus = "BLOCKED" | "WAITING_FUNDS" | "SENT" | "PAID" | "FAILED";

export type JobPaymentOnlineStage = "AWAITING_DEPOSIT" | "DEPOSIT_PAID" | "AWAITING_BALANCE" | "PAID" | "RELEASED" | "REFUNDED";

/** Testi per il cliente; la percentuale dell'acconto è quella scelta dal professionista nel preventivo. */
export function jobPaymentChoiceCopy(
  choice: JobPaymentChoice,
  depositPercent: number = ONLINE_DEPOSIT_PERCENT,
  /** Unico modo offerto: niente "(consigliato)", non c'è altro da confrontare. */
  only = false,
): { title: string; body?: string } {
  if (choice === "ONLINE") {
    const full = depositPercent >= 100;
    return {
      title: only ? (full ? "Tutto online con carta" : "Online con carta") : full ? "Tutto online con carta (consigliato)" : "Paga online con carta (consigliato)",
      body:
        depositPercent >= 100
          ? // Con una forbice di prezzo si paga il minimo (docs/changelog/2026-11-13-tutto-online-forbice.md).
            "Paghi ora con la carta. Se il prezzo va da un minimo a un massimo, ora paghi il minimo e il resto solo se serve, a lavoro finito. Il professionista riceve i soldi quando confermi il lavoro; se qualcosa va storto ti assistiamo noi."
          : `Paghi ora un acconto del ${depositPercent}%. Il resto lo paghi a lavoro finito, in automatico con la stessa carta. Il professionista riceve i soldi quando confermi il lavoro; se qualcosa va storto ti assistiamo noi.`,
    };
  }
  if (choice === "MIXED") {
    return {
      title: "Acconto online, saldo diretto al professionista",
      body: `Paghi ora un acconto del ${depositPercent}%, il resto direttamente al professionista a lavoro finito.`,
    };
  }
  // Una riga sola, senza spiegazioni (richiesta esplicita dell'utente, §228).
  return { title: only ? "Direttamente al professionista" : "Diretto al professionista" };
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
  PAID: "Pagato, bloccato fino alla conferma",
  RELEASED: "Sbloccato al professionista",
  REFUNDED: "Rimborsato",
};

/** Acconto sull'importo massimo del preventivo, arrotondato al centesimo. */
export function onlineDepositEurCents(quoteMaxEurCents: number, depositPercent: number = ONLINE_DEPOSIT_PERCENT): number {
  return Math.round((quoteMaxEurCents * depositPercent) / 100);
}

/**
 * Quanto si paga accettando il preventivo. Di solito la percentuale del
 * professionista sul prezzo massimo; con "tutto online" (100%) e una forbice
 * di prezzo si paga il prezzo minimo e il resto a lavoro finito con la stessa
 * carta, solo se serve (decisione di Luca del 13/11/2026,
 * docs/changelog/2026-11-13-tutto-online-forbice.md): prima si pagava il
 * massimo e la differenza tornava, ma Stripe non restituisce la sua
 * commissione sulla parte rimborsata e la pagava il professionista.
 */
export function quoteDepositEurCents(totals: { totalMinEurCents: number; totalMaxEurCents: number }, depositPercent: number = ONLINE_DEPOSIT_PERCENT): number {
  if (depositPercentIsFull(depositPercent) && totals.totalMinEurCents > 0 && totals.totalMinEurCents < totals.totalMaxEurCents) return totals.totalMinEurCents;
  return onlineDepositEurCents(totals.totalMaxEurCents, depositPercent);
}

/** "Tutto online": acconto al 100%. */
export function depositPercentIsFull(depositPercent: number): boolean {
  return depositPercent >= 100;
}

/**
 * Quanto si paga ora e quanto a lavoro finito con un modo online
 * (docs/changelog/2026-11-05-scheda-preventivo-semplice.md): il cliente non
 * capiva che online paga solo l'acconto. null per il pagamento diretto o
 * senza prezzo. Con una forbice il resto è "fino a". Stesso conto nella
 * scheda del preventivo e nel PDF.
 */
export function quotePaymentSplit(
  choice: JobPaymentChoice,
  totals: { totalMinEurCents: number; totalMaxEurCents: number },
  depositPercent: number,
): { nowEurCents: number; restMinEurCents: number; restMaxEurCents: number; restIsRange: boolean; restOnline: boolean; nowIsMinimum: boolean } | null {
  if (!paymentChoiceIsOnline(choice) || totals.totalMaxEurCents <= 0) return null;
  const now = quoteDepositEurCents(totals, depositPercent);
  return {
    nowEurCents: now,
    // "Tutto online" con la forbice: adesso il prezzo minimo (docs/changelog/2026-11-13-tutto-online-forbice.md).
    nowIsMinimum: depositPercentIsFull(depositPercent) && now === totals.totalMinEurCents && now < totals.totalMaxEurCents,
    restMinEurCents: Math.max(0, totals.totalMinEurCents - now),
    restMaxEurCents: Math.max(0, totals.totalMaxEurCents - now),
    restIsRange: totals.totalMinEurCents > 0 && totals.totalMinEurCents < totals.totalMaxEurCents,
    restOnline: choice === "ONLINE",
  };
}

/**
 * Il resto da pagare a lavoro finito: "da 56,00 € a 96,00 €" con la forbice,
 * "96,00 €" con un prezzo solo. Prima era "il resto, fino a 96,00 €" e chi
 * legge con fatica non capiva quanto avrebbe pagato
 * (docs/changelog/2026-11-08-prova-persone-simulate.md).
 */
export function quotePaymentRestText(split: { restMinEurCents: number; restMaxEurCents: number; restIsRange: boolean }): string {
  // Pagato adesso il minimo, il resto può anche essere zero: "fino a".
  if (split.restIsRange && split.restMinEurCents === 0 && split.restMaxEurCents > 0) return `fino a ${formatEurCents(split.restMaxEurCents)}`;
  return split.restIsRange && split.restMinEurCents < split.restMaxEurCents
    ? `da ${formatEurCents(split.restMinEurCents)} a ${formatEurCents(split.restMaxEurCents)}`
    : formatEurCents(split.restMaxEurCents);
}

/**
 * "10,00 € adesso, il resto (40,00 €) a lavoro finito con la stessa carta": il
 * modo di pagamento in una riga, con le cifre. Col saldo online si dice che
 * parte da solo sulla stessa carta: prima lo diceva solo la pagina di Stripe
 * (docs/changelog/2026-11-08-prova-persone-simulate.md).
 */
export function quotePaymentSplitLine(choice: JobPaymentChoice, totals: { totalMinEurCents: number; totalMaxEurCents: number }, depositPercent: number, only: boolean): string {
  const split = quotePaymentSplit(choice, totals, depositPercent);
  if (!split) return jobPaymentChoiceCopy(choice, depositPercent, only).title;
  if (split.restMaxEurCents === 0) {
    // Con la forbice si paga il massimo: si dice che la differenza torna
    // (richiesta di Luca, docs/changelog/2026-11-13-annullare-data-passata.md).
    return split.restIsRange
      ? `${formatEurCents(split.nowEurCents)} adesso con la carta, il prezzo massimo. Se il prezzo finale è più basso, la differenza ti torna sulla carta`
      : `${formatEurCents(split.nowEurCents)} adesso con la carta, tutto il prezzo`;
  }
  if (split.nowIsMinimum) {
    return `${formatEurCents(split.nowEurCents)} adesso con la carta, il prezzo minimo. Il resto (${quotePaymentRestText(split)}) a lavoro finito con la stessa carta, solo se il prezzo finale è più alto`;
  }
  return `${formatEurCents(split.nowEurCents)} adesso con la carta, il resto (${quotePaymentRestText(split)}) a lavoro finito ${split.restOnline ? "con la stessa carta" : "direttamente al professionista"}`;
}

/** Minimo che Stripe accetta per un pagamento con carta in euro (collaudo I-01). */
export const ONLINE_MIN_CHARGE_EUR_CENTS = 50;

/**
 * Acconto online troppo basso per Stripe: un preventivo da 0 € (o quasi) non
 * può offrire il pagamento online, altrimenti il cliente "paga" 0 € e il
 * lavoro non si conferma mai (collaudo I-01).
 */
export function onlineDepositTooLowProblem(input: { paymentOptions: readonly string[]; depositPercent: number; totalMaxEurCents: number }): string | null {
  if (!input.paymentOptions.some((choice) => choice === "ONLINE" || choice === "MIXED")) return null;
  if (onlineDepositEurCents(input.totalMaxEurCents, input.depositPercent) >= ONLINE_MIN_CHARGE_EUR_CENTS) return null;
  return "Con questo prezzo l'acconto online sarebbe sotto 0,50 €, il minimo per pagare con la carta: scegli il pagamento diretto o alza il prezzo.";
}

/**
 * Parte dell'importo finale che passa da Stripe. Col saldo diretto
 * (`MIXED`) è solo l'acconto, al massimo l'importo finale: il resto il
 * cliente lo paga al professionista fuori dal sito.
 */
export function onlineTargetEurCents(finalAmountEurCents: number, jp: { balanceDirect: boolean; depositEurCents: number | null }): number {
  return jp.balanceDirect ? Math.min(finalAmountEurCents, jp.depositEurCents ?? 0) : finalAmountEurCents;
}

/**
 * Quanto resta da pagare a lavoro chiuso (0 se l'acconto copre già l'importo
 * finale). `paidEurCents` è quanto il cliente ha pagato, **senza togliere i
 * rimborsi**: un rimborso concordato o una contestazione persa abbassano il
 * prezzo, non riaprono il saldo. Prima, dopo un rimborso di 30 € il cliente
 * si vedeva chiedere di nuovo 30 € (docs/changelog/2026-11-05-pagamenti-di-prova.md).
 */
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
  /** Rimborsi chiesti ma in attesa di fondi sul conto Stripe del professionista (§270). */
  refundWaitingEurCents: number;
  /** Importo finale (null finché il professionista non chiude il lavoro). */
  finalAmountEurCents: number | null;
  balanceDueEurCents: number;
  releaseDueAt: string | null;
  releasedAt: string | null;
  balanceUnpaid: boolean;
  /** Annullato dal cliente dentro il preavviso: l'acconto resta al professionista (§348). */
  depositKept: boolean;
  /** Solo per il professionista: trattenuta (con l'IVA, §378), e quanto riceve. */
  appFeeEurCents?: number;
  /** Costo della carta a suo carico: solo sui pagamenti di prima della trattenuta unica (§378). */
  stripeFeeEurCents?: number;
  payoutEurCents?: number;
  /**
   * Solo per il professionista, allo sblocco (collaudo F-21): parte che Stripe
   * aveva già preso dal suo saldo per rimborsi o contestazioni di altri
   * lavori, e debito di lavori precedenti ripreso prima del bonifico.
   */
  takenByStripeEurCents?: number;
  debtRecoveredEurCents?: number;
  /** Solo per il professionista: commissione di Stripe delle contestazioni su questo lavoro, sempre a suo carico. */
  disputeFeeEurCents?: number;
  /** Solo per il professionista: dov'è il bonifico verso la sua banca (null se non c'è nulla da ricevere). */
  payoutStatus?: JobPayoutStatus | null;
  /** Solo per il professionista: motivo del bonifico non riuscito, in parole di Stripe. */
  payoutFailureMessage?: string | null;
  /** Solo per il professionista: contestazione in banca su questo pagamento, con la sua spiegazione. */
  bankDispute?: ProfessionalBankDispute | null;
};

/**
 * Accettazione di un preventivo con il metodo di pagamento scelto e, se il
 * cliente la chiede, i dati per la fattura del professionista (§378).
 */
/** Somma delle commissioni di Stripe salvate per ogni contestazione. */
function disputeFeesEurCents(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.values(value as Record<string, unknown>).reduce<number>((sum, cents) => sum + (typeof cents === "number" && cents > 0 ? cents : 0), 0);
}

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
  releaseTakenByStripeEurCents?: number;
  releaseDebtRecoveredEurCents?: number;
  releaseDisputeFeeEurCents?: number;
  /** { "<id contestazione>": centesimi } della commissione di Stripe. */
  disputeFees?: unknown;
  releaseDueAt: Date | null;
  releasedAt: Date | null;
  balanceUnpaidAt: Date | null;
  depositKeptAt?: Date | null;
  refundWaitingEurCents?: number;
  stripeDestinationAccountId?: string | null;
  payoutPendingEurCents?: number;
  payoutSentEurCents?: number;
  payoutPaidAt?: Date | null;
  payoutFailedAt?: Date | null;
  payoutFailureMessage?: string | null;
  stripeDisputeId?: string | null;
  stripeDisputeStatus?: string | null;
  stripeDisputeDueBy?: Date | null;
  disputeProNote?: string | null;
  disputeProPhotoUrls?: string[];
  disputeProNoteAt?: Date | null;
};

/** Contestazione in banca vista dal professionista (null se non c'è). */
export function professionalBankDispute(jp: JobPaymentRow): ProfessionalBankDispute | null {
  if (!jp.stripeDisputeId) return null;
  const status = jp.stripeDisputeStatus ?? "needs_response";
  return {
    open: (BANK_DISPUTE_OPEN_STATUSES as readonly string[]).includes(status),
    status,
    dueBy: jp.stripeDisputeDueBy?.toISOString() ?? null,
    note: jp.disputeProNote ?? null,
    photoUrls: jp.disputeProPhotoUrls ?? [],
    noteAt: jp.disputeProNoteAt?.toISOString() ?? null,
  };
}

/** Dov'è il bonifico del professionista (docs/CHANGELOG.md §249). */
export function jobPayoutStatus(jp: JobPaymentRow): JobPayoutStatus | null {
  if (jp.paymentMethod !== "MANOVIA" || jp.onlineStage === "REFUNDED" || jp.onlineStage === "AWAITING_DEPOSIT") return null;
  if (!jp.releasedAt) return jp.paidEurCents - jp.refundedEurCents > 0 ? "BLOCKED" : null;
  // Vecchio modello (soldi in custodia, trasferimento allo sblocco): Stripe paga da solo.
  if (!jp.stripeDestinationAccountId) return jp.netAmountEurCents > 0 ? "SENT" : null;
  if ((jp.payoutPendingEurCents ?? 0) > 0) return jp.payoutFailedAt ? "FAILED" : "WAITING_FUNDS";
  if ((jp.payoutSentEurCents ?? 0) <= 0) return null;
  return jp.payoutPaidAt ? "PAID" : "SENT";
}

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
    refundWaitingEurCents: jp.refundWaitingEurCents ?? 0,
    finalAmountEurCents,
    balanceDueEurCents:
      method === "ONLINE" && onlineTarget !== null && stage !== "REFUNDED" && (stage !== "RELEASED" || !!jp.balanceUnpaidAt)
        ? onlineBalanceDueEurCents(onlineTarget, jp.paidEurCents)
        : 0,
    releaseDueAt: jp.releaseDueAt?.toISOString() ?? null,
    releasedAt: jp.releasedAt?.toISOString() ?? null,
    balanceUnpaid: !!jp.balanceUnpaidAt,
    depositKept: !!jp.depositKeptAt,
  };
  if (forProfessional && method === "ONLINE") {
    const target = onlineTarget ?? collected;
    // Prima dello sblocco conta solo quanto il cliente ha pagato davvero: un
    // saldo non ancora pagato non è nei "Bloccati" (collaudo F-04). Trattenuta
    // in proporzione, come allo sblocco con il saldo non pagato.
    const base = Math.min(target, collected);
    const balanceMissing = jp.paidEurCents < target;
    // Trattenuta unica con l'IVA (§378); `stripeFeeEurCents` solo sui pagamenti di prima.
    const fullFee = jp.platformFeeEurCents || onlineFeeWithVatEurCents(target);
    const appFee =
      stage === "RELEASED" ? jp.platformFeeEurCents : balanceMissing ? Math.round((fullFee * Math.max(0, collected)) / Math.max(1, target)) : fullFee;
    summary.appFeeEurCents = appFee;
    summary.stripeFeeEurCents = jp.stripeFeeEurCents;
    // Commissioni di Stripe delle contestazioni (collaudo F-21): allo sblocco
    // la parte tolta dai soldi di questo lavoro, prima tutte quelle prese.
    const disputeFees = disputeFeesEurCents(jp.disputeFees);
    summary.disputeFeeEurCents = stage === "RELEASED" ? (jp.releaseDisputeFeeEurCents ?? 0) : disputeFees;
    summary.payoutEurCents = stage === "RELEASED" ? jp.netAmountEurCents : Math.max(0, base - appFee - jp.stripeFeeEurCents - disputeFees);
    summary.takenByStripeEurCents = stage === "RELEASED" ? (jp.releaseTakenByStripeEurCents ?? 0) : 0;
    summary.debtRecoveredEurCents = stage === "RELEASED" ? (jp.releaseDebtRecoveredEurCents ?? 0) : 0;
    summary.payoutStatus = jobPayoutStatus(jp);
    summary.payoutFailureMessage = summary.payoutStatus === "FAILED" ? (jp.payoutFailureMessage ?? null) : null;
    summary.bankDispute = professionalBankDispute(jp);
  }
  return summary;
}

/**
 * Giorni dopo il primo pagamento oltre i quali avvisiamo il team Finanza di
 * un pagamento ancora bloccato: Stripe non tiene i soldi bloccati più di
 * 90 giorni e poi li manda comunque in banca al professionista
 * (docs/CHANGELOG.md §249).
 */
export const ONLINE_LONG_HOLD_ALERT_DAYS = 80;
export const ONLINE_MAX_HOLD_DAYS = 90;

/** Totali dei pagamenti online del professionista, per stato del bonifico (Dati fiscali e pagamenti, §249). */
export type ProfessionalPayoutTotals = {
  /** Pagati dal cliente, bloccati fino alla conferma. */
  blockedEurCents: number;
  /** Sbloccati, bonifico in preparazione (o da riprovare). */
  preparingEurCents: number;
  /** Bonifico partito, non ancora arrivato. */
  sentEurCents: number;
  /** Arrivati in banca. */
  paidEurCents: number;
  /** Contestati in banca e non ancora decisi: possono tornare al cliente, fuori da "bloccati" come nell'estratto. */
  disputedEurCents: number;
  /** Almeno un bonifico non è riuscito: dati bancari da controllare. */
  hasFailed: boolean;
};

export function professionalPayoutTotals(summaries: Array<JobPaymentSummary | null>): ProfessionalPayoutTotals {
  const totals: ProfessionalPayoutTotals = { blockedEurCents: 0, preparingEurCents: 0, sentEurCents: 0, paidEurCents: 0, disputedEurCents: 0, hasFailed: false };
  const pending: readonly string[] = [...BANK_DISPUTE_OPEN_STATUSES, ...BANK_DISPUTE_REVIEW_STATUSES];
  for (const summary of summaries) {
    const amount = summary?.payoutEurCents ?? 0;
    if (!summary || amount <= 0) continue;
    if (summary.bankDispute && pending.includes(summary.bankDispute.status)) {
      totals.disputedEurCents += amount;
      continue;
    }
    if (summary.payoutStatus === "BLOCKED") totals.blockedEurCents += amount;
    else if (summary.payoutStatus === "WAITING_FUNDS" || summary.payoutStatus === "FAILED") totals.preparingEurCents += amount;
    else if (summary.payoutStatus === "SENT") totals.sentEurCents += amount;
    else if (summary.payoutStatus === "PAID") totals.paidEurCents += amount;
    if (summary.payoutStatus === "FAILED") totals.hasFailed = true;
  }
  return totals;
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

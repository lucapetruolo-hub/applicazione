import {
  cancellationPhase,
  cancellationTerms,
  freeCancellationDeadline,
  type CancellationPhase,
  type CancellationTerms,
} from "./cancellationNotice";
import { paymentChoiceIsOnline, quotePaymentSplit, quotePaymentSplitLine, type JobPaymentChoice } from "./onlinePayments";

/**
 * Cosa ha letto il cliente su annullare e acconto quando ha accettato un
 * preventivo, salvato sul lavoro (`Booking.acceptedTerms`,
 * docs/changelog/2026-11-13-annullare-pagina-aperta.md): frasi, cifre, ora di
 * lettura e ora di accettazione. Serve come prova (Codice del consumo, art. 49)
 * e a decidere l'acconto se il cliente annulla tardi.
 */

/** I momenti in cui si può ancora accettare: a fascia finita il preventivo non si accetta più. */
export const ACCEPTABLE_CANCELLATION_PHASES = ["free", "late", "started"] as const satisfies readonly CancellationPhase[];
export type AcceptableCancellationPhase = (typeof ACCEPTABLE_CANCELLATION_PHASES)[number];

/** Il cliente ha letto "gratuito fino a…" ma intanto il preavviso è iniziato. */
export const CANCELLATION_TERMS_EXPIRED_MESSAGE = "Il tempo per annullare gratis è appena scaduto: rileggi e conferma.";
/** Il cliente ha letto "mancano meno di…" ma intanto l'appuntamento è iniziato. */
export const APPOINTMENT_JUST_STARTED_MESSAGE = "L'appuntamento è appena iniziato: rileggi e conferma.";
/** Codice dell'errore 409, per riconoscerlo sul sito. */
export const CANCELLATION_TERMS_CHANGED_CODE = "CANCELLATION_TERMS_CHANGED";

const PHASE_ORDER: Record<CancellationPhase, number> = { free: 0, late: 1, started: 2, over: 3 };

/**
 * Il messaggio da dare se, tra la lettura e "Accetta", il momento è passato a
 * uno peggiore per il cliente; null se quello che ha letto vale ancora.
 */
export function cancellationTermsChangedMessage(seen: AcceptableCancellationPhase, current: CancellationPhase): string | null {
  if (PHASE_ORDER[current] <= PHASE_ORDER[seen]) return null;
  if (current === "late") return CANCELLATION_TERMS_EXPIRED_MESSAGE;
  return APPOINTMENT_JUST_STARTED_MESSAGE;
}

/** Cosa mandano sito e app con "Accetta": il momento letto e da quando era sullo schermo. */
export type SeenCancellationTerms = { phase: AcceptableCancellationPhase; at: string };

export type AcceptedTerms = {
  version: 1;
  /** Momento che il cliente aveva davanti premendo "Accetta" (null: sito o app vecchi che non lo mandano). */
  phaseSeen: AcceptableCancellationPhase | null;
  /** Momento quando il lavoro è nato (con l'acconto online, a pagamento riuscito). */
  phaseAtAcceptance: CancellationPhase;
  /** Le due righe lette, come le mostra il riepilogo prima di "Accetta". */
  notice: string | null;
  money: string | null;
  /** Il modo di pagamento in una riga, con le cifre. */
  payment: string;
  paymentMethod: JobPaymentChoice;
  nowEurCents: number;
  lateCancelKeepsDeposit: boolean;
  cancellationNoticeHours: number;
  /** Fine dell'annullamento gratuito, ora "di parete" come scheduledAt. */
  freeCancellationUntil: string;
  /**
   * Il cliente ha letto "gratuito fino a…" e il lavoro è nato dopo quella
   * scadenza (pagamento finito su Stripe oltre l'ora): non ha mai potuto
   * annullare gratis, quindi l'acconto gli torna anche annullando tardi.
   */
  depositRefundedIfLate: boolean;
  seenAt: string | null;
  acceptedAt: string;
};

export function buildAcceptedTerms(input: {
  start: Date | string;
  end?: Date | string | null;
  hours: number;
  lateCancelKeepsDeposit: boolean;
  paymentMethod: JobPaymentChoice;
  totals: { totalMinEurCents: number; totalMaxEurCents: number };
  depositPercent: number;
  onlyPaymentOption: boolean;
  phaseSeen?: AcceptableCancellationPhase | null;
  seenAt?: Date | string | null;
  now?: Date;
}): AcceptedTerms {
  const now = input.now ?? new Date();
  const phaseAtAcceptance = cancellationPhase(input.start, input.end, input.hours, now);
  const phaseSeen = input.phaseSeen ?? null;
  const split = quotePaymentSplit(input.paymentMethod, input.totals, input.depositPercent);
  const online = paymentChoiceIsOnline(input.paymentMethod) && !!split && split.nowEurCents > 0;
  const terms: CancellationTerms = cancellationTerms({
    phase: phaseSeen ?? phaseAtAcceptance,
    start: input.start,
    hours: input.hours,
    money: !online || !split
      ? { kind: "none" }
      : { kind: input.lateCancelKeepsDeposit ? "kept" : "refunded", eurCents: split.nowEurCents, full: split.restMaxEurCents === 0 },
    stage: "offer",
    audience: "client",
  });
  return {
    version: 1,
    phaseSeen,
    phaseAtAcceptance,
    notice: terms.notice?.text ?? null,
    money: terms.money?.text ?? null,
    payment: quotePaymentSplitLine(input.paymentMethod, input.totals, input.depositPercent, input.onlyPaymentOption),
    paymentMethod: input.paymentMethod,
    nowEurCents: online && split ? split.nowEurCents : 0,
    lateCancelKeepsDeposit: input.lateCancelKeepsDeposit === true,
    cancellationNoticeHours: input.hours,
    freeCancellationUntil: freeCancellationDeadline(input.start, input.hours).toISOString(),
    depositRefundedIfLate: input.lateCancelKeepsDeposit === true && phaseSeen === "free" && phaseAtAcceptance !== "free",
    seenAt: input.seenAt ? new Date(input.seenAt).toISOString() : null,
    acceptedAt: now.toISOString(),
  };
}

/**
 * L'acconto resta al professionista se il cliente annulla tardi? Sì se il
 * preventivo lo diceva, tranne quando il cliente non ha mai avuto il tempo di
 * annullare gratis (`depositRefundedIfLate`).
 */
export function depositKeptOnLateCancel(lateCancelKeepsDeposit: boolean | null | undefined, acceptedTerms: unknown): boolean {
  if (!lateCancelKeepsDeposit) return false;
  if (acceptedTerms && typeof acceptedTerms === "object" && (acceptedTerms as { depositRefundedIfLate?: unknown }).depositRefundedIfLate === true) return false;
  return true;
}
